import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { seedClub } from '../src/seed.js';
import { MockPayPal } from '../src/paypal/mock.js';
import { HashedEmbedder } from '../src/ai/embedder.js';
import { TreasurerAgent } from '../src/agent.js';
import { computeLedger } from '../src/ledger.js';

const NOW = new Date('2026-11-05T12:00:00Z');

function setup() {
  const store = new Store(null, seedClub);
  store.load();
  const paypal = new MockPayPal();
  let now = NOW;
  const agent = new TreasurerAgent({ store, paypal, embedder: new HashedEmbedder(), now: () => now });
  return { store, paypal, agent, d: store.data, setNow: (x) => { now = x; } };
}
const member = (d, name) => computeLedger(d).find((m) => m.name === name);
const pending = (d, type) => d.proposals.filter((p) => p.status === 'pending' && (!type || p.type === type));

test('first run matches the clear payments and proposes the rest', async () => {
  const { d, agent } = setup();
  const r = await agent.run();
  assert.equal(r.newPayments, 10);
  assert.equal(r.autoMatched, 6);
  assert.equal(member(d, 'Lena Park').status, 'paid');
  assert.equal(member(d, 'Sophie Ward').status, 'partial');
  assert.equal(pending(d, 'match').length, 2);
  const matches = pending(d, 'match').map((p) => p.title).sort();
  assert.deepEqual(matches, ["Is Andrea Smith's $30 for Paul Smith?", "Is Sarah Carter's $60 for Max Carter and Tom Carter?"]);
  assert.ok(pending(d, 'match').find((p) => /Andrea/.test(p.title)).confidence < 0.8);
  const refunds = pending(d, 'refund');
  assert.equal(refunds.length, 2);
  assert.ok(refunds.some((p) => /double payment/i.test(p.title)));
  assert.ok(refunds.some((p) => /Mark Evans/.test(p.title)));
  // Members whose payment is waiting for review are not chased.
  const reminded = pending(d, 'reminder').map((p) => p.memberId);
  assert.ok(!reminded.includes('m02') && !reminded.includes('m05'));
  assert.ok(reminded.includes('m06')); // Sophie's missing $5
  assert.equal(pending(d, 'reminder').find((p) => p.memberId === 'm06').amount, 5);
});

test('a second run is idempotent', async () => {
  const { d, agent } = setup();
  await agent.run();
  const before = d.proposals.length;
  const r = await agent.run();
  assert.equal(r.newPayments, 0);
  assert.equal(d.proposals.length, before);
});

test('approving a split match pays both kids and learns the parent', async () => {
  const { d, agent } = setup();
  await agent.run();
  const p = pending(d, 'match').find((x) => /Sarah/.test(x.title));
  await agent.approve(p.id);
  assert.equal(member(d, 'Max Carter').status, 'paid');
  assert.equal(member(d, 'Tom Carter').status, 'paid');
  assert.ok(d.members.find((m) => m.id === 'm02').payerAliases.some((a) => a.name === 'Sarah Carter'));
});

test('approving a refund calls PayPal and marks the payment refunded', async () => {
  const { d, agent, paypal } = setup();
  await agent.run();
  const p = pending(d, 'refund').find((x) => /double payment/i.test(x.title));
  const done = await agent.approve(p.id, { message: 'Sorry, refunded!' });
  assert.equal(done.status, 'done');
  assert.match(done.result, /PayPal refund RF/);
  assert.deepEqual(paypal.calls.at(-1).slice(0, 1), ['refundCapture']);
  assert.equal(paypal.refunds[0].note, 'Sorry, refunded!');
  assert.equal(d.payments.find((x) => x.id === p.paymentId).status, 'refunded');
  assert.equal(member(d, 'Lena Park').status, 'paid');
});

test('rejecting the stranger refund keeps it as other income', async () => {
  const { d, agent } = setup();
  await agent.run();
  const p = pending(d, 'refund').find((x) => /Mark Evans/.test(x.title));
  agent.reject(p.id);
  assert.equal(d.payments.find((x) => x.id === p.paymentId).status, 'ignored');
});

test('reminder sends an invoice, paying it marks the member paid, next reminder waits', async () => {
  const { d, agent, paypal, setNow } = setup();
  await agent.run();
  const p = pending(d, 'reminder').find((x) => x.memberId === 'm11');
  await agent.approve(p.id);
  const inv = d.invoices.find((i) => i.memberId === 'm11');
  assert.equal(inv.status, 'SENT');
  assert.equal(paypal.invoices.length, 1);

  await agent.run();
  assert.equal(pending(d, 'reminder').filter((x) => x.memberId === 'm11').length, 0, 'no new reminder within 7 days');

  setNow(new Date('2026-11-13T12:00:00Z'));
  await agent.run();
  const second = pending(d, 'reminder').find((x) => x.memberId === 'm11');
  assert.ok(second && second.invoiceId === inv.id, 'second reminder uses /remind on the same invoice');
  await agent.approve(second.id);
  assert.equal(inv.reminders, 1);

  paypal.simulatePayInvoice(inv.id, { name: 'Noah Brooks' });
  await agent.run();
  assert.equal(member(d, 'Noah Brooks').status, 'paid');
  assert.equal(d.payments.filter((x) => x.invoiceId === inv.id).length, 1);
});

test('PayPal failures mark the proposal failed instead of crashing', async () => {
  const { d, agent, paypal } = setup();
  await agent.run();
  paypal.refundCapture = async () => { throw new Error('PayPal refund failed (422): TRANSACTION_REFUSED'); };
  const p = pending(d, 'refund')[0];
  const r = await agent.approve(p.id);
  assert.equal(r.status, 'failed');
  assert.match(r.result, /TRANSACTION_REFUSED/);
});

test('manual assign resolves pending proposals and validates amounts', async () => {
  const { d, agent } = setup();
  await agent.run();
  const p = pending(d, 'match').find((x) => /Andrea/.test(x.title));
  assert.throws(() => agent.assign(p.paymentId, [{ memberId: 'm05', amount: 999 }]), /exceed/);
  agent.assign(p.paymentId, [{ memberId: 'm05', amount: 30 }]);
  assert.equal(member(d, 'Paul Smith').status, 'paid');
  assert.equal(d.proposals.find((x) => x.id === p.id).status, 'rejected');
});

test('overpayment gets matched and the surplus refund proposed', async () => {
  const { d, agent, paypal } = setup();
  paypal.reset(false);
  paypal.simulateIncoming({ payerName: 'Noah Brooks', payerEmail: 'noah.brooks@example.com', amount: 50, note: 'dues Noah' , date: '2026-11-01T10:00:00Z' });
  await agent.run();
  assert.equal(member(d, 'Noah Brooks').status, 'paid');
  const r = pending(d, 'refund')[0];
  assert.equal(r.amount, 20);
  assert.equal(r.title, 'Refund $20 overpayment to Noah Brooks');
});

test('agent run reports its steps and approvals carry PayPal receipts', async () => {
  const { d, agent } = setup();
  const r = await agent.run();
  assert.deepEqual(r.steps.map((s) => s.key), ['invoices', 'transactions', 'match', 'plan']);
  assert.equal(r.steps[1].count, 10);
  assert.match(r.steps[2].detail, /6 booked automatically/);
  const refund = pending(d, 'refund')[0];
  await agent.approve(refund.id);
  assert.match(refund.receipt.api, /Payments v2/);
  const rem = pending(d, 'reminder')[0];
  await agent.approve(rem.id);
  assert.match(rem.receipt.id, /^INV2-/);
});
