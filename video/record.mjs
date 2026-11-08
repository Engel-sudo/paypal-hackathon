// Records the narrated demo video.
//
// 1. Starts the app with a fresh demo club (mock PayPal, built-in matcher).
// 2. Drives the browser through the demo with Playwright. Every scene lasts at least as long as its
//    voiceover line (video/narration/*.wav, made by video/narrate.py), and the scene start times are logged.
// 3. Mixes the voice lines in at those times and writes video/demo.mp4 (1080p, H.264 + AAC).
//
//   NODE_PATH=$(npm root -g) node video/record.mjs
//   LOCAL_AGGRID=/path/to/ag-grid-community/package ...   # offline: serve AG Grid from disk instead of the CDN
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright is not a project dependency; use a global install (NODE_PATH=$(npm root -g)).
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'video');
const VOICE = path.join(OUT, 'narration');
const durations = JSON.parse(fs.readFileSync(path.join(VOICE, 'durations.json'), 'utf8'));
const PORT = Number(process.env.VIDEO_PORT || 3123);
const BASE = `http://127.0.0.1:${PORT}`;
const W = 1536, H = 864; // recorded at the viewport size, upscaled to 1080p by ffmpeg
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clubkeep-video-'));
const server = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AI_MODE: process.env.AI_MODE || 'hashed', PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '', ADMIN_TOKEN: '' },
  stdio: 'inherit',
});
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {}
  await sleep(200);
}
await fetch(`${BASE}/api/demo/reset`, { method: 'POST' });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  recordVideo: { dir: path.join(OUT, 'raw'), size: { width: W, height: H } },
  colorScheme: 'light',
  reducedMotion: 'no-preference',
});
if (process.env.LOCAL_AGGRID) {
  await context.route(/cdn\.jsdelivr\.net\/npm\/ag-grid-community@32\.3\.3\/(.*)$/, (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^\/npm\/ag-grid-community@32\.3\.3\//, '');
    const file = path.join(process.env.LOCAL_AGGRID, rel);
    route.fulfill({ path: file, contentType: file.endsWith('.css') ? 'text/css' : 'application/javascript' });
  });
}
const page = await context.newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', (e) => console.error('page error:', e.message));
const t0 = Date.now(); // the video starts with the page

// ---------- overlays: captions, title cards, spotlight ----------
async function overlays() {
  await page.addStyleTag({ content: `
    #vid-caption{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:99999;max-width:78%;
      background:#1A1916;color:#F6F4EF;font:500 24px/1.35 Geist,system-ui,sans-serif;padding:14px 28px;border-radius:12px;
      box-shadow:0 12px 32px -8px rgba(26,25,22,.35);text-align:center;transition:opacity .25s;pointer-events:none}
    #vid-caption:empty{opacity:0}
    #vid-card{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:#F6F4EF;color:#1A1916;font-family:Geist,system-ui,sans-serif;text-align:center;transition:opacity .45s;padding:48px}
    #vid-card .mark{width:84px;height:84px;margin-bottom:18px}
    #vid-card h1{font:400 104px/1 'Instrument Serif',serif;margin:0 0 12px;letter-spacing:-1px}
    #vid-card h2{font:400 56px/1.1 'Instrument Serif',serif;margin:0 0 28px;letter-spacing:-.5px}
    #vid-card p{font-size:28px;margin:6px 0;color:#5E5A52;max-width:1100px;line-height:1.4}
    #vid-card .rows{display:grid;gap:12px;width:min(980px,92%);margin-top:8px}
    #vid-card .row{display:grid;grid-template-columns:220px 1fr 90px;align-items:center;gap:20px;background:#fff;border:1px solid #E7E3DA;
      border-radius:10px;padding:16px 22px;font-size:24px;text-align:left;opacity:0;transform:translateY(8px);transition:opacity .4s,transform .4s}
    #vid-card .row.on{opacity:1;transform:none}
    #vid-card .row code{font:500 22px 'Geist Mono',monospace;background:#FCF6DF;padding:2px 8px;border-radius:6px;justify-self:start}
    #vid-card .row b{font:600 24px 'Geist Mono',monospace;text-align:right}
    #vid-card .row .who{color:#5E5A52}
    #vid-card .promise{font:400 48px/1.25 'Instrument Serif',serif;color:#1A1916;opacity:0;transition:opacity .5s;margin:4px 0}
    #vid-card .promise.on{opacity:1}
    #vid-card .promise.last{font:600 26px Geist,sans-serif;color:#1F5F4A;margin-top:26px}
    #vid-card .small{font:500 20px 'Geist Mono',monospace;color:#8A857B;margin-top:30px}
    .vid-focus{outline:4px solid #F4D35E !important;outline-offset:4px;border-radius:12px;transition:outline-color .2s}
  `});
}
async function caption(text) {
  await page.evaluate((t) => {
    let el = document.getElementById('vid-caption');
    if (!el) { el = document.createElement('div'); el.id = 'vid-caption'; document.body.appendChild(el); }
    el.textContent = t || '';
  }, text);
}
async function showCard(html) {
  await page.evaluate((h) => {
    let el = document.getElementById('vid-card');
    if (!el) { el = document.createElement('div'); el.id = 'vid-card'; document.body.appendChild(el); }
    el.innerHTML = h; el.style.display = 'flex'; requestAnimationFrame(() => { el.style.opacity = '1'; });
  }, html);
}
async function hideCard() {
  await page.evaluate(() => { const el = document.getElementById('vid-card'); if (el) { el.style.opacity = '0'; setTimeout(() => { el.style.display = 'none'; }, 450); } });
  await sleep(500);
}
const reveal = (sel) => page.evaluate((s) => document.querySelector(s)?.classList.add('on'), sel);
async function focus(locator, ms = 1500) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
  await sleep(450);
  await locator.evaluate((el) => el.classList.add('vid-focus')).catch(() => {});
  await sleep(ms);
  await locator.evaluate((el) => el.classList.remove('vid-focus')).catch(() => {});
}
async function click(locator, pause = 700) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
  await sleep(400);
  const box = await locator.boundingBox();
  if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 14 }); await sleep(200); }
  await locator.click();
  await sleep(pause);
}
const tab = (name) => click(page.locator(`#tab-${name}`), 700);

// A scene lasts at least as long as its voice line (+ a short breath).
const log = [];
async function scene(id, text, fn, breath = 700) {
  const start = Date.now() - t0;
  log.push({ id, start });
  console.log(`scene ${id} at ${(start / 1000).toFixed(1)}s`);
  await caption(text);
  const began = Date.now();
  await fn();
  const left = durations[id] * 1000 + breath - (Date.now() - began);
  if (left > 0) await sleep(left);
}

// ---------- the demo ----------
await page.goto(`${BASE}/?demo=1#/inbox`);
await page.waitForSelector('#run-agent', { timeout: 20000 });
await page.evaluate(() => document.fonts.ready);
await overlays();
const MARK = `<svg class="mark" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M40 16A18 18 0 1 0 42 26" stroke="#1A1916" stroke-width="4" stroke-linecap="round"/><path d="M17 24l6 6L44 9" stroke="#1F5F4A" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

await showCard(`${MARK}<h1>clubkeep</h1><p>The AI treasurer for clubs</p>`);
await scene('cold', '', async () => {}, 300);

await showCard(`<h2>A club's PayPal inbox, start of the season</h2><div class="rows">
  <div class="row" id="r1"><span class="who">Sarah Carter</span><code>for max &amp; tom membership</code><b>$60</b></div>
  <div class="row" id="r2"><span class="who">F. Ward</span><code>🧗 dues - Fabi</code><b>$30</b></div>
  <div class="row" id="r3"><span class="who">Lena Park</span><code>fall dues Lena</code><b>$30</b></div>
  <div class="row" id="r4"><span class="who">Lena Park</span><code>dues</code><b>$30</b></div>
  <div class="row" id="r5"><span class="who">Mark Evans</span><code>for the bouldering trip saturday</code><b>$15</b></div></div>`);
await scene('problem', '', async () => {
  await sleep(3800); await reveal('#r1');
  await sleep(2600); await reveal('#r2');
  await sleep(1800); await reveal('#r3'); await sleep(400); await reveal('#r4');
  await sleep(1500); await reveal('#r5');
});

await showCard(`<h2>clubkeep</h2>
  <div class="promise" id="p1">finds who paid,</div><div class="promise" id="p2">chases who didn't,</div>
  <div class="promise" id="p3">and returns what shouldn't be there.</div>
  <div class="promise last" id="p4">Nothing moves without your OK.</div>`);
await scene('intro', '', async () => {
  await sleep(4300); await reveal('#p1');
  await sleep(1300); await reveal('#p2');
  await sleep(1200); await reveal('#p3');
  await sleep(1800); await reveal('#p4');
});

await hideCard();
await scene('start', 'Riverside Climbing Club · 14 members · $405 in dues', async () => {
  await focus(page.locator('.ledger-card'), 3200);
});

await scene('run', 'PayPal Transaction Search → on-server AI matcher', async () => {
  await click(page.locator('#run-agent'), 400);
  await page.waitForSelector('#run-timeline', { state: 'visible', timeout: 10000 });
  await page.locator('#run-timeline').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  await sleep(1800);
  await focus(page.locator('#run-timeline'), 3600);
});

await scene('reasons', 'Nicknames, typos, initials: every match shows why', async () => {
  await tab('payments');
  await click(page.locator('#payments-grid .ag-center-cols-container .ag-row', { hasText: 'Fabi' }).first(), 3200);
  await page.locator('#pp-close').click();
  await sleep(300);
  await click(page.locator('#payments-grid .ag-center-cols-container .ag-row', { hasText: 'Leoni' }).first(), 2800);
});

await scene('inbox', 'Anything unsure, or that moves money, waits for you', async () => {
  await page.locator('#pp-close').click().catch(() => {});
  await tab('inbox');
  await focus(page.locator('[data-proposal-type="match"]', { hasText: 'Sarah' }).first(), 2900);
  await focus(page.locator('[data-proposal-type="refund"]', { hasText: 'double payment' }).first(), 1200);
  await focus(page.locator('[data-proposal-type="refund"]', { hasText: 'Mark Evans' }).first(), 2300);
  await focus(page.locator('li.batch-row', { hasText: 'Sophie' }).first(), 2000);
}, 300);

await scene('approve', 'Refund sent through PayPal Payments v2', async () => {
  await click(page.locator('[data-proposal-type="match"]', { hasText: 'Sarah' }).first().locator('.approve'), 1300);
  const lena = page.locator('[data-proposal-type="refund"]', { hasText: 'double payment' }).first();
  await click(lena.locator('.approve'), 700);
  await click(page.locator('.confirm-approve').first(), 1800);
  await focus(page.locator('.receipt').last(), 1200);
});

await scene('remind', 'Reminders go out as PayPal invoices (Invoicing v2)', async () => {
  const sophie = page.locator('li.batch-row', { hasText: 'Sophie' }).first();
  await click(sophie.locator('.toggle-msg'), 500);
  const ta = sophie.locator('textarea').first();
  if (await ta.count()) {
    await ta.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' See you at the wall!', { delay: 45 });
  }
  await click(page.locator('#approve-all-reminders'), 1400);
}, 400);

await scene('paid', 'Invoice paid → member marked Paid', async () => {
  await tab('members');
  const row = page.locator('#members-grid .ag-center-cols-container .ag-row', { hasText: 'Sophie' }).first();
  await focus(row, 900);
  await click(row.locator('.pay-invoice'), 300);
  await page.locator('#members-grid .ag-center-cols-container .ag-row', { hasText: 'Sophie' }).first().filter({ hasText: 'Paid' }).waitFor({ timeout: 6000 }).catch(() => {});
  await focus(page.locator('#members-grid .ag-center-cols-container .ag-row', { hasText: 'Sophie' }).first(), 2200);
}, 600);

await scene('history', 'Every decision and PayPal call is logged', async () => {
  await tab('activity');
}, 600);

await caption('');
await showCard(`${MARK}<h1>clubkeep</h1><p>PayPal Transaction Search · Invoicing · Refunds</p><p>On-server AI · AG Grid · open source (MIT)</p>
  <p class="small">Demo data · mock PayPal client with the same interface as the sandbox client</p>`);
await scene('close', '', async () => {}, 1500);

// ---------- encode ----------
const video = page.video();
await context.close();
await browser.close();
server.kill();
const raw = await video.path();
const mp4 = path.join(OUT, 'demo.mp4');
fs.writeFileSync(path.join(OUT, 'scenes.json'), JSON.stringify(log, null, 1));
console.log('encoding…');
// 1) the voice track: every line placed at its scene's start time
const voice = path.join(OUT, 'raw', 'voice.wav');
const inputs = [], filters = [], labels = [];
log.forEach((s, i) => {
  inputs.push('-i', path.join(VOICE, `${s.id}.wav`));
  filters.push(`[${i}:a]aresample=48000,adelay=${s.start}|${s.start}[a${i}]`);
  labels.push(`[a${i}]`);
});
filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filters.join(';'), '-map', '[aout]', '-ac', '2', voice]);
// 2) video upscaled to 1080p + voice
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-i', voice,
  '-vf', 'scale=1920:1080:flags=lanczos', '-af', 'apad', '-shortest',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', mp4]);
fs.rmSync(path.join(OUT, 'raw'), { recursive: true, force: true });
console.log(`Wrote ${mp4} (${Math.round((Date.now() - t0) / 1000)}s)`);
