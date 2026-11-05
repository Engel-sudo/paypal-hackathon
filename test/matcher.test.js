import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchPayment } from '../src/ai/matcher.js';
import { IntentClassifier } from '../src/ai/intent.js';
import { HashedEmbedder } from '../src/ai/embedder.js';
import { seedClub } from '../src/seed.js';
import { tokens, editDistance } from '../src/util.js';

const { members } = seedClub();
const pay = (over) => ({ id: 'x', date: '2026-10-10T00:00:00Z', payerName: 'Someone Else', payerEmail: '', amount: 30, currency: 'EUR', note: '', ...over });
const names = (r) => r.allocations.map((a) => a.memberName);

test('tokens fold umlauts and drop initial dots', () => {
  assert.deepEqual(tokens('J. Krüger'), ['j', 'krueger']);
  assert.deepEqual(tokens('für Max & Tom'), ['fuer', 'max', 'tom']);
  assert.equal(editDistance('leoni', 'leonie'), 1);
});

test('exact email + name is a confident single match', () => {
  const r = matchPayment(pay({ payerName: 'Lena Hoffmann', payerEmail: 'lena.hoffmann@example.com', note: 'Beitrag WS Lena' }), members);
  assert.deepEqual(names(r), ['Lena Hoffmann']);
  assert.ok(r.confidence > 0.9);
  assert.ok(r.reasons.some((x) => /email/.test(x)));
});

test('parent paying for two kids splits the payment', () => {
  const r = matchPayment(pay({ payerName: 'Sabine Becker', amount: 60, note: 'für max & tom beitrag winter' }), members);
  assert.equal(r.kind, 'split');
  assert.deepEqual(names(r).sort(), ['Max Becker', 'Tom Becker']);
  assert.deepEqual(r.allocations.map((a) => a.amount), [30, 30]);
});

test('nickname and initials match', () => {
  assert.deepEqual(names(matchPayment(pay({ payerName: 'F. Wagner', note: '🧗 dues - Fabi' }), members)), ['Fabian Wagner']);
  const r = matchPayment(pay({ payerName: 'J. Krueger', note: 'membership jonas k' }), members);
  assert.deepEqual(names(r), ['Jonas Krüger']);
  assert.ok(r.confidence >= 0.8);
});

test('typo in the first name still matches', () => {
  assert.deepEqual(names(matchPayment(pay({ payerName: 'Leoni Fischer', note: 'Mitgliedsbeitrag Winter Leoni' }), members)), ['Leonie Fischer']);
});

test('family surname alone is a low-confidence guess', () => {
  const r = matchPayment(pay({ payerName: 'Andrea Schmidt', note: 'Mitgliedsbeitrag' }), members);
  assert.deepEqual(names(r), ['Paul Schmidt']);
  assert.ok(r.confidence < 0.8 && r.confidence >= 0.4);
});

test('already paid member is flagged as duplicate', () => {
  const outstanding = new Map([['m01', 0]]);
  const r = matchPayment(pay({ payerName: 'Lena Hoffmann', payerEmail: 'lena.hoffmann@example.com', note: 'Beitrag' }), members, { outstanding });
  assert.equal(r.kind, 'duplicate');
});

test('partial payment is detected', () => {
  const r = matchPayment(pay({ payerName: 'Sophie Wagner', payerEmail: 'sophie.w@example.com', amount: 25, note: 'Kletterbeitrag Sophie W.' }), members);
  assert.equal(r.kind, 'partial');
});

test('stranger gets no match', () => {
  const r = matchPayment(pay({ payerName: 'Mark Evans', payerEmail: 'mark.evans@example.com', amount: 15, note: 'for the bouldering trip saturday' }), members);
  assert.equal(r.allocations.length, 0);
  assert.equal(r.confidence, 0);
});

test('learned payer alias makes a later payment confident', () => {
  const ms = structuredClone(members);
  ms.find((m) => m.id === 'm05').payerAliases = [{ name: 'Andrea Schmidt', email: 'a.schmidt@example.com' }];
  const r = matchPayment(pay({ payerName: 'Andrea Schmidt', payerEmail: 'a.schmidt@example.com', note: '' }), ms);
  assert.deepEqual(names(r), ['Paul Schmidt']);
  assert.ok(r.confidence >= 0.8);
});

test('intent classifier separates dues from events and donations', async () => {
  const ic = new IntentClassifier(new HashedEmbedder());
  assert.equal((await ic.classify('Mitgliedsbeitrag Winter')).label, 'dues');
  assert.equal((await ic.classify('beitrag')).label, 'dues');
  assert.equal((await ic.classify('for the bouldering trip saturday')).label, 'event');
  assert.equal((await ic.classify('Spende für den Verein')).label, 'donation');
});
