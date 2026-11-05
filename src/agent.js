// The treasurer agent. One run:
//   1. pulls incoming payments and invoice states from PayPal
//   2. classifies each new payment (what is it for?) and matches it to member(s)
//   3. applies confident matches, and turns everything else into proposals:
//      match (needs a human look), refund (duplicate, overpayment, not club income), review,
//      reminder (PayPal invoice, or a /remind on the existing one)
// Proposals are executed only when the treasurer approves them.
import { matchPayment } from './ai/matcher.js';
import { IntentClassifier } from './ai/intent.js';
import { computeLedger, outstandingMap } from './ledger.js';
import { newId, round2, money } from './util.js';

const DAY = 86_400_000;

export class TreasurerAgent {
  constructor({ store, paypal, embedder, now = () => new Date() }) {
    this.store = store;
    this.paypal = paypal;
    this.embedder = embedder;
    this.intent = new IntentClassifier(embedder);
    this.now = now;
  }

  get data() { return this.store.data; }

  async run() {
    const d = this.data;
    const s = d.settings;
    const counts = { newPayments: 0, autoMatched: 0, proposals: 0, steps: [] };
    // Each step is reported to the UI, which plays it back as the agent-run timeline.
    const step = async (fields, fn) => {
      const t0 = performance.now();
      const extra = await fn();
      counts.steps.push({ ...fields, ...extra, ms: Math.round(performance.now() - t0) });
    };
    const before = new Set(d.proposals.map((p) => p.id));

    // 1. PayPal -> local state.
    await step({ key: 'invoices', label: 'Checked invoice status', api: 'GET /v2/invoicing/invoices' }, async () => {
      const invoices = await this.paypal.listInvoices();
      this.syncInvoices(invoices);
      const paid = invoices.filter((i) => i.status === 'PAID').length;
      return { count: invoices.length, detail: invoices.length ? `${plural(invoices.length, 'invoice')}, ${paid} paid` : 'No invoices yet' };
    });
    await step({ key: 'transactions', label: 'Fetched incoming payments', api: 'GET /v1/reporting/transactions' }, async () => {
      const txs = await this.paypal.listTransactions({ start: `${s.periodStart}T00:00:00Z`, end: this.now() });
      for (const tx of txs) if (this.upsertPayment(tx)) counts.newPayments++;
      this.paidInvoicesWithoutTransaction();
      return { count: txs.length, detail: `${plural(txs.length, 'payment')}, ${counts.newPayments} new` };
    });

    // 2 + 3. New payments, oldest first so "already paid" is judged in order.
    const fresh = d.payments.filter((p) => p.status === 'unmatched' && !p.reviewed).sort((a, b) => a.date.localeCompare(b.date));
    await step({ key: 'match', label: 'Read notes and matched members', api: `AI: ${this.embedder.name === 'local-model' ? 'on-server language model' : 'hashed n-gram model'} + evidence matcher` }, async () => {
      for (const p of fresh) {
        const r = await this.handlePayment(p);
        counts.autoMatched += r.auto ? 1 : 0;
        counts.proposals += r.proposals;
      }
      const tally = {};
      for (const p of fresh) if (p.intent) tally[p.intent.label] = (tally[p.intent.label] || 0) + 1;
      const kinds = Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ');
      return { count: counts.autoMatched, detail: fresh.length ? `${kinds} · ${counts.autoMatched} booked automatically (≥ ${Math.round(s.autoApplyThreshold * 100)}%)` : 'Nothing new to match' };
    });

    await step({ key: 'plan', label: 'Planned next steps', api: 'Needs your approval' }, async () => {
      counts.proposals += this.planReminders();
      const created = d.proposals.filter((p) => !before.has(p.id));
      const by = (t) => created.filter((p) => p.type === t).length;
      const parts = [[by('match') + by('review'), 'to check'], [by('refund'), by('refund') === 1 ? 'refund' : 'refunds'], [by('reminder'), by('reminder') === 1 ? 'invoice to send' : 'invoices to send']].filter(([n]) => n).map(([n, l]) => `${n} ${l}`);
      return { count: created.length, detail: parts.length ? parts.join(' · ') : 'Nothing needs you' };
    });
    this.store.log('agent', `Agent run: ${plural(counts.newPayments, 'new payment')}, ${counts.autoMatched} matched automatically, ${plural(counts.proposals, 'new proposal')}`);
    this.store.save();
    return counts;
  }

  syncInvoices(invoices) {
    const d = this.data;
    for (const inv of invoices) {
      if (!inv.memberId || !d.members.some((m) => m.id === inv.memberId)) continue;
      const local = d.invoices.find((i) => i.id === inv.id);
      if (local) {
        if (local.status !== inv.status) this.store.log('paypal', `Invoice ${inv.id} is now ${inv.status}`);
        local.status = inv.status;
        local.url = inv.url || local.url;
      } else {
        d.invoices.push({ ...inv, reminders: inv.reminders || 0, sentAt: null, lastReminderAt: null });
      }
    }
  }

  // Returns true if the transaction was new.
  upsertPayment(tx) {
    const d = this.data;
    if (d.payments.some((p) => p.id === tx.id)) return false;
    // A synthetic payment recorded from a PAID invoice gets its real transaction id.
    if (tx.invoiceId) {
      const synthetic = d.payments.find((p) => p.id === `invoice:${tx.invoiceId}`);
      if (synthetic) { synthetic.id = tx.id; synthetic.date = tx.date; return false; }
    }
    d.payments.push({
      ...tx, refunded: 0, source: tx.invoiceId ? 'invoice' : 'paypal',
      status: 'unmatched', allocations: [], match: null, intent: null, reviewed: false,
    });
    return true;
  }

  // Sandbox Transaction Search can lag by hours; a PAID invoice already tells us who paid.
  paidInvoicesWithoutTransaction() {
    const d = this.data;
    for (const inv of d.invoices) {
      if (inv.status !== 'PAID') continue;
      if (d.payments.some((p) => p.invoiceId === inv.id)) continue;
      const m = d.members.find((x) => x.id === inv.memberId);
      d.payments.push({
        id: `invoice:${inv.id}`, date: this.now().toISOString(), payerName: m?.name || inv.recipientEmail,
        payerEmail: inv.recipientEmail, amount: inv.amount, currency: inv.currency, note: `Invoice ${inv.id}`,
        invoiceId: inv.id, refunded: 0, source: 'invoice', status: 'unmatched', allocations: [], match: null, intent: null, reviewed: false,
      });
    }
  }

  async handlePayment(p) {
    const d = this.data;
    const s = d.settings;
    let proposals = 0;

    // Payments of our own invoices need no guessing.
    const inv = p.invoiceId && d.invoices.find((i) => i.id === p.invoiceId);
    if (inv) {
      const m = d.members.find((x) => x.id === inv.memberId);
      p.intent = { label: 'dues', score: 0.99 };
      p.match = { kind: 'invoice', confidence: 0.99, allocations: [{ memberId: m.id, memberName: m.name, amount: p.amount }], reasons: [`Paid through PayPal invoice ${inv.id}`], alternatives: [] };
      this.applyAllocations(p, p.match.allocations, 'agent');
      inv.status = 'PAID';
      this.store.log('agent', `${m.name} paid invoice ${inv.id} (${money(p.amount, p.currency)})`);
      return { auto: true, proposals };
    }

    p.intent = await this.intent.classify(p.note);
    const match = matchPayment(p, d.members, { outstanding: outstandingMap(d) });
    p.match = match;
    const top = match.allocations[0];
    const member = top && d.members.find((m) => m.id === top.memberId);
    const nonDues = p.intent.label !== 'dues' && p.intent.score >= 0.6;

    // Not dues and not from a known member: probably money for something else, or sent by mistake.
    if (nonDues && match.confidence < 0.5) {
      p.status = 'needs_review';
      proposals += this.propose({
        type: 'refund', paymentId: p.id, amount: p.amount, confidence: p.intent.score,
        title: `Refund ${money(p.amount, p.currency)} to ${p.payerName}?`,
        detail: `${p.payerName} isn't a member. Their note "${p.note}" looks like ${labelText(p.intent.label)}, not dues.`,
        message: `Hi ${first(p.payerName)}, thanks for your ${money(p.amount, p.currency)} ("${p.note}"). It didn't match a ${s.clubName} membership, so we've sent it back. If it was meant for us, just reply and we'll sort it out.`,
      });
      return { auto: false, proposals };
    }

    if (match.kind === 'duplicate' && member) {
      p.status = 'needs_review';
      const prev = d.payments.find((x) => x.status === 'matched' && x.allocations.some((a) => a.memberId === member.id));
      proposals += this.propose({
        type: 'refund', paymentId: p.id, memberId: member.id, amount: p.amount, confidence: match.confidence,
        title: `Refund ${member.name}'s double payment (${money(p.amount, p.currency)})`,
        detail: `${first(member.name)} already paid ${prev ? `${money(prev.amount, prev.currency)} on ${day(prev.date)}` : 'this season'}. This second payment on ${day(p.date)} looks like a repeat.`,
        message: `Hi ${first(member.name)}, you paid your ${s.period} dues twice, so we've sent ${money(p.amount, p.currency)} back. Thanks for being so quick!`,
      });
      return { auto: false, proposals };
    }

    if (match.confidence >= s.autoApplyThreshold) {
      const allocs = match.allocations;
      this.applyAllocations(p, allocs, 'agent');
      this.store.log('agent', `Matched ${money(p.amount, p.currency)} from ${p.payerName} to ${allocs.map((a) => a.memberName).join(' + ')} (${Math.round(match.confidence * 100)}%)`);
      proposals += this.overpaymentRefund(p, member, match);
      return { auto: true, proposals };
    }

    if (match.confidence >= 0.4) {
      p.status = 'needs_review';
      proposals += this.propose({
        type: 'match', paymentId: p.id, memberId: member?.id, amount: p.amount, confidence: match.confidence,
        title: `Is ${p.payerName}'s ${money(p.amount, p.currency)} for ${listNames(match.allocations.map((a) => a.memberName))}?`,
        detail: `The note says "${p.note || '(no note)'}". ${match.reasons.map((r) => r.replace(/ \(family member\?\)/, '')).join('. ')}.`,
      });
      return { auto: false, proposals };
    }

    p.status = 'needs_review';
    proposals += this.propose({
      type: 'review', paymentId: p.id, amount: p.amount, confidence: 1 - match.confidence,
      title: `Who is ${p.payerName}'s ${money(p.amount, p.currency)} for?`,
      detail: `No member fits the note "${p.note || '(no note)'}". Pick the member yourself, or keep it as other club income.`,
    });
    return { auto: false, proposals };
  }

  overpaymentRefund(p, member, match) {
    if (match.kind !== 'overpaid' || !member) return 0;
    const allocated = match.allocations.reduce((s, a) => s + a.amount, 0);
    const surplus = round2(p.amount - allocated);
    if (surplus <= 0) return 0;
    return this.propose({
      type: 'refund', paymentId: p.id, memberId: member.id, amount: surplus, confidence: match.confidence,
      title: `Refund ${money(surplus, p.currency)} overpayment to ${member.name}`,
      detail: `${member.name} owed ${money(allocated, p.currency)} but sent ${money(p.amount, p.currency)}.`,
      message: `Hi ${first(member.name)}, you sent ${money(surplus, p.currency)} more than your dues, so we've refunded the difference.`,
    });
  }

  planReminders() {
    const d = this.data;
    const s = d.settings;
    const now = this.now().getTime();
    let n = 0;
    for (const m of computeLedger(d)) {
      if (m.outstanding <= 0) continue;
      if (d.proposals.some((p) => p.type === 'reminder' && p.memberId === m.id && p.status === 'pending')) continue;
      // Someone whose payment is waiting for review shouldn't get chased.
      if (d.proposals.some((p) => p.status === 'pending' && p.type === 'match' &&
        d.payments.find((x) => x.id === p.paymentId)?.match?.allocations.some((a) => a.memberId === m.id))) continue;
      const inv = d.invoices.filter((i) => i.memberId === m.id && i.status !== 'CANCELLED').at(-1);
      if (inv && inv.status === 'PAID') continue;
      const last = inv && (inv.lastReminderAt || inv.sentAt);
      if (last && now - new Date(last).getTime() < (s.reminderIntervalDays ?? 7) * DAY) continue;
      const count = inv ? inv.reminders + 1 : 0;
      n += this.propose({
        type: 'reminder', memberId: m.id, amount: m.outstanding, invoiceId: inv?.id || null, confidence: 0.95,
        title: inv ? `Send ${m.name} reminder ${count}` : `Send ${m.name} a ${money(m.outstanding, s.currency)} dues invoice`,
        detail: inv
          ? `PayPal invoice ${inv.id} is still unpaid. Reminder ${count}, ${tone(count)} tone.`
          : m.status === 'partial'
            ? `Paid ${money(m.paid, s.currency)} of ${money(m.dues, s.currency)}, so this invoice is for the remaining ${money(m.outstanding, s.currency)}.`
            : `No payment yet. Dues are due ${day(s.dueDate)}.`,
        message: reminderText(m, s, count),
      });
    }
    return n;
  }

  propose(p) {
    const d = this.data;
    // One pending proposal per (type, payment, member).
    if (d.proposals.some((x) => x.status === 'pending' && x.type === p.type && x.paymentId === (p.paymentId ?? null) && x.memberId === (p.memberId ?? null))) return 0;
    d.proposals.unshift({
      id: newId('p'), status: 'pending', paymentId: null, memberId: null, amount: null, message: null,
      invoiceId: null, result: null, receipt: null, createdAt: this.now().toISOString(), decidedAt: null, ...p,
    });
    return 1;
  }

  applyAllocations(p, allocations, by) {
    p.allocations = allocations.map((a) => ({ memberId: a.memberId, memberName: a.memberName, amount: round2(a.amount) }));
    p.status = allocations.length ? 'matched' : 'ignored';
    p.reviewed = true;
    p.matchedBy = by;
  }

  // Remember who pays for whom, so next time it's an instant match.
  learnAlias(p) {
    for (const a of p.allocations) {
      const m = this.data.members.find((x) => x.id === a.memberId);
      if (!m) continue;
      if (m.email && p.payerEmail && m.email.toLowerCase() === p.payerEmail.toLowerCase()) continue;
      m.payerAliases = m.payerAliases || [];
      if (!m.payerAliases.some((x) => x.email === p.payerEmail && x.name === p.payerName)) {
        m.payerAliases.push({ name: p.payerName, email: p.payerEmail });
      }
    }
  }

  async approve(id, { message } = {}) {
    const d = this.data;
    const prop = d.proposals.find((p) => p.id === id);
    if (!prop) throw httpError(404, 'Proposal not found');
    if (prop.status !== 'pending') throw httpError(409, `Proposal is already ${prop.status}`);
    if (typeof message === 'string' && message.trim()) prop.message = message.trim();
    const pay = prop.paymentId && d.payments.find((p) => p.id === prop.paymentId);
    try {
      if (prop.type === 'match') {
        this.applyAllocations(pay, pay.match.allocations, 'treasurer');
        this.learnAlias(pay);
        prop.result = `Matched to ${pay.allocations.map((a) => a.memberName).join(' + ')}`;
      } else if (prop.type === 'refund') {
        const r = await this.paypal.refundCapture(pay.id, { amount: prop.amount, currency: pay.currency, note: prop.message });
        pay.refunded = round2((pay.refunded || 0) + prop.amount);
        if (pay.refunded >= pay.amount) { pay.status = 'refunded'; pay.reviewed = true; pay.allocations = []; }
        prop.result = `PayPal refund ${r.id} ${r.status}`;
        prop.receipt = { api: 'Payments v2 · captures/refund', id: r.id, status: r.status };
        this.store.log('paypal', `Refunded ${money(prop.amount, pay.currency)} to ${pay.payerName} (refund ${r.id})`);
      } else if (prop.type === 'reminder') {
        prop.result = await this.sendReminder(prop);
      } else if (prop.type === 'review') {
        if (pay) { pay.status = 'ignored'; pay.reviewed = true; }
        prop.result = 'Kept as other income';
      }
      prop.status = 'done';
    } catch (e) {
      prop.status = 'failed';
      prop.result = e.message;
      this.store.log('error', e.message);
    }
    prop.decidedAt = this.now().toISOString();
    this.store.log('user', `Approved: ${prop.title}`);
    this.store.save();
    return prop;
  }

  async sendReminder(prop) {
    const d = this.data;
    const s = d.settings;
    const m = d.members.find((x) => x.id === prop.memberId);
    const inv = prop.invoiceId && d.invoices.find((i) => i.id === prop.invoiceId);
    const nowIso = this.now().toISOString();
    if (inv) {
      await this.paypal.remindInvoice(inv.id, { subject: `Reminder: ${s.clubName} dues`, note: prop.message });
      inv.reminders = (inv.reminders || 0) + 1;
      inv.lastReminderAt = nowIso;
      this.store.log('paypal', `Sent reminder ${inv.reminders} for invoice ${inv.id} to ${m.name}`);
      prop.receipt = { api: 'Invoicing v2 · remind', id: inv.id, status: 'SENT' };
      return `PayPal reminder sent for ${inv.id}`;
    }
    const created = await this.paypal.createAndSendInvoice({
      member: m, amount: prop.amount, currency: s.currency, note: prop.message,
      clubName: s.clubName, period: s.period, dueDate: s.dueDate,
    });
    d.invoices.push({ ...created, reminders: 0, sentAt: nowIso, lastReminderAt: null });
    this.store.log('paypal', `Sent PayPal invoice ${created.id} to ${m.name} (${money(prop.amount, s.currency)})`);
    prop.receipt = { api: 'Invoicing v2 · create + send', id: created.id, status: created.status || 'SENT' };
    return `PayPal invoice ${created.id} sent`;
  }

  reject(id) {
    const d = this.data;
    const prop = d.proposals.find((p) => p.id === id);
    if (!prop) throw httpError(404, 'Proposal not found');
    if (prop.status !== 'pending') throw httpError(409, `Proposal is already ${prop.status}`);
    prop.status = 'rejected';
    prop.decidedAt = this.now().toISOString();
    const pay = prop.paymentId && d.payments.find((p) => p.id === prop.paymentId);
    if (pay && pay.status === 'needs_review') {
      // Refund rejected -> keep the money as other income. Match rejected -> treasurer assigns by hand.
      if (prop.type === 'refund') pay.status = 'ignored';
      else pay.status = 'unmatched';
      pay.reviewed = true;
    }
    this.store.log('user', `Rejected: ${prop.title}`);
    this.store.save();
    return prop;
  }

  assign(paymentId, allocations) {
    const d = this.data;
    const pay = d.payments.find((p) => p.id === paymentId);
    if (!pay) throw httpError(404, 'Payment not found');
    const allocs = (allocations || []).map((a) => {
      const m = d.members.find((x) => x.id === a.memberId);
      if (!m) throw httpError(400, `Unknown member ${a.memberId}`);
      const amount = Number(a.amount);
      if (!(amount > 0)) throw httpError(400, 'Allocation amounts must be positive');
      return { memberId: m.id, memberName: m.name, amount };
    });
    const total = round2(allocs.reduce((s, a) => s + a.amount, 0));
    if (total > round2(pay.amount - (pay.refunded || 0)) + 0.001) throw httpError(400, 'Allocations exceed the payment amount');
    this.applyAllocations(pay, allocs, 'treasurer');
    this.learnAlias(pay);
    for (const prop of d.proposals) {
      if (prop.paymentId === pay.id && prop.status === 'pending') {
        prop.status = 'rejected'; prop.result = 'Resolved manually'; prop.decidedAt = this.now().toISOString();
      }
    }
    this.store.log('user', allocs.length ? `Assigned ${money(pay.amount, pay.currency)} from ${pay.payerName} to ${allocs.map((a) => a.memberName).join(' + ')}` : `Marked payment from ${pay.payerName} as other income`);
    this.store.save();
    return pay;
  }
}

function reminderText(m, s, count) {
  const name = first(m.name);
  const amount = money(m.outstanding, s.currency);
  if (count === 0) {
    return `Hi ${name}, a quick reminder from ${s.clubName}: your ${s.period} dues of ${amount} are due ${day(s.dueDate)}. You can pay straight from this invoice. Thanks!`;
  }
  if (count === 1) {
    return `Hi ${name}, a friendly nudge: the ${amount} for ${s.period} hasn't come in yet. The invoice link is below. If you've already paid, just reply and we'll sort it out.`;
  }
  return `Hi ${name}, your ${s.period} dues of ${amount} are now overdue (reminder ${count}). Please pay this week, or talk to us if something's up. We'd rather find a solution than lose you.`;
}

const day = (iso) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const listNames = (n) => (n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n.at(-1)}`);
const tone = (count) => (count <= 1 ? 'friendly' : 'firm');
const first = (name) => String(name || '').split(' ')[0];
const labelText = (l) => ({ event: 'an event payment', donation: 'a donation', other: 'something else' }[l] || l);

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
