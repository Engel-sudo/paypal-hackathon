import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { MockPayPal } from '../src/paypal/mock.js';
import { HashedEmbedder } from '../src/ai/embedder.js';

async function start(opts = {}) {
  const { app } = createApp({ paypal: new MockPayPal(), embedder: new HashedEmbedder(), dataFile: null, now: () => new Date('2026-11-05T12:00:00Z'), ...opts });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
  };
  return { call, close: () => server.close() };
}

test('state, agent run, approve, export', async (t) => {
  const s = await start();
  t.after(s.close);
  let r = await s.call('GET', '/api/state');
  assert.equal(r.status, 200);
  assert.equal(r.body.mode.paypal, 'mock');
  assert.equal(r.body.summary.members, 14);

  r = await s.call('POST', '/api/agent/run');
  assert.equal(r.body.lastRun.autoMatched, 6);
  const refund = r.body.proposals.find((p) => p.type === 'refund' && /duplicate/i.test(p.title));
  r = await s.call('POST', `/api/proposals/${refund.id}/approve`, { message: 'edited' });
  assert.equal(r.body.proposals.find((p) => p.id === refund.id).status, 'done');

  r = await s.call('POST', '/api/proposals/approve-all', { type: 'reminder' });
  assert.equal(r.body.proposals.filter((p) => p.type === 'reminder' && p.status === 'pending').length, 0);
  const inv = r.body.members.find((m) => m.invoice)?.invoice;
  assert.equal(inv.status, 'SENT');

  r = await s.call('POST', `/api/demo/pay-invoice/${inv.id}`);
  assert.equal(r.body.members.find((m) => m.invoice?.id === inv.id).status, 'paid');

  r = await s.call('GET', '/api/export.csv');
  assert.match(r.body, /Name,Email,Dues/);
  assert.match(r.body, /Lena Hoffmann/);
});

test('simulate payment, members CRUD, validation', async (t) => {
  const s = await start();
  t.after(s.close);
  let r = await s.call('POST', '/api/demo/simulate-payment', {});
  assert.ok(r.body.simulated.amount > 0);
  r = await s.call('POST', '/api/members', { name: 'Ada Lovelace', email: 'ada@example.com', nicknames: 'Ada, Countess' });
  const ada = r.body.members.find((m) => m.name === 'Ada Lovelace');
  assert.deepEqual(ada.nicknames, ['Ada', 'Countess']);
  assert.equal(ada.dues, 30);
  r = await s.call('PUT', `/api/members/${ada.id}`, { dues: 10 });
  assert.equal(r.body.members.find((m) => m.id === ada.id).dues, 10);
  r = await s.call('POST', '/api/members', { name: '' });
  assert.equal(r.status, 400);
  r = await s.call('DELETE', `/api/members/${ada.id}`);
  assert.ok(!r.body.members.some((m) => m.id === ada.id));
  r = await s.call('POST', '/api/proposals/nope/approve');
  assert.equal(r.status, 404);
});

test('admin token protects writes', async (t) => {
  const s = await start({ adminToken: 'secret' });
  t.after(s.close);
  assert.equal((await s.call('POST', '/api/agent/run')).status, 401);
  assert.equal((await s.call('POST', '/api/agent/run', null, { 'x-admin-token': 'secret' })).status, 200);
  assert.equal((await s.call('GET', '/api/state')).body.mode.adminRequired, true);
});
