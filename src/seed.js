// Demo club. All people are fictional.
export function seedClub() {
  const m = (id, name, email, nicknames = [], dues = 30) => ({ id, name, email, nicknames, dues, joined: '2026-10-01' });
  return {
    settings: {
      clubName: 'Riverside Climbing Club',
      period: '2026–27 season',
      periodStart: '2026-10-01',
      dueDate: '2026-11-15',
      currency: 'USD',
      defaultDues: 30,
      autoApplyThreshold: 0.8,
      reminderIntervalDays: 7,
    },
    members: [
      m('m01', 'Lena Park', 'lena.park@example.com'),
      m('m02', 'Max Carter', 'max.carter@example.com', ['Maxi']),
      m('m03', 'Tom Carter', 'tom.carter@example.com', ['Tommy']),
      m('m04', 'Jonas Kowalski', 'jonas.k@example.com', ['Joni']),
      m('m05', 'Paul Smith', 'paul.smith@example.com'),
      m('m06', 'Sophie Ward', 'sophie.w@example.com'),
      m('m07', 'Fabian Ward', 'fabian.ward@example.com', ['Fabi']),
      m('m08', 'Kim Nguyen', 'kim.nguyen@example.com'),
      m('m09', 'Leonie Fischer', 'leonie.f@example.com'),
      m('m10', 'Elif Yılmaz', 'elif.yilmaz@example.com'),
      m('m11', 'Noah Brooks', 'noah.brooks@example.com'),
      m('m12', 'Mia Sato', 'mia.sato@example.com', [], 15), // student rate
      m('m13', 'David Klein', 'david.klein@example.com', ['Dave']),
      m('m14', 'Hannah Okafor', 'hannah.okafor@example.com'),
    ],
    allocations: [],
    proposals: [],
    invoices: [],
    payments: [],
    log: [],
  };
}

// Incoming payments the mock PayPal account starts with: the messy reality of a club
// PayPal inbox (parents paying for kids, nicknames, typos, duplicates, strangers).
export function seedMockTransactions() {
  const t = (id, date, payerName, email, amount, note) => ({
    id, date: `${date}T10:00:00Z`, payerName, payerEmail: email, amount, currency: 'USD', note, status: 'COMPLETED',
  });
  return [
    t('8MC58561AA0000001', '2026-10-03', 'Lena Park', 'lena.park@example.com', 30, 'fall dues Lena'),
    t('8MC58561AA0000002', '2026-10-04', 'Sarah Carter', 'sarah.carter@example.com', 60, 'for max & tom membership'),
    t('8MC58561AA0000003', '2026-10-06', 'J. Kowalski', 'jk1999@example.com', 30, 'membership jonas k'),
    t('8MC58561AA0000004', '2026-10-07', 'Andrea Smith', 'a.smith@example.com', 30, 'membership fee'),
    t('8MC58561AA0000005', '2026-10-09', 'Lena Park', 'lena.park@example.com', 30, 'dues'),
    t('8MC58561AA0000006', '2026-10-10', 'Sophie Ward', 'sophie.w@example.com', 25, 'climbing dues Sophie W.'),
    t('8MC58561AA0000007', '2026-10-12', 'Mark Evans', 'mark.evans@example.com', 15, 'for the bouldering trip saturday'),
    t('8MC58561AA0000008', '2026-10-13', 'F. Ward', 'fw.climb@example.com', 30, '🧗 dues - Fabi'),
    t('8MC58561AA0000009', '2026-10-15', 'K. N.', 'kim.nguyen@example.com', 30, 'dues'),
    t('8MC58561AA0000010', '2026-10-18', 'Leoni Fischer', 'leoni.fischer@example.com', 30, 'membership fall Leoni'),
  ];
}
