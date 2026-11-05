// Small helpers shared across the app.

export const round2 = (n) => Math.round(Number(n) * 100) / 100;

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// Lowercase, fold German umlauts and other accents, keep letters/digits/spaces.
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9@.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Also fold "ae" -> "a" etc. so "Krueger", "Krüger" and "Kruger" compare equal.
export function fold(token) {
  return token.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
}

export function tokens(text) {
  return normalize(text).split(' ').filter(Boolean);
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

export function money(amount, currency = 'EUR') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}
