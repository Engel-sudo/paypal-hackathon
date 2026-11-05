// What is a payment for? Membership dues, an event, a donation, or something else.
// Nearest-prototype classification over sentence embeddings, with keyword evidence on top
// so short notes ("dues") stay reliable.
import { cosine } from './embedder.js';
import { tokens } from '../util.js';

export const PROTOTYPES = {
  dues: [
    'membership fee', 'membership dues for the season', 'annual club membership', 'dues',
    'fall dues', 'spring membership', 'yearly membership renewal',
  ],
  event: [
    'ticket for the trip', 'bouldering trip on saturday', 'event registration', 'course fee for the workshop',
    'weekend camp', 'tournament entry', 'party ticket',
  ],
  donation: ['donation for the club', 'gift', 'a small donation', 'contribution to the club fund'],
  other: ['refund please', 'test payment', 'wrong recipient sorry', 'equipment purchase', 'sent by mistake'],
};

const KEYWORDS = {
  dues: ['dues', 'membership', 'member', 'fee', 'season', 'fall', 'spring', 'annual', 'yearly', 'renewal', 'invoice'],
  event: ['event', 'trip', 'ticket', 'tickets', 'course', 'workshop', 'tournament', 'party', 'camp', 'registration'],
  donation: ['donation', 'donate', 'gift'],
  other: ['other', 'refund', 'test', 'wrong', 'mistake'],
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
    const toks = new Set(tokens(note));
    if (toks.size === 0) return { label: 'dues', score: 0.5, evidence: 'empty note; most club payments are dues' };
    const protos = await this.protoVectors();
    const [v] = await this.embedder.embed([note]);
    const scores = {};
    for (const [label, vecs] of Object.entries(protos)) {
      const sim = Math.max(...vecs.map((p) => cosine(v, p)));
      const kw = KEYWORDS[label].some((k) => toks.has(k)) ? 0.35 : 0;
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
