// The real PayPal client against a fake fetch: request shapes and response mapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SandboxPayPal, fromTransaction } from '../src/paypal/sandbox.js';
import { createPayPal } from '../src/paypal/index.js';

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ method: init.method || 'GET', path: u.pathname, query: u.searchParams, headers: init.headers, body: init.body && init.body !== 'grant_type=client_credentials' ? JSON.parse(init.body) : init.body });
    const key = `${init.method || 'GET'} ${u.pathname}`;
    const h = routes[key] || Object.entries(routes).find(([k]) => new RegExp(`^${k}$`).test(key))?.[1];
    if (!h) return new Response(JSON.stringify({ message: `no route ${key}` }), { status: 404 });
    const [status, body] = typeof h === 'function' ? h(calls.at(-1)) : h;
    return new Response(JSON.stringify(body), { status });
  };
  fn.calls = calls;
  return fn;
}
const auth = { 'POST /v1/oauth2/token': [200, { access_token: 'TOKEN', expires_in: 3600 }] };

test('createPayPal picks the sandbox client only with both keys', () => {
  assert.equal(createPayPal({}).kind, 'mock');
  assert.equal(createPayPal({ PAYPAL_CLIENT_ID: 'a' }).kind, 'mock');
  assert.equal(createPayPal({ PAYPAL_CLIENT_ID: 'a', PAYPAL_CLIENT_SECRET: 'b' }).kind, 'sandbox');
});

test('transaction search maps incoming payments and skips outgoing ones', async () => {
  const f = fakeFetch({
    ...auth,
    'GET /v1/reporting/transactions': [200, { total_pages: 1, transaction_details: [
      { transaction_info: { transaction_id: 'TX1', transaction_initiation_date: '2026-10-03T10:00:00+0000', transaction_amount: { value: '30.00', currency_code: 'USD' }, transaction_status: 'S', transaction_note: 'dues Lena' },
        payer_info: { email_address: 'lena@example.com', payer_name: { given_name: 'Lena', surname: 'Park' } } },
      { transaction_info: { transaction_id: 'TX2', transaction_amount: { value: '-30.00', currency_code: 'USD' }, transaction_status: 'S' } },
    ] }],
  });
  const pp = new SandboxPayPal({ clientId: 'id', clientSecret: 'secret', fetchImpl: f });
  const list = await pp.listTransactions({ start: '2026-10-01T00:00:00Z', end: '2026-11-05T00:00:00Z' });
  assert.equal(list.length, 2, 'two 30-day windows, one incoming payment each');
  assert.deepEqual({ ...list[0], date: undefined }, { id: 'TX1', date: undefined, payerName: 'Lena Park', payerEmail: 'lena@example.com', amount: 30, currency: 'USD', note: 'dues Lena', status: 'COMPLETED', invoiceId: null });
  const searches = f.calls.filter((c) => c.path === '/v1/reporting/transactions');
  assert.equal(searches.length, 2);
  assert.match(searches[0].query.get('start_date'), /^2026-10-01T00:00:00Z$/);
  assert.equal(f.calls[0].headers.Authorization, `Basic ${Buffer.from('id:secret').toString('base64')}`);
  assert.equal(searches[0].headers.Authorization, 'Bearer TOKEN');
});

test('refund posts to the captures endpoint with an idempotency key', async () => {
  const f = fakeFetch({ ...auth, 'POST /v2/payments/captures/TX1/refund': [201, { id: 'RF1', status: 'COMPLETED' }] });
  const pp = new SandboxPayPal({ clientId: 'id', clientSecret: 's', fetchImpl: f });
  const r = await pp.refundCapture('TX1', { amount: 30, currency: 'USD', note: 'dup' });
  assert.deepEqual(r, { id: 'RF1', status: 'COMPLETED' });
  const c = f.calls.at(-1);
  assert.deepEqual(c.body, { amount: { value: '30.00', currency_code: 'USD' }, note_to_payer: 'dup' });
  assert.ok(c.headers['PayPal-Request-Id']);
});

test('invoice is created as draft then sent, memo carries the member id', async () => {
  const f = fakeFetch({
    ...auth,
    'POST /v2/invoicing/invoices': [201, { id: 'INV2-AAAA' }],
    'POST /v2/invoicing/invoices/INV2-AAAA/send': [200, { href: 'https://www.sandbox.paypal.com/invoice/p/#INV2-AAAA' }],
  });
  const pp = new SandboxPayPal({ clientId: 'id', clientSecret: 's', fetchImpl: f });
  const inv = await pp.createAndSendInvoice({ member: { id: 'm11', name: 'Noah Brooks', email: 'noah@example.com' }, amount: 30, currency: 'USD', note: 'hi', clubName: 'Club', period: '2026–27 season', dueDate: '2026-11-15' });
  assert.equal(inv.id, 'INV2-AAAA');
  assert.equal(inv.url, 'https://www.sandbox.paypal.com/invoice/p/#INV2-AAAA');
  const draft = f.calls.find((c) => c.path === '/v2/invoicing/invoices').body;
  assert.equal(draft.detail.memo, 'member:m11');
  assert.equal(draft.primary_recipients[0].billing_info.email_address, 'noah@example.com');
  assert.equal(draft.items[0].unit_amount.value, '30.00');
});

test('PayPal errors surface the message and details', async () => {
  const f = fakeFetch({ ...auth, 'POST /v2/payments/captures/TX9/refund': [422, { message: 'The requested action could not be performed', details: [{ issue: 'CAPTURE_FULLY_REFUNDED', description: 'The capture has already been fully refunded' }] }] });
  const pp = new SandboxPayPal({ clientId: 'id', clientSecret: 's', fetchImpl: f });
  await assert.rejects(pp.refundCapture('TX9', { amount: 1, currency: 'USD' }), /422.*already been fully refunded/);
});

test('fromTransaction ignores pending and negative entries', () => {
  assert.equal(fromTransaction({ transaction_info: { transaction_amount: { value: '5' }, transaction_status: 'P' } }), null);
  assert.equal(fromTransaction({ transaction_info: { transaction_amount: { value: '-5' } } }), null);
});

test('permission and key errors say what to do about them', async () => {
  const f = fakeFetch({ ...auth, 'GET /v1/reporting/transactions': [403, { name: 'NOT_AUTHORIZED', message: 'Authorization failed due to insufficient permissions.' }] });
  const pp = new SandboxPayPal({ clientId: 'id', clientSecret: 'secret', fetchImpl: f });
  await assert.rejects(pp.listTransactions({ start: '2026-11-01T00:00:00Z', end: '2026-11-02T00:00:00Z' }), /insufficient permissions.*enable "Transaction Search"/);
  const bad = new SandboxPayPal({ clientId: 'id', clientSecret: 'wrong', fetchImpl: fakeFetch({ 'POST /v1/oauth2/token': [401, { error: 'invalid_client' }] }) });
  await assert.rejects(bad.listInvoices(), /auth failed \(401\).*Sandbox keys/);
});

test('a due date that has passed is left off the invoice', async () => {
  const routes = { ...auth, 'POST /v2/invoicing/invoices': [201, { id: 'INV2-1' }], 'POST /v2/invoicing/invoices/INV2-1/send': [200, {}] };
  const member = { id: 'm1', name: 'Lena Park', email: 'lena@example.com' };
  for (const [dueDate, expected] of [['2020-01-01', undefined], ['2999-01-01', { due_date: '2999-01-01' }]]) {
    const f = fakeFetch(routes);
    await new SandboxPayPal({ clientId: 'id', clientSecret: 'secret', fetchImpl: f }).createAndSendInvoice({ member, amount: 30, currency: 'USD', clubName: 'Club', dueDate });
    assert.deepEqual(f.calls.find((c) => c.path === '/v2/invoicing/invoices').body.detail.payment_term, expected);
  }
});
