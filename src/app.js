// Express app factory (server.js starts it; tests call it directly).
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { seedClub } from './seed.js';
import { TreasurerAgent, httpError } from './agent.js';
import { computeLedger } from './ledger.js';
import { randomPayment } from './demo.js';
import { newId, round2, money } from './util.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function buildState(data, paypal, embedder, adminRequired) {
  const members = computeLedger(data).map((m) => {
    const inv = data.invoices.filter((i) => i.memberId === m.id).at(-1);
    return { ...m, invoice: inv ? { id: inv.id, status: inv.status, reminders: inv.reminders || 0, url: inv.url || null } : null };
  });
  const payments = [...data.payments].sort((a, b) => b.date.localeCompare(a.date)).map((p) => ({
    id: p.id, date: p.date, payerName: p.payerName, payerEmail: p.payerEmail, amount: p.amount,
    refunded: p.refunded || 0, currency: p.currency, note: p.note, source: p.source, intent: p.intent,
    status: p.status, allocations: p.allocations, match: p.match, invoiceId: p.invoiceId || null,
  }));
  const count = (s) => members.filter((m) => m.status === s).length;
  return {
    mode: {
      paypal: paypal.kind,
      ai: embedder.name,
      aiModel: embedder.model,
      aiStatus: embedder.status,
      adminRequired,
    },
    settings: data.settings,
    summary: {
      members: members.length,
      paid: count('paid'), partial: count('partial'), unpaid: count('unpaid'), overpaid: count('overpaid'),
      expected: round2(members.reduce((s, m) => s + m.dues, 0)),
      collected: round2(members.reduce((s, m) => s + Math.min(m.paid, m.dues), 0)),
      openProposals: data.proposals.filter((p) => p.status === 'pending').length,
      unmatchedPayments: payments.filter((p) => p.status === 'unmatched' || p.status === 'needs_review').length,
    },
    members,
    payments,
    proposals: data.proposals,
    log: data.log.slice(0, 100),
  };
}

export function createApp({ paypal, embedder, dataFile, adminToken, now } = {}) {
  const store = new Store(dataFile, seedClub);
  store.load();
  const agent = new TreasurerAgent({ store, paypal, embedder, now });
  const app = express();
  app.use(express.json({ limit: '200kb' }));
  app.use(express.static(PUBLIC));

  const state = () => buildState(store.data, paypal, embedder, Boolean(adminToken));
  const guard = (req, res, next) => {
    if (adminToken && req.get('x-admin-token') !== adminToken) return res.status(401).json({ error: 'Admin token required' });
    next();
  };
  const mockOnly = (req, res, next) => {
    if (paypal.kind !== 'mock') return res.status(400).json({ error: 'Only available with the mock PayPal client' });
    next();
  };
  // One write at a time: agent runs and approvals touch the same state.
  let chain = Promise.resolve();
  const serial = (fn) => (req, res) => {
    chain = chain.then(async () => {
      try { await fn(req, res); } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
      }
    });
  };

  app.get('/api/health', (req, res) => res.json({ ok: true, paypal: paypal.kind, ai: embedder.name }));
  app.get('/api/state', (req, res) => res.json(state()));

  app.post('/api/agent/run', guard, serial(async (req, res) => {
    const counts = await agent.run();
    res.json({ ...state(), lastRun: counts });
  }));
  app.post('/api/proposals/approve-all', guard, serial(async (req, res) => {
    const type = req.body?.type;
    const ids = store.data.proposals.filter((p) => p.status === 'pending' && (!type || p.type === type) && p.type !== 'review').map((p) => p.id);
    for (const id of ids) await agent.approve(id);
    res.json(state());
  }));
  app.post('/api/proposals/:id/approve', guard, serial(async (req, res) => {
    await agent.approve(req.params.id, { message: req.body?.message });
    res.json(state());
  }));
  app.post('/api/proposals/:id/reject', guard, serial(async (req, res) => {
    agent.reject(req.params.id);
    res.json(state());
  }));
  app.post('/api/payments/:id/assign', guard, serial(async (req, res) => {
    agent.assign(req.params.id, req.body?.allocations || []);
    res.json(state());
  }));

  app.post('/api/members', guard, serial(async (req, res) => {
    const { name, email = '', nicknames = [], dues } = req.body || {};
    if (!name || !String(name).trim()) throw httpError(400, 'Name is required');
    store.data.members.push({
      id: newId('m'), name: String(name).trim(), email: String(email).trim(),
      nicknames: cleanList(nicknames), dues: dues === undefined || dues === '' ? store.data.settings.defaultDues : positive(dues),
      joined: new Date().toISOString().slice(0, 10),
    });
    store.log('user', `Added member ${name}`);
    store.save();
    res.json(state());
  }));
  app.put('/api/members/:id', guard, serial(async (req, res) => {
    const m = store.data.members.find((x) => x.id === req.params.id);
    if (!m) throw httpError(404, 'Member not found');
    const b = req.body || {};
    if (b.name !== undefined) m.name = String(b.name).trim() || m.name;
    if (b.email !== undefined) m.email = String(b.email).trim();
    if (b.nicknames !== undefined) m.nicknames = cleanList(b.nicknames);
    if (b.dues !== undefined) m.dues = positive(b.dues);
    store.save();
    res.json(state());
  }));
  app.delete('/api/members/:id', guard, serial(async (req, res) => {
    const i = store.data.members.findIndex((x) => x.id === req.params.id);
    if (i < 0) throw httpError(404, 'Member not found');
    const [m] = store.data.members.splice(i, 1);
    store.log('user', `Removed member ${m.name}`);
    store.save();
    res.json(state());
  }));
  app.put('/api/settings', guard, serial(async (req, res) => {
    const allowed = ['clubName', 'period', 'periodStart', 'dueDate', 'currency', 'defaultDues', 'autoApplyThreshold', 'reminderIntervalDays'];
    for (const k of allowed) if (req.body?.[k] !== undefined) store.data.settings[k] = req.body[k];
    store.save();
    res.json(state());
  }));

  app.get('/api/export.csv', (req, res) => {
    const rows = [['Name', 'Email', 'Dues', 'Paid', 'Outstanding', 'Status', 'Last payment', 'Invoice', 'Invoice status']];
    for (const m of state().members) {
      rows.push([m.name, m.email, m.dues, m.paid, m.outstanding, m.status, m.lastPaymentAt?.slice(0, 10) || '', m.invoice?.id || '', m.invoice?.status || '']);
    }
    const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n');
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="members.csv"');
    res.send(`﻿${csv}\n`);
  });

  app.post('/api/demo/simulate-payment', guard, mockOnly, serial(async (req, res) => {
    const b = req.body || {};
    const base = b.payerName && b.amount ? {} : randomPayment(store.data.members, computeLedger(store.data));
    const tx = paypal.simulateIncoming({
      payerName: b.payerName || base.payerName,
      payerEmail: b.payerEmail ?? base.payerEmail ?? '',
      amount: Number(b.amount || base.amount),
      note: b.note ?? base.note ?? '',
      currency: store.data.settings.currency,
    });
    store.log('paypal', `Incoming PayPal payment: ${money(tx.amount, tx.currency)} from ${tx.payerName} ("${tx.note}")`);
    // Like a PayPal webhook would: sync and match right away.
    const counts = await agent.run();
    res.json({ ...state(), simulated: tx, lastRun: counts });
  }));
  app.post('/api/demo/pay-invoice/:invoiceId', guard, mockOnly, serial(async (req, res) => {
    const inv = store.data.invoices.find((i) => i.id === req.params.invoiceId);
    if (!inv) throw httpError(404, 'Invoice not found');
    const m = store.data.members.find((x) => x.id === inv.memberId);
    paypal.simulatePayInvoice(inv.id, m);
    store.log('paypal', `${m?.name || 'Member'} paid PayPal invoice ${inv.id}`);
    await agent.run();
    res.json(state());
  }));
  app.post('/api/demo/reset', guard, mockOnly, serial(async (req, res) => {
    paypal.reset(true);
    store.reset();
    store.log('user', 'Demo reset');
    store.save();
    res.json(state());
  }));

  // PayPal webhooks (e.g. PAYMENT.CAPTURE.COMPLETED, INVOICING.INVOICE.PAID) trigger a sync.
  app.post('/api/webhooks/paypal', serial(async (req, res) => {
    const ok = paypal.kind === 'mock' || (await paypal.verifyWebhook(lowerHeaders(req.headers), req.body));
    if (!ok) throw httpError(400, 'Webhook signature not verified');
    store.log('paypal', `Webhook ${req.body?.event_type || 'event'} received`);
    await agent.run();
    res.json({ ok: true });
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  return { app, store, agent };
}

function cleanList(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(',');
  return list.map((x) => String(x).trim()).filter(Boolean);
}
function positive(v) {
  const n = Number(v);
  if (!(n >= 0)) throw httpError(400, 'Dues must be a non-negative number');
  return round2(n);
}
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function lowerHeaders(h) {
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
}
