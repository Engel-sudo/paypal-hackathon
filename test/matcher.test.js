import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchPayment } from '../src/ai/matcher.js';
import { IntentClassifier } from '../src/ai/intent.js';
import { HashedEmbedder } from '../src/ai/embedder.js';
import { seedClub } from '../src/seed.js';
import { tokens, editDistance } from '../src/util.js';

const { members } = seedClub();
const pay = (over) => ({ id: 'x', date: '2026-10-10T00:00:00Z', payerName: 'Someone Else', payerEmail: '', amount: 30, currency: 'USD', note: '', ...over });
const names = (r) => r.allocations.map((a) => a.memberName);

test('tokens strip accents and drop initial dots', () => {
  assert.deepEqual(tokens('J. Kowalski'), ['j', 'kowalski']);
  assert.deepEqual(tokens('Elif Yılmaz'), ['elif', 'yilmaz']);
  assert.deepEqual(tokens('for Zoë & José'), ['for', 'zoe', 'jose']);
  assert.equal(editDistance('leoni', 'leonie'), 1);
});

test('exact email + name is a confident single match', () => {
  const r = matchPayment(pay({ payerName: 'Lena Park', payerEmail: 'lena.park@example.com', note: 'fall dues Lena' }), members);
  assert.deepEqual(names(r), ['Lena Park']);
  assert.ok(r.confidence > 0.9);
  assert.ok(r.reasons.some((x) => /email/.test(x)));
});

test('parent paying for two kids splits the payment', () => {
  const r = matchPayment(pay({ payerName: 'Sarah Carter', amount: 60, note: 'for max & tom membership' }), members);
  assert.equal(r.kind, 'split');
  assert.deepEqual(names(r).sort(), ['Max Carter', 'Tom Carter']);
  assert.deepEqual(r.allocations.map((a) => a.amount), [30, 30]);
});

test('nickname and initials match', () => {
  assert.deepEqual(names(matchPayment(pay({ payerName: 'F. Ward', note: '🧗 dues - Fabi' }), members)), ['Fabian Ward']);
  const r = matchPayment(pay({ payerName: 'J. Kowalski', note: 'membership jonas k' }), members);
  assert.deepEqual(names(r), ['Jonas Kowalski']);
  assert.ok(r.confidence >= 0.8);
});

test('typo in the first name still matches', () => {
  assert.deepEqual(names(matchPayment(pay({ payerName: 'Leoni Fischer', note: 'membership fall Leoni' }), members)), ['Leonie Fischer']);
});

test('family surname alone is a low-confidence guess', () => {
  const r = matchPayment(pay({ payerName: 'Andrea Smith', note: 'membership fee' }), members);
  assert.deepEqual(names(r), ['Paul Smith']);
  assert.ok(r.confidence < 0.8 && r.confidence >= 0.4);
});

test('already paid member is flagged as duplicate', () => {
  const outstanding = new Map([['m01', 0]]);
  const r = matchPayment(pay({ payerName: 'Lena Park', payerEmail: 'lena.park@example.com', note: 'dues' }), members, { outstanding });
  assert.equal(r.kind, 'duplicate');
});

test('partial payment is detected', () => {
  const r = matchPayment(pay({ payerName: 'Sophie Ward', payerEmail: 'sophie.w@example.com', amount: 25, note: 'climbing dues Sophie W.' }), members);
  assert.equal(r.kind, 'partial');
});

test('stranger gets no match', () => {
  const r = matchPayment(pay({ payerName: 'Mark Evans', payerEmail: 'mark.evans@example.com', amount: 15, note: 'for the bouldering trip saturday' }), members);
  assert.equal(r.allocations.length, 0);
  assert.equal(r.confidence, 0);
});

test('learned payer alias makes a later payment confident', () => {
  const ms = structuredClone(members);
  ms.find((m) => m.id === 'm05').payerAliases = [{ name: 'Andrea Smith', email: 'a.smith@example.com' }];
  const r = matchPayment(pay({ payerName: 'Andrea Smith', payerEmail: 'a.smith@example.com', note: '' }), ms);
  assert.deepEqual(names(r), ['Paul Smith']);
  assert.ok(r.confidence >= 0.8);
});

test('intent classifier separates dues from events and donations', async () => {
  const ic = new IntentClassifier(new HashedEmbedder());
  assert.equal((await ic.classify('membership fall Leoni')).label, 'dues');
  assert.equal((await ic.classify('dues')).label, 'dues');
  assert.equal((await ic.classify('membership fee')).label, 'dues');
  assert.equal((await ic.classify('for the bouldering trip saturday')).label, 'event');
  assert.equal((await ic.classify('tickets for the spring tournament')).label, 'event');
  assert.equal((await ic.classify('a donation for the club')).label, 'donation');
  assert.equal((await ic.classify('test payment, wrong account')).label, 'other');
});
