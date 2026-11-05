// Demo club. All people are fictional.
export function seedClub() {
  const m = (id, name, email, nicknames = [], dues = 30) => ({ id, name, email, nicknames, dues, joined: '2026-10-01' });
  return {
    settings: {
      clubName: 'Isar Climbing Club e.V. (demo)',
      period: 'Winter semester 2026/27',
      periodStart: '2026-10-01',
      dueDate: '2026-11-15',
      currency: 'EUR',
      defaultDues: 30,
      autoApplyThreshold: 0.85,
    },
    members: [
      m('m01', 'Lena Hoffmann', 'lena.hoffmann@example.com'),
      m('m02', 'Max Becker', 'max.becker@example.com', ['Maxi']),
      m('m03', 'Tom Becker', 'tom.becker@example.com', ['Tommy']),
      m('m04', 'Jonas Krüger', 'jonas.k@example.com', ['Joni']),
      m('m05', 'Paul Schmidt', 'paul.schmidt@example.com'),
      m('m06', 'Sophie Wagner', 'sophie.w@example.com', [], 30),
      m('m07', 'Fabian Wagner', 'fabian.wagner@example.com', ['Fabi']),
      m('m08', 'Kim Nguyen', 'kim.nguyen@example.com'),
      m('m09', 'Leonie Fischer', 'leonie.f@example.com'),
      m('m10', 'Elif Yılmaz', 'elif.yilmaz@example.com'),
      m('m11', 'Noah Richter', 'noah.richter@example.com'),
      m('m12', 'Mia Schäfer', 'mia.schaefer@example.com', [], 15),
      m('m13', 'David Klein', 'david.klein@example.com', ['Dave']),
      m('m14', 'Hannah Braun', 'hannah.braun@example.com'),
    ],
    allocations: [],
    proposals: [],
    invoices: [],
    payments: [],
    log: [],
  };
}

// Incoming payments the mock PayPal account starts with: the messy reality of a club
// PayPal inbox (partners paying for each other, nicknames, typos, duplicates, strangers).
export function seedMockTransactions() {
  const t = (id, date, payerName, email, amount, note) => ({
    id, date: `${date}T10:00:00Z`, payerName, payerEmail: email, amount, currency: 'EUR', note, status: 'COMPLETED',
  });
  return [
    t('8MC58561AA0000001', '2026-10-03', 'Lena Hoffmann', 'lena.hoffmann@example.com', 30, 'Beitrag WS Lena'),
    t('8MC58561AA0000002', '2026-10-04', 'Sabine Becker', 'sabine.becker@example.com', 60, 'für max & tom beitrag winter'),
    t('8MC58561AA0000003', '2026-10-06', 'J. Krueger', 'jk1999@example.com', 30, 'membership jonas k'),
    t('8MC58561AA0000004', '2026-10-07', 'Andrea Schmidt', 'a.schmidt@example.com', 30, 'Mitgliedsbeitrag'),
    t('8MC58561AA0000005', '2026-10-09', 'Lena Hoffmann', 'lena.hoffmann@example.com', 30, 'Beitrag'),
    t('8MC58561AA0000006', '2026-10-10', 'Sophie Wagner', 'sophie.w@example.com', 25, 'Kletterbeitrag Sophie W.'),
    t('8MC58561AA0000007', '2026-10-12', 'Mark Evans', 'mark.evans@example.com', 15, 'for the bouldering trip saturday'),
    t('8MC58561AA0000008', '2026-10-13', 'F. Wagner', 'fw.climb@example.com', 30, '🧗 dues - Fabi'),
    t('8MC58561AA0000009', '2026-10-15', 'K. N.', 'kim.nguyen@example.com', 30, 'beitrag'),
    t('8MC58561AA0000010', '2026-10-18', 'Leoni Fischer', 'leoni.fischer@example.com', 30, 'Mitgliedsbeitrag Winter Leoni'),
  ];
}
