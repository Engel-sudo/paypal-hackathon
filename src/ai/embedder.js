// Sentence embeddings without a paid API.
//
// LocalEmbedder runs a multilingual sentence-transformer on the server's CPU through
// transformers.js (ONNX runtime). The model (~120 MB, quantized) downloads once from the
// Hugging Face hub and is cached. HashedEmbedder is a deterministic hashed character-n-gram
// embedding used for tests, offline runs, and while the model is still loading.
import { normalize } from '../util.js';

export const DEFAULT_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

export class HashedEmbedder {
  constructor(dims = 512) {
    this.name = 'hashed-ngrams';
    this.dims = dims;
  }

  async embed(texts) {
    return texts.map((t) => this.one(t));
  }

  one(text) {
    const v = new Float32Array(this.dims);
    const s = ` ${normalize(text)} `;
    const add = (gram, w) => {
      let h = 2166136261;
      for (let i = 0; i < gram.length; i++) h = Math.imul(h ^ gram.charCodeAt(i), 16777619);
      v[(h >>> 0) % this.dims] += w;
    };
    for (let i = 0; i < s.length - 2; i++) add(s.slice(i, i + 3), 1);
    for (const w of s.trim().split(' ')) if (w) add(`w:${w}`, 2);
    return l2(v);
  }
}

export class LocalEmbedder {
  constructor({ model = DEFAULT_MODEL, cacheDir } = {}) {
    this.name = 'local-model';
    this.model = model;
    this.cacheDir = cacheDir;
    this.extractor = null;
  }

  async init() {
    const tf = await import('@huggingface/transformers');
    if (this.cacheDir) tf.env.cacheDir = this.cacheDir;
    this.extractor = await tf.pipeline('feature-extraction', this.model, { dtype: 'q8' });
    return this;
  }

  async embed(texts) {
    const out = await this.extractor(texts.map((t) => String(t || ' ')), { pooling: 'mean', normalize: true });
    return out.tolist().map((row) => Float32Array.from(row));
  }
}

// Uses the hashed embedder until the local model has loaded, then switches over.
// If the model can't load (no network, too little memory) it stays on the fallback.
export class AutoEmbedder {
  constructor({ mode = 'local', model, cacheDir, log = () => {} } = {}) {
    this.fallback = new HashedEmbedder();
    this.active = this.fallback;
    this.model = model || DEFAULT_MODEL;
    this.status = mode === 'local' ? 'loading' : 'off';
    if (mode === 'local') {
      this.ready = new LocalEmbedder({ model: this.model, cacheDir }).init()
        .then((m) => { this.active = m; this.status = 'ready'; log(`AI model ${this.model} loaded`); })
        .catch((e) => { this.status = 'failed'; log(`AI model failed to load, using hashed n-grams: ${e.message}`); });
    } else {
      this.ready = Promise.resolve();
    }
  }

  get name() { return this.active.name; }

  async embed(texts) {
    try {
      return await this.active.embed(texts);
    } catch (e) {
      if (this.active === this.fallback) throw e;
      return this.fallback.embed(texts);
    }
  }
}

export function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function l2(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}
