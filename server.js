import path from 'node:path';
import { createApp } from './src/app.js';
import { createPayPal } from './src/paypal/index.js';
import { AutoEmbedder } from './src/ai/embedder.js';

const env = process.env;
const dataDir = env.DATA_DIR || path.resolve('data');
const embedder = new AutoEmbedder({
  mode: env.AI_MODE === 'hashed' ? 'hashed' : 'local',
  model: env.EMBED_MODEL,
  cacheDir: path.join(dataDir, '.models'),
  log: (m) => console.log(m),
});
const paypal = createPayPal(env);
const { app } = createApp({ paypal, embedder, dataFile: path.join(dataDir, 'club.json'), adminToken: env.ADMIN_TOKEN });

const port = Number(env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Club treasurer running on http://localhost:${port} (PayPal: ${paypal.kind}, AI: ${embedder.status === 'off' ? 'hashed n-grams' : `${embedder.model}, loading`})`);
});
