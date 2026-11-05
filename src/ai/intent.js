// What is a payment for? Membership dues, an event, a donation, or something else.
// Nearest-prototype classification over sentence embeddings, in German and English,
// with keyword evidence on top so short notes ("beitrag") stay reliable.
import { cosine } from './embedder.js';
import { tokens, fold } from '../util.js';

export const PROTOTYPES = {
  dues: [
    'membership fee', 'membership dues for the semester', 'annual club membership', 'dues',
    'Mitgliedsbeitrag', 'Beitrag Wintersemester', 'Vereinsbeitrag', 'Mitgliedschaft Jahresbeitrag',
  ],
  event: [
    'ticket for the trip', 'bouldering trip on saturday', 'event registration', 'course fee for the workshop',
    'Ausflug', 'Fahrt am Wochenende', 'Hüttenwochenende', 'Kursgebühr', 'Anmeldung Turnier',
  ],
  donation: ['donation for the club', 'gift', 'Spende für den Verein', 'Spende'],
  other: ['refund please', 'test payment', 'Rückzahlung', 'wrong recipient sorry', 'Rechnung', 'equipment purchase'],
};

const KEYWORDS = {
  dues: ['beitrag', 'mitgliedsbeitrag', 'kletterbeitrag', 'mitgliedschaft', 'membership', 'dues', 'fee', 'jahresbeitrag', 'semesterbeitrag', 'ws', 'ss', 'winter', 'invoice'],
  event: ['trip', 'ausflug', 'fahrt', 'event', 'ticket', 'kurs', 'course', 'workshop', 'turnier', 'tournament', 'party', 'huette', 'camp'],
  donation: ['spende', 'donation', 'gift', 'geschenk'],
  other: ['test', 'refund', 'rueckzahlung', 'falsch', 'wrong'],
};

export class IntentClassifier {
  constructor(embedder) {
    this.embedder = embedder;
    this.cache = new Map(); // embedder name -> prototype vectors
  }

  async protoVectors() {
    const key = this.embedder.name;
    if (!this.cache.has(key)) {
      const labels = Object.keys(PROTOTYPES);
      const vecs = {};
      for (const l of labels) vecs[l] = await this.embedder.embed(PROTOTYPES[l]);
      this.cache.set(key, vecs);
    }
    return this.cache.get(key);
  }

  async classify(note) {
    const toks = new Set(tokens(note).map(fold));
    if (toks.size === 0) return { label: 'dues', score: 0.5, evidence: 'empty note; most club payments are dues' };
    const protos = await this.protoVectors();
    const [v] = await this.embedder.embed([note]);
    const scores = {};
    for (const [label, vecs] of Object.entries(protos)) {
      const sim = Math.max(...vecs.map((p) => cosine(v, p)));
      const kw = KEYWORDS[label].some((k) => toks.has(fold(k))) ? 0.35 : 0;
      scores[label] = sim + kw;
    }
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [label, top] = ranked[0];
    const second = ranked[1][1];
    // Margin-based confidence in [0.5, 0.99].
    const score = Math.min(0.99, 0.5 + Math.max(0, top - second));
    return { label, score: Math.round(score * 100) / 100 };
  }
}
