// Random messy payments for the demo button: the kinds of notes treasurers actually get.
const PARENTS = ['Andrea', 'Thomas', 'Claudia', 'Michael', 'Petra', 'Stefan'];

export function randomPayment(members, ledger, rnd = Math.random) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const open = ledger.filter((m) => m.outstanding > 0);
  const m = open.length ? pick(open) : pick(ledger);
  const [firstName, ...rest] = m.name.split(' ');
  const last = rest.join(' ');
  const nick = m.nicknames?.[0] || firstName;
  const notes = [
    `beitrag ${nick.toLowerCase()}`,
    `Mitgliedschaft ${firstName} ${last[0]}.`,
    `dues for ${firstName}`,
    `${firstName} WS26`,
    `Vereinsbeitrag ${last}`,
    `für ${nick} 🙂`,
  ];
  const byParent = rnd() < 0.35;
  return {
    payerName: byParent ? `${pick(PARENTS)} ${last}` : `${firstName[0]}. ${last}`,
    payerEmail: byParent ? `${last.toLowerCase().replace(/[^a-z]/g, '')}.family@example.com` : '',
    amount: m.outstanding || m.dues,
    note: pick(notes),
  };
}
