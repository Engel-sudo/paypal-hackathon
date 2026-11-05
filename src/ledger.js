import { round2 } from './util.js';

// Per-member totals for the current period from the allocations of matched payments.
export function computeLedger(data) {
  const paid = new Map(data.members.map((m) => [m.id, 0]));
  const last = new Map();
  for (const p of data.payments) {
    if (p.status !== 'matched') continue;
    for (const a of p.allocations || []) {
      if (!paid.has(a.memberId)) continue;
      paid.set(a.memberId, round2(paid.get(a.memberId) + a.amount));
      if (!last.has(a.memberId) || p.date > last.get(a.memberId)) last.set(a.memberId, p.date);
    }
  }
  return data.members.map((m) => {
    const got = paid.get(m.id) || 0;
    const outstanding = round2(Math.max(0, m.dues - got));
    const credit = round2(Math.max(0, got - m.dues));
    const status = got <= 0 ? 'unpaid' : got < m.dues ? 'partial' : got > m.dues ? 'overpaid' : 'paid';
    return { ...m, paid: got, outstanding, credit, status, lastPaymentAt: last.get(m.id) || null };
  });
}

export function outstandingMap(data) {
  return new Map(computeLedger(data).map((m) => [m.id, round2(m.dues - m.paid)]));
}
