// Payment -> member matching.
//
// Each piece of evidence (email, names in the note, nicknames, payer name, family surname,
// earlier payments by the same payer, amount fit) gives a probability that the payment
// belongs to a member. Evidence is combined with a noisy-OR, so independent weak hints add up
// and one strong hint is enough. Every hint carries a human-readable reason, which the UI shows.
import { tokens, editDistance, round2, normalize, money } from '../util.js';

// Words in payment notes that never refer to a person.
const STOP = new Set(['for', 'and', 'from', 'the', 'my', 'our', 'of', 'to', 'dues', 'membership', 'member', 'fee', 'fees',
  'annual', 'yearly', 'season', 'fall', 'autumn', 'spring', 'summer', 'winter', 'semester', 'term', 'year',
  'club', 'climbing', 'invoice', 'payment', 'pay', 'paid', 'thanks', 'thank', 'you']);

function nameParts(member) {
  const parts = tokens(member.name);
  return {
    first: parts[0] || '',
    last: parts[parts.length - 1] || '',
    all: parts,
    nicks: (member.nicknames || []).map((n) => normalize(n)).filter(Boolean),
    email: normalize(member.email),
  };
}

// Does `word` appear in the token list, exactly or with a typo?
function findWord(word, toks) {
  if (!word) return null;
  for (const t of toks) {
    if (t === word) return { token: t, exact: true };
  }
  if (word.length >= 4) {
    for (const t of toks) {
      if (t.length >= 4 && editDistance(t, word) <= (word.length >= 7 ? 2 : 1)) return { token: t, exact: false };
    }
  }
  return null;
}

const noisyOr = (ps) => 1 - ps.reduce((acc, p) => acc * (1 - p), 1);

export function scoreMember(payment, member, ctx = {}) {
  const np = nameParts(member);
  const noteToks = tokens(payment.note).filter((t) => !STOP.has(t));
  const payerToks = tokens(payment.payerName);
  const payerEmail = normalize(payment.payerEmail);
  const ev = []; // { p, reason, inNote }

  if (payerEmail && np.email && payerEmail === np.email) {
    ev.push({ p: 0.75, reason: `Payer email ${payment.payerEmail} is ${member.name}'s email` });
  }
  const alias = (member.payerAliases || []).find((a) =>
    (a.email && normalize(a.email) === payerEmail) || (a.name && normalize(a.name) === payerToks.join(' ')));
  if (alias) ev.push({ p: 0.7, reason: `${payment.payerName} paid for ${member.name} before (learned)` });

  // Names in the note.
  const firstHit = findWord(np.first, noteToks);
  const nickHit = np.nicks.map((n) => findWord(n, noteToks)).find(Boolean);
  const lastHit = np.last !== np.first ? findWord(np.last, noteToks) : null;
  if (firstHit) {
    ev.push({ p: firstHit.exact ? 0.55 : 0.45, inNote: true,
      reason: firstHit.exact ? `Note mentions "${firstHit.token}"` : `Note mentions "${firstHit.token}", close to ${member.name.split(' ')[0]} (typo)` });
  } else if (nickHit) {
    ev.push({ p: 0.55, inNote: true, reason: `Note uses nickname "${nickHit.token}"` });
  }
  if (lastHit) ev.push({ p: 0.4, inNote: true, reason: `Note mentions surname "${lastHit.token}"` });
  // "Sophie W." / "jonas k": a first-name hit followed by the surname initial.
  if ((firstHit || nickHit) && !lastHit) {
    const idx = noteToks.indexOf((firstHit || nickHit).token);
    const next = noteToks[idx + 1];
    if (next && next.length === 1 && next === np.last[0]) ev.push({ p: 0.3, inNote: true, reason: `Initial "${next.toUpperCase()}." fits ${member.name}` });
  }

  // Payer name.
  const payerFull = payerToks.join(' ');
  if (payerFull && payerFull === np.all.join(' ')) {
    ev.push({ p: 0.6, reason: `Payer name is ${member.name}` });
  } else {
    const payerLast = payerToks[payerToks.length - 1];
    const payerFirst = payerToks[0];
    const lastMatch = payerLast && (payerLast === np.last || (payerLast.length >= 5 && editDistance(payerLast, np.last) <= 1));
    if (lastMatch) {
      const firstMatch = payerFirst === np.first || (payerFirst?.length === 1 && payerFirst === np.first[0]) ||
        (payerFirst && np.first.length >= 4 && editDistance(payerFirst, np.first) <= 1);
      if (firstMatch) ev.push({ p: 0.5, reason: `Payer "${payment.payerName}" looks like ${member.name}` });
      else ev.push({ p: 0.25, reason: `Payer shares the surname ${member.name.split(' ').slice(-1)[0]} (family member?)` });
    }
  }

  const score = noisyOr(ev.map((e) => e.p));
  return { member, score, evidence: ev, namedInNote: ev.some((e) => e.inNote) };
}

// ctx.outstanding: Map memberId -> amount still owed this period.
export function matchPayment(payment, members, ctx = {}) {
  const fmt = (n) => money(n, payment.currency);
  const outstanding = ctx.outstanding || new Map();
  const owed = (m) => (outstanding.has(m.id) ? outstanding.get(m.id) : m.dues);
  const scored = members.map((m) => scoreMember(payment, m, ctx)).filter((s) => s.score >= 0.2).sort((a, b) => b.score - a.score);
  if (scored.length === 0) {
    return { confidence: 0, allocations: [], reasons: ['No member name, nickname, email or payer match found'], alternatives: [], kind: 'none' };
  }

  // Several members named in the note, and the amount covers them together -> split.
  const named = scored.filter((s) => s.namedInNote && s.score >= 0.45);
  if (named.length >= 2) {
    const group = named.slice(0, 4);
    const sumDues = round2(group.reduce((s, g) => s + g.member.dues, 0));
    if (Math.abs(sumDues - payment.amount) < 0.01) {
      const conf = Math.min(...group.map((g) => g.score)) * 0.9 + 0.1;
      const sharedPayer = group.flatMap((g) => g.evidence).find((e) => /surname|family/.test(e.reason));
      return {
        kind: 'split',
        confidence: round2(Math.min(0.97, conf + (sharedPayer ? 0.05 : 0))),
        allocations: group.map((g) => ({ memberId: g.member.id, memberName: g.member.name, amount: g.member.dues })),
        reasons: [
          `Note names ${group.length} members: ${group.map((g) => g.member.name).join(', ')}`,
          `${fmt(payment.amount)} = ${group.map((g) => fmt(g.member.dues)).join(' + ')} (their dues together)`,
          ...(sharedPayer ? [sharedPayer.reason] : []),
        ],
        alternatives: scored.filter((s) => !group.includes(s)).slice(0, 3).map(alt),
      };
    }
  }

  const [top, second] = scored;
  const reasons = top.evidence.map((e) => e.reason);
  let confidence = top.score;
  // Ambiguity: a close runner-up lowers confidence.
  if (second && second.score > 0.3) {
    confidence -= Math.max(0, 0.25 - (top.score - second.score));
    if (top.score - second.score < 0.1) reasons.push(`Could also be ${second.member.name}`);
  }
  // Amount fit.
  const due = owed(top.member);
  let kind = 'single';
  if (Math.abs(payment.amount - top.member.dues) < 0.01 && due > 0) {
    confidence += (1 - confidence) * 0.3;
    reasons.push(`${fmt(payment.amount)} is exactly the dues`);
  } else if (due <= 0) {
    kind = 'duplicate';
    reasons.push(`${top.member.name} has already paid this period`);
  } else if (payment.amount < due) {
    kind = 'partial';
    reasons.push(`${fmt(payment.amount)} is less than the ${fmt(due)} owed`);
  } else if (payment.amount > due) {
    kind = 'overpaid';
    reasons.push(`${fmt(payment.amount)} is more than the ${fmt(due)} owed`);
  }
  return {
    kind,
    confidence: round2(Math.max(0, Math.min(0.99, confidence))),
    allocations: [{ memberId: top.member.id, memberName: top.member.name, amount: round2(Math.min(payment.amount, Math.max(due, 0)) || payment.amount) }],
    reasons,
    alternatives: scored.slice(1, 4).map(alt),
  };
}

const alt = (s) => ({ memberId: s.member.id, memberName: s.member.name, score: round2(s.score) });
