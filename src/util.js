// Small helpers shared across the app.

export const round2 = (n) => Math.round(Number(n) * 100) / 100;

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// Letters that Unicode NFD does not split into base letter + accent.
const SPECIAL = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i' };

// Lowercase, strip accents (NFD), keep letters/digits/spaces. "Yılmaz" -> "yilmaz", "Zoë" -> "zoe".
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[ßæœøłđðþı]/g, (c) => SPECIAL[c])
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9@.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Words of a text. Dots are kept only inside email addresses ("J." -> "j").
export function tokens(text) {
  return normalize(text).split(' ')
    .flatMap((t) => (t.includes('@') ? [t] : t.split('.')))
    .filter(Boolean);
}

// Optimal string alignment distance (Levenshtein with adjacent swaps).
export function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

// "$30", "$12.50". Whole amounts drop the cents.
export function money(amount, currency = 'USD') {
  const n = Number(amount);
  const digits = Number.isInteger(n) ? 0 : 2;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(n);
}
