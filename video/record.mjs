// Records the demo video: starts the app with a fresh demo club, drives the browser through the
// demo flow with burned-in captions and title cards, and writes video/demo.mp4 (needs ffmpeg).
//
//   NODE_PATH=$(npm root -g) node video/record.mjs   # records against a fresh local server
//   LOCAL_AGGRID=/path/to/ag-grid-community/package node video/record.mjs   # offline: serve AG Grid from disk
//
// No voice track: record the voiceover from docs/VIDEO_SCRIPT.md over it.
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

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  recordVideo: { dir: path.join(OUT, 'raw'), size: { width: W, height: H } },
  colorScheme: 'light',
});
if (process.env.LOCAL_AGGRID) {
  await context.route(/cdn\.jsdelivr\.net\/npm\/ag-grid-community@32\.3\.3\/(.*)$/, (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^\/npm\/ag-grid-community@32\.3\.3\//, '');
    const file = path.join(process.env.LOCAL_AGGRID, rel);
    route.fulfill({ path: file, contentType: file.endsWith('.css') ? 'text/css' : 'application/javascript' });
  });
}
const page = await context.newPage();

// ---------- overlay helpers ----------
async function overlays() {
  await page.addStyleTag({ content: `
    #vid-caption{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;max-width:80%;
      background:rgba(15,23,42,.92);color:#fff;font:600 22px/1.35 system-ui,sans-serif;padding:14px 26px;border-radius:14px;
      box-shadow:0 10px 30px rgba(0,0,0,.25);text-align:center;transition:opacity .3s;pointer-events:none}
    #vid-card{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:linear-gradient(135deg,#0b1f3a,#123d6b 60%,#0b6b5c);color:#fff;font-family:system-ui,sans-serif;text-align:center;
      transition:opacity .5s;padding:40px}
    #vid-card h1{font-size:64px;margin:0 0 18px;letter-spacing:-1px}
    #vid-card p{font-size:28px;margin:6px 0;opacity:.92;max-width:1100px;line-height:1.4}
    #vid-card .notes{margin-top:28px;display:grid;gap:12px;width:min(900px,90%)}
    #vid-card .note{display:flex;justify-content:space-between;gap:20px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);
      border-radius:12px;padding:14px 20px;font-size:24px;text-align:left}
    #vid-card .note code{font-family:ui-monospace,Menlo,monospace;color:#ffe08a}
    .vid-focus{outline:4px solid #f59e0b !important;outline-offset:3px;border-radius:10px;transition:outline .2s}
  `});
}
async function caption(text) {
  await page.evaluate((t) => {
    let el = document.getElementById('vid-caption');
    if (!el) { el = document.createElement('div'); el.id = 'vid-caption'; document.body.appendChild(el); }
    el.textContent = t; el.style.opacity = t ? '1' : '0';
  }, text);
}
async function card(html, ms) {
  await page.evaluate((h) => {
    let el = document.getElementById('vid-card');
    if (!el) { el = document.createElement('div'); el.id = 'vid-card'; document.body.appendChild(el); }
    el.innerHTML = h; el.style.opacity = '1'; el.style.display = 'flex';
  }, html);
  await sleep(ms);
  await page.evaluate(() => { const el = document.getElementById('vid-card'); el.style.opacity = '0'; setTimeout(() => { el.style.display = 'none'; }, 500); });
  await sleep(600);
}
async function focus(locator, ms = 1500) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.evaluate((el) => el.classList.add('vid-focus')).catch(() => {});
  await sleep(ms);
  await locator.evaluate((el) => el.classList.remove('vid-focus')).catch(() => {});
}
async function click(locator, pause = 900) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();
  if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 }); await sleep(250); }
  await locator.click();
  await sleep(pause);
}
const tab = (name) => click(page.locator(`#tab-${name}`), 1200);

// ---------- the demo ----------
const started = Date.now();
await fetch(`${BASE}/api/demo/reset`, { method: 'POST' });
await page.goto(BASE);
await page.waitForSelector('#members-grid .ag-row', { timeout: 20000 });
await overlays();

const notes = [
  ['Sarah Carter', 'for max & tom membership', '$60'],
  ['F. Ward', '🧗 dues - Fabi', '$30'],
  ['Lena Park', 'dues', '$30 (again)'],
  ['Andrea Smith', 'membership fee', '$30'],
  ['Mark Evans', 'for the bouldering trip saturday', '$15'],
];
await card(`<h1>Clubkeep</h1><p>The AI treasurer for clubs</p>`, 3500);
await card(`<p style="font-size:34px;font-weight:700">A club's PayPal inbox at the start of the season</p>
  <div class="notes">${notes.map(([who, n, a]) => `<div class="note"><span>${who}</span><code>${n}</code><b>${a}</b></div>`).join('')}</div>`, 11000);
await card(`<p style="font-size:34px;font-weight:700">Who paid for whom?</p>
  <p>Every sports club, student club and community group has a volunteer treasurer who works this out by hand, in a spreadsheet, every season.</p>
  <p style="margin-top:24px">Clubkeep does it for them, with PayPal and a free AI model.</p>`, 9000);

await caption('14 members, nobody marked as paid yet');
await focus(page.locator('#members-grid'), 3000);

await caption('One click: the agent syncs payments from PayPal and matches them to members');
await click(page.locator('#run-agent'), 2500);
await focus(page.locator('#members-grid'), 3500);

await tab('payments');
await caption('Every match comes with reasons and a confidence score');
const sarah = page.locator('#payments-grid .ag-row', { hasText: 'Sarah' }).first();
await click(sarah, 1200);
await sleep(5000);
await page.keyboard.press('Escape').catch(() => {});
await page.locator('.panel-close, [data-close], .side-panel .close').first().click({ timeout: 1000 }).catch(() => {});
const fabi = page.locator('#payments-grid .ag-row', { hasText: 'Fabi' }).first();
await caption('Nicknames, typos, initials, parents paying: matched automatically');
await click(fabi, 1200);
await sleep(4000);
await page.keyboard.press('Escape').catch(() => {});
await page.locator('.panel-close, [data-close], .side-panel .close').first().click({ timeout: 1000 }).catch(() => {});

await tab('inbox');
await caption('Anything the AI isn\'t sure about, or that moves money, waits for one click');
await sleep(3500);
for (const [type, text, line] of [
  ['match', 'Sarah', 'A parent pays $60 for two kids: split between Max and Tom'],
  ['refund', 'duplicate', 'Lena paid twice: refund the second payment'],
  ['refund', 'Mark Evans', 'Not a member, paid for a trip: refund or keep'],
  ['reminder', 'Sophie', 'Sophie is $5 short: invoice her for the rest'],
]) {
  await caption(line);
  await focus(page.locator(`[data-proposal-type="${type}"]`, { hasText: text }).first(), 3500);
}

await caption('Approve the split payment');
await click(page.locator('[data-proposal-type="match"]', { hasText: 'Sarah' }).first().locator('.approve'), 2000);
await caption('Approve the refund: issued through the PayPal Payments API');
await click(page.locator('[data-proposal-type="refund"]', { hasText: 'duplicate' }).first().locator('.approve'), 3500);

const firstReminder = page.locator('[data-proposal-type="reminder"]').first();
const ta = firstReminder.locator('textarea');
if (await ta.count()) {
  await caption('Reminders become PayPal invoices. Edit the message if you like…');
  await ta.scrollIntoViewIfNeeded();
  await ta.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' See you at the wall! 🧗', { delay: 60 });
  await sleep(1200);
}
await caption('…or approve them all at once (PayPal Invoicing v2: create + send)');
const all = page.locator('button', { hasText: /approve all reminders/i }).first();
if (await all.count()) await click(all, 4000);
else await click(firstReminder.locator('.approve'), 3000);

await tab('members');
await caption('Invoices sent. The members grid shows every invoice and its status');
await focus(page.locator('#members-grid'), 4000);

await caption('When a member pays the invoice, they flip to Paid');
const pay = page.locator('.pay-invoice').first();
if (await pay.count()) await click(pay, 3500);
await focus(page.locator('#members-grid'), 3000);

await tab('activity');
await caption('Every agent decision and PayPal call is logged');
await sleep(4000);
await tab('members');
await caption('');

await card(`<h1>Clubkeep</h1>
  <p>The AI treasurer for clubs</p>
  <p>Free local AI · PayPal Transaction Search, Invoicing &amp; Refunds · AG Grid</p>
  <p style="margin-top:24px">Open source (MIT) · Deploys on Render</p>`, 5000);

const seconds = Math.round((Date.now() - started) / 1000);
const video = page.video();
await context.close();
await browser.close();
server.kill();

const raw = await video.path();
const mp4 = path.join(OUT, 'demo.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
fs.rmSync(path.join(OUT, 'raw'), { recursive: true, force: true });
console.log(`Wrote ${mp4} (~${seconds}s)`);
