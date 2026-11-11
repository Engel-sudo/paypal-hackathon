// Records the narrated demo video.
//
// 1. Starts the app with a fresh demo club (mock PayPal). AI_MODE=local uses the real MiniLM model.
// 2. Drives the browser through the demo with Playwright. The picture follows the voice: every scene
//    waits for the beats of its narration (video/narration/timing.json, made by video/narrate.py), so a
//    highlight or a click lands on the sentence that talks about it.
// 3. Captures the page as full-quality frames (Chrome screencast, 1920x1080), mixes the voice in at the
//    logged scene times and writes video/demo.mp4 plus video/demo.srt (subtitles for YouTube).
//
//   NODE_PATH=$(npm root -g) node video/record.mjs
//   LOCAL_AGGRID=/path/to/ag-grid-community ...   # offline: serve AG Grid from disk instead of the CDN
//   SUBTITLES=0 ...                               # leave the burned-in subtitles out
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
const VOICE = process.env.VOICE_DIR || path.join(OUT, 'narration');
const MP4 = process.env.VIDEO_OUT || path.join(OUT, 'demo.mp4');
const timing = JSON.parse(fs.readFileSync(path.join(VOICE, 'timing.json'), 'utf8')).scenes;
const PORT = Number(process.env.VIDEO_PORT || 3123);
const BASE = `http://127.0.0.1:${PORT}`;
const W = 1440, H = 810, SCALE = 4 / 3; // 1440x810 CSS pixels drawn at 1920x1080
const BURN_SUBS = process.env.SUBTITLES !== '0';
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

const dataDir = process.env.VIDEO_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'clubkeep-video-'));
const server = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AI_MODE: process.env.AI_MODE || 'local', PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '', ADMIN_TOKEN: '' },
  stdio: 'inherit',
});
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {}
  await sleep(200);
}
// Wait for the AI model, so the video shows the same mode a deployed instance runs in.
for (let i = 0; i < 100; i++) {
  const mode = (await (await fetch(`${BASE}/api/state`)).json()).mode;
  if (mode.aiStatus !== 'loading') { console.log(`AI: ${mode.ai} (${mode.aiStatus})`); break; }
  await sleep(300);
}
await fetch(`${BASE}/api/demo/reset`, { method: 'POST' });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, colorScheme: 'light', reducedMotion: 'no-preference' });
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

// ---------- overlays: title cards, spotlight, cursor, API chip, subtitles ----------
async function overlays() {
  await page.addStyleTag({ content: `
    #vid-card{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:#F6F4EF;color:#1A1916;font-family:Geist,system-ui,sans-serif;text-align:center;transition:opacity .5s;padding:40px 40px 110px}
    #vid-card .mark{width:68px;height:68px;margin-bottom:14px}
    #vid-card h1{font:400 84px/1 'Instrument Serif',serif;margin:0 0 10px;letter-spacing:-1px}
    #vid-card h2{font:400 52px/1.15 'Instrument Serif',serif;margin:0 0 6px;letter-spacing:-.4px}
    #vid-card p{font-size:22px;margin:5px 0;color:#5E5A52;max-width:900px;line-height:1.4}
    #vid-card .eyebrow{font:500 14px 'Geist Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#8A857B;margin-bottom:12px}
    #vid-card .rows{display:grid;gap:12px;width:960px;margin-top:26px}
    #vid-card .row{display:grid;grid-template-columns:48px 200px 1fr 90px;align-items:center;gap:18px;background:#fff;border:1px solid #E7E3DA;
      border-radius:14px;padding:16px 24px;font-size:22px;text-align:left;opacity:0;transform:translateY(10px);transition:opacity .45s,transform .45s,border-color .3s,box-shadow .3s;
      box-shadow:0 1px 2px rgba(26,25,22,.04)}
    #vid-card .row.on{opacity:1;transform:none}
    #vid-card .row.hot{border-color:#F4D35E;box-shadow:0 0 0 3px rgba(244,211,94,.45)}
    #vid-card .row .av{width:46px;height:46px;border-radius:50%;background:#EFEBE2;display:grid;place-items:center;font:600 15px Geist,sans-serif;color:#5E5A52}
    #vid-card .row .who{font-weight:600}
    #vid-card .row .who small{display:block;font:400 15px Geist,sans-serif;color:#8A857B}
    #vid-card .row code{font:500 20px 'Geist Mono',monospace;background:#FCF6DF;padding:3px 9px;border-radius:6px;justify-self:start}
    #vid-card .row b{font:600 24px 'Geist Mono',monospace;text-align:right;color:#1F5F4A}
    #vid-card .ask{font:400 52px/1.2 'Instrument Serif',serif;margin-top:26px;opacity:0;transition:opacity .6s}
    #vid-card .ask.on{opacity:1}
    #vid-card .line{font:400 34px/1.3 'Instrument Serif',serif;opacity:0;transform:translateY(8px);transition:opacity .5s,transform .5s;margin:3px 0}
    #vid-card .line.on{opacity:1;transform:none}
    #vid-card .line em{font-style:normal;color:#1F5F4A}
    #vid-card .apis{display:flex;gap:10px;justify-content:center;margin-top:26px;opacity:0;transition:opacity .5s}
    #vid-card .apis.on{opacity:1}
    #vid-card .apis span{font:500 15px 'Geist Mono',monospace;border:1px solid #D9D4C8;border-radius:999px;padding:7px 14px;background:#fff}
    #vid-card .small{font:500 14px 'Geist Mono',monospace;color:#8A857B;margin-top:22px}
    #vid-spot{position:fixed;z-index:99990;pointer-events:none;border-radius:14px;outline:3px solid #F4D35E;outline-offset:0;
      box-shadow:0 0 0 4000px rgba(26,25,22,.36);opacity:0;transition:top .5s cubic-bezier(.4,0,.2,1),left .5s cubic-bezier(.4,0,.2,1),width .5s cubic-bezier(.4,0,.2,1),height .5s cubic-bezier(.4,0,.2,1),opacity .35s}
    #vid-cursor{position:fixed;z-index:100002;left:0;top:0;width:26px;height:26px;pointer-events:none;transform:translate(700px,460px);
      transition:transform .55s cubic-bezier(.3,.1,.2,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))}
    #vid-ripple{position:fixed;z-index:100001;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(244,211,94,.55);pointer-events:none;opacity:0}
    #vid-ripple.go{animation:vid-rip .5s ease-out}
    @keyframes vid-rip{from{opacity:.9;transform:scale(.3)}to{opacity:0;transform:scale(1.5)}}
    #vid-chip{position:fixed;z-index:100001;right:24px;bottom:${BURN_SUBS ? 92 : 24}px;display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #D9D4C8;border-radius:10px;
      padding:9px 14px;font:500 14px 'Geist Mono',monospace;color:#1A1916;box-shadow:0 8px 24px -8px rgba(26,25,22,.3);opacity:0;transform:translateY(8px);transition:opacity .35s,transform .35s;pointer-events:none}
    #vid-chip.on{opacity:1;transform:none}
    #vid-chip i{font:600 11px Geist,sans-serif;font-style:normal;letter-spacing:.08em;text-transform:uppercase;background:#1A1916;color:#F6F4EF;border-radius:5px;padding:3px 7px}
    #vid-sub{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:100003;max-width:1100px;width:max-content;
      background:rgba(26,25,22,.92);color:#F6F4EF;font:500 21px/1.35 Geist,system-ui,sans-serif;padding:10px 20px;border-radius:10px;text-align:center;transition:opacity .15s;pointer-events:none}
    #vid-sub:empty{opacity:0}
    #toasts{display:none !important}
  `});
  await page.evaluate(() => {
    const add = (id, html = '') => { const el = document.createElement('div'); el.id = id; el.innerHTML = html; document.body.appendChild(el); return el; };
    add('vid-spot'); add('vid-ripple'); add('vid-chip'); add('vid-sub');
    const cur = add('vid-cursor', '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 3l14 8.5-6.2 1.4L9.6 19z" fill="#1A1916" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>');
    cur.style.opacity = '0';
    document.addEventListener('mousemove', (e) => { cur.style.transform = `translate(${e.clientX - 5}px,${e.clientY - 3}px)`; }, true);
    document.addEventListener('mousedown', (e) => {
      const r = document.getElementById('vid-ripple');
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; r.classList.remove('go'); void r.offsetWidth; r.classList.add('go');
    }, true);
  });
}
const cursor = (on) => page.evaluate((o) => { document.getElementById('vid-cursor').style.opacity = o ? '1' : '0'; }, on);
async function showCard(html) {
  await page.evaluate((h) => {
    let el = document.getElementById('vid-card');
    if (!el) { el = document.createElement('div'); el.id = 'vid-card'; document.body.appendChild(el); }
    el.innerHTML = h; el.style.display = 'flex'; requestAnimationFrame(() => { el.style.opacity = '1'; });
  }, html);
}
async function hideCard() {
  await page.evaluate(() => { const el = document.getElementById('vid-card'); if (el) { el.style.opacity = '0'; setTimeout(() => { el.style.display = 'none'; }, 500); } });
}
const on = (sel, cls = 'on') => page.evaluate(([s, c]) => document.querySelectorAll(s).forEach((el) => el.classList.add(c)), [sel, cls]);
const off = (sel, cls) => page.evaluate(([s, c]) => document.querySelectorAll(s).forEach((el) => el.classList.remove(c)), [sel, cls]);
const chip = (text) => page.evaluate((t) => {
  const el = document.getElementById('vid-chip');
  if (t) { el.innerHTML = `<i>PayPal API</i>${t}`; el.classList.add('on'); } else el.classList.remove('on');
}, text);

// Resolves once the page has stopped scrolling, so a box measured afterwards is where the element stays.
async function settled() {
  let last = -1, same = 0;
  for (let i = 0; i < 60 && same < 3; i++) {
    const y = await page.evaluate(() => window.scrollY);
    same = y === last ? same + 1 : 0; last = y;
    await sleep(60);
  }
}
async function scrollTo(locator, block = 'center') {
  await locator.evaluate((el, b) => el.scrollIntoView({ block: b, behavior: 'smooth' }), block).catch(() => {});
  await settled();
}
// Dim the page except one element. Call again to glide to the next one; unspot() clears it.
async function spot(locator, { pad = 8, scroll = 'center' } = {}) {
  if (scroll) await scrollTo(locator, scroll); else await settled();
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return;
  await page.evaluate(([b, p]) => {
    const s = document.getElementById('vid-spot').style;
    s.left = b.x - p + 'px'; s.top = b.y - p + 'px'; s.width = b.width + 2 * p + 'px'; s.height = b.height + 2 * p + 'px'; s.opacity = '1';
  }, [box, pad]);
}
const unspot = () => page.evaluate(() => { document.getElementById('vid-spot').style.opacity = '0'; });
async function moveTo(locator) {
  const box = await locator.boundingBox();
  if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await sleep(600); }
}
async function click(locator, { scroll = true } = {}) {
  if (scroll) await scrollTo(locator);
  await moveTo(locator);
  await locator.click();
}
const tab = (name) => click(page.locator(`#tab-${name}`), { scroll: false });

// ---------- capture: full-quality frames with their timestamps ----------
const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clubkeep-frames-'));
const frames = [];
const cdp = await context.newCDPSession(page);
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const file = path.join(framesDir, `f${String(frames.length).padStart(6, '0')}.jpg`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  frames.push({ file, at: metadata.timestamp * 1000 });
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});

// ---------- scenes follow the narration ----------
let t0 = 0; // wall-clock time of the first frame
const log = [], subs = [];
function chunks(text, max = 78) { // subtitle lines of a readable length, split at sentence and clause ends
  const out = [];
  for (const sentence of text.match(/[^.?!]+[.?!]+|[^.?!]+$/g) || [text]) {
    let line = '';
    for (const part of sentence.trim().split(/(?<=,)\s+/)) {
      if (line && (line + ' ' + part).length > max) { out.push(line); line = part; } else line = line ? `${line} ${part}` : part;
    }
    if (line) out.push(line);
  }
  return out;
}
async function scene(id, fn, tail = 250) {
  const t = timing[id];
  const start = Date.now();
  log.push({ id, start: start - t0 });
  console.log(`scene ${id} at ${((start - t0) / 1000).toFixed(1)}s`);
  const at = (i, lead = 0) => sleep(start + t.beats[i].start * 1000 - lead - Date.now()); // resolves when beat i starts
  for (const b of t.beats) {
    const parts = chunks(b.text), total = parts.join('').length;
    let s = b.start;
    for (const p of parts) {
      const d = (b.end - b.start) * p.length / total;
      subs.push({ from: start - t0 + s * 1000, to: start - t0 + (s + d) * 1000 + 120, text: p });
      if (BURN_SUBS) {
        setTimeout(() => page.evaluate((x) => { document.getElementById('vid-sub').textContent = x; }, p).catch(() => {}), start + s * 1000 - Date.now());
      }
      s += d;
    }
    if (BURN_SUBS) setTimeout(() => page.evaluate((x) => { const el = document.getElementById('vid-sub'); if (el.textContent === x) el.textContent = ''; }, parts.at(-1)).catch(() => {}), start + b.end * 1000 + 150 - Date.now());
  }
  await fn(at);
  await sleep(start + t.duration * 1000 + tail - Date.now());
}

// ---------- the demo ----------
await page.goto(`${BASE}/?demo=1#/inbox`);
await page.waitForSelector('#run-agent', { timeout: 20000 });
await page.evaluate(() => document.fonts.ready);
await overlays();
const MARK = `<svg class="mark" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M40 16A18 18 0 1 0 42 26" stroke="#1A1916" stroke-width="4" stroke-linecap="round"/><path d="M17 24l6 6L44 9" stroke="#1F5F4A" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const row = (id, initials, who, mail, note, amount) => `<div class="row" id="${id}"><span class="av">${initials}</span><span class="who">${who}<small>${mail}</small></span><code>${note}</code><b>+$${amount}</b></div>`;

await showCard(`<div class="eyebrow">Riverside Climbing Club · PayPal · incoming</div><h2>Dues season.</h2>
  <div class="rows">
    ${row('r1', 'SC', 'Sarah Carter', 'sarah.carter@…', 'for max &amp; tom membership', 60)}
    ${row('r2', 'FW', 'F. Ward', 'fw.climb@…', '🧗 dues - Fabi', 30)}
    ${row('r3', 'LP', 'Lena Park', 'lena.park@…', 'fall dues Lena', 30)}
    ${row('r4', 'LP', 'Lena Park', 'lena.park@…', 'dues', 30)}
    ${row('r5', 'ME', 'Mark Evans', 'mark.evans@…', 'for the bouldering trip saturday', 15)}
  </div><div class="ask" id="ask">So who actually paid?</div>`);
await sleep(400);
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, everyNthFrame: 1 });
while (!frames.length) await sleep(20);
t0 = frames[0].at;
await sleep(500);

await scene('hook', async (at) => {
  const hot = async (sel) => { await off('#vid-card .row', 'hot'); await on(sel); await on(sel, 'hot'); };
  await at(1, 150); await hot('#r1');
  await at(2, 150); await hot('#r2');
  await at(3, 150); await hot('#r3'); await sleep(450); await on('#r4'); await on('#r4', 'hot');
  await at(4, 150); await hot('#r5');
  await at(5); await off('#vid-card .row', 'hot'); await on('#ask');
});

await showCard(`${MARK}<h1>clubkeep</h1><p>The AI treasurer for clubs that collect dues on PayPal</p>`);
await scene('intro', async (at) => {
  await at(1, 700);
  await hideCard();
  await at(1, 0);
  await spot(page.locator('.ledger-card, #fr-ledger').first(), { scroll: false });
}, 100);

await scene('run', async (at) => {
  await unspot(); await cursor(true);
  await moveTo(page.locator('#run-agent'));
  await page.locator('#run-agent').click();
  await page.waitForSelector('#run-timeline', { state: 'visible', timeout: 10000 });
  await page.locator('#run-timeline').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  await at(1, 200);
  await chip('GET /v1/reporting/transactions');
  const step = page.locator('.rt-step[data-key="transactions"]');
  for (let i = 0; i < 12; i++) { await spot(step, { scroll: false, pad: 4 }); await sleep(250); } // the list is still filling in: follow the row
  await at(2, 200);
  await chip('');
  await spot(page.locator('.rt-step[data-key="match"]'), { scroll: false, pad: 4 });
});

await scene('reasons', async (at) => {
  await unspot();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(400);
  await tab('payments');
  await scrollTo(page.locator('#payments-grid'), 'center');
  const payment = (text) => page.locator('#payments-grid .ag-center-cols-container .ag-row', { hasText: text }).first();
  await at(1, 900);
  await click(payment('Fabi'), { scroll: false });
  await moveTo(page.locator('#pp-title'));
  await spot(page.locator('#pp-body .nm-top').first().locator('xpath=..'), { scroll: false, pad: 4 });
  await at(2, 1100);
  await unspot();
  await page.locator('#pp-close').click();
  await sleep(250);
  await click(payment('Leoni'), { scroll: false });
  await moveTo(page.locator('#pp-title'));
  await spot(page.locator('#pp-body .nm-top').first().locator('xpath=..'), { scroll: false, pad: 4 });
});

const proposal = (type, text) => page.locator(`[data-proposal-type="${type}"]`, { hasText: text }).first();
await scene('ask', async (at) => {
  await unspot();
  await page.locator('#pp-close').click().catch(() => {});
  await tab('inbox');
  const sarah = proposal('match', 'Sarah');
  await scrollTo(sarah);
  await at(1, 300);
  await spot(sarah, { scroll: false });
  await at(2, 500);
  await moveTo(sarah.locator('.approve'));
  await at(2, 0);
  await unspot();
  await sarah.locator('.approve').click();
});

await scene('refund', async (at) => {
  const lena = proposal('refund', 'double payment');
  await spot(lena);
  await at(1, 300);
  await unspot();
  await click(lena.locator('.approve'));
  await sleep(1500);
  await chip('POST /v2/payments/captures/{id}/refund');
  await click(page.locator('.confirm-approve').first(), { scroll: false });
  await at(2, 500);
  await spot(page.locator('.receipt').last(), { pad: 6 });
  await at(3, 300);
  await chip('');
  const mark = proposal('refund', 'Mark Evans');
  await spot(mark);
  await sleep(2300);
  await unspot();
  await click(mark.locator('.approve'), { scroll: false });
  await sleep(600);
  await chip('POST /v2/payments/captures/{id}/refund');
  await click(page.locator('.confirm-approve').first(), { scroll: false });
});

await scene('invoices', async (at) => {
  await chip('');
  const batch = page.locator('[data-proposal-type="reminder"], .batch-card').first();
  const sophie = page.locator('li.batch-row', { hasText: 'Sophie' }).first();
  await spot(page.locator('li.batch-row').first().locator('xpath=ancestor::*[contains(@class,"card")][1]'), { scroll: 'center' }).catch(() => spot(batch));
  await at(1, 300);
  await spot(sophie, { scroll: false, pad: 4 });
  await at(2, 300);
  await unspot();
  await click(sophie.locator('.toggle-msg'), { scroll: false });
  const ta = sophie.locator('textarea').first();
  if (await ta.count()) {
    await ta.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' See you at the wall!', { delay: 35 });
  }
  await chip('POST /v2/invoicing/invoices · /send');
  await click(page.locator('#approve-all-reminders'));
});

await scene('paid', async (at) => {
  await sleep(500);
  await chip('');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await tab('members');
  const member = () => page.locator('#members-grid .ag-center-cols-container .ag-row', { hasText: 'Sophie' }).first();
  await scrollTo(member());
  await spot(member(), { scroll: false, pad: 2 });
  await sleep(700);
  await moveTo(member().locator('.pay-invoice'));
  await member().locator('.pay-invoice').click();
  await chip('GET /v2/invoicing/invoices → PAID');
  await member().filter({ hasText: 'Paid' }).waitFor({ timeout: 6000 }).catch(() => {});
}, 500);

await scene('history', async () => {
  await unspot(); await chip('');
  await tab('activity');
  await sleep(300);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(500);
  await spot(page.locator('#hero'), { scroll: false });
  await sleep(1600);
  await unspot();
  await scrollTo(page.locator('#activity'), 'start');
});

await cursor(false);
await showCard(`${MARK}<h1>clubkeep</h1>
  <div class="line" id="l1">Reads payments, refunds mistakes, sends invoices. <em>All through PayPal.</em></div>
  <div class="line" id="l2">AI that explains itself. <em>Nothing moves money without your click.</em></div>
  <div class="line" id="l3">Open source and free to run.</div>
  <div class="apis" id="apis"><span>Transaction Search</span><span>Payments v2 refunds</span><span>Invoicing v2</span><span>Webhooks</span><span>on-server MiniLM</span><span>AG Grid</span></div>
  <p class="small">github.com/Engel-sudo/paypal-hackathon · recorded on the demo club with the mock PayPal client</p>`);
await scene('close', async (at) => {
  await sleep(300); await on('#l1');
  await at(1, 100); await on('#l2');
  await at(2, 100); await on('#l3');
  await sleep(1500); await on('#apis');
}, 1200);

// ---------- encode ----------
await cdp.send('Page.stopScreencast').catch(() => {});
const end = Date.now();
await context.close();
await browser.close();
server.kill();
fs.writeFileSync(path.join(OUT, 'scenes.json'), JSON.stringify(log, null, 1));

const stamp = (ms) => { const d = new Date(Math.max(0, ms)); return d.toISOString().slice(11, 23).replace('.', ','); };
fs.writeFileSync(MP4.replace(/\.mp4$/, '.srt'), subs.map((s, i) => `${i + 1}\n${stamp(s.from)} --> ${stamp(Math.min(s.to, subs[i + 1] ? subs[i + 1].from : Infinity))}\n${s.text}\n`).join('\n'));

console.log(`encoding ${frames.length} frames…`);
// 1) frames -> constant 30 fps video; every frame is shown until the next one arrives
const list = path.join(framesDir, 'frames.txt');
fs.writeFileSync(list, 'ffconcat version 1.0\n' + frames.map((f, i) => {
  const next = frames[i + 1] ? frames[i + 1].at : end;
  return `file '${f.file}'\nduration ${(Math.max(1, next - f.at) / 1000).toFixed(4)}`;
}).join('\n') + `\nfile '${frames.at(-1).file}'\n`);
// 2) the voice track: every scene placed at its start time, lightly mastered
const inputs = ['-f', 'concat', '-safe', '0', '-i', list], filters = [], labels = [];
log.forEach((s, i) => {
  inputs.push('-i', path.join(VOICE, `${s.id}.wav`));
  filters.push(`[${i + 1}:a]aresample=48000,adelay=${Math.round(s.start)}|${Math.round(s.start)}[a${i}]`);
  labels.push(`[a${i}]`);
});
filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=longest:normalize=0,highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=160:makeup=2,loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000[aout]`);
filters.push(`[0:v]fps=30,scale=1920:1080:flags=lanczos,format=yuv420p[vout]`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]',
  '-t', ((end - t0) / 1000).toFixed(2), '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-movflags', '+faststart', MP4]);
fs.rmSync(framesDir, { recursive: true, force: true });
console.log(`Wrote ${MP4} (${Math.round((end - t0) / 1000)}s)`);
