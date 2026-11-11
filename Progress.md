# Progress

## 2026-10-21
- Read the hackathon page, rules and resources. Findings saved in NOTES.md.
- Brainstormed ideas. Leading ones: club treasurer payment matching, AI checkout setup for website-studio clients.

## 2026-11-05: built the club treasurer assistant ("Kassenwart")
Decisions:
- Idea: club treasurer assistant. Stack: Node 22 + Express, plain JS frontend, AG Grid Community 32.3.3.
- No paid AI API. AI runs on the server for free: transformers.js sentence embeddings
  (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`) for payment intent, plus an evidence-scoring matcher
  (noisy-OR over email, names, nicknames, typos, initials, family surname, learned payers, amount fit).
  Hashed n-gram embedder as fallback and for tests.
- PayPal: Transaction Search (incoming payments), Invoicing v2 (reminders as invoices, /remind),
  Payments v2 captures refund, webhook verification. Mock client behind the same interface until
  `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` are set.
- Human in the loop: confident matches (>= 0.8) auto-apply, everything that moves money is a proposal.

Done:
- PLAN.md, docs/API.md (contract), backend (src/, server.js), 29 tests (`npm test`, all green).
- Frontend (public/) with members/payments grids, agent inbox, activity log.
- README with sections for the 5 judging criteria, MIT LICENSE, docs/PITCH.md, docs/DEVPOST.md, docs/VIDEO_SCRIPT.md.
- render.yaml (free plan).
- video/demo.mp4 (1:52, 1080p, burned-in captions, no voice) recorded by `video/record.mjs`
  (`NODE_PATH=$(npm root -g) node video/record.mjs`). Screenshots in docs/img/.

Not verified here (blocked network in the build sandbox):
- Real PayPal sandbox calls (api-m.sandbox.paypal.com not reachable from the build box). Request shapes are
  covered by fake-fetch tests only.
- Loading the local model from Hugging Face. The app falls back to the hashed embedder if it fails;
  the mode badge shows which one is active. Watch memory on Render's free plan (512 MB); set
  `AI_MODE=hashed` if the instance runs out.

## Next
- Create PayPal developer sandbox app, enable Transaction Search + Invoicing, set keys on Render.
- Send 5 to 10 test payments with messy notes from sandbox personal accounts (Transaction Search lags).
- Deploy on Render, check memory with the local model, fill the hosted URL TODOs.
- Record the voiceover from docs/VIDEO_SCRIPT.md over video/demo.mp4, add the sandbox dashboard shot, upload to YouTube.
- Talk to 2 to 3 real treasurers; put their real quotes into the README/PITCH TODOs.
- Register on Devpost, paste docs/DEVPOST.md, submit by Nov 10.

## 2026-11-05 (later): English-only, redesign, narrated video
- Renamed to **Clubkeep**. Removed all German content: demo club is "Riverside Climbing Club" in USD with English notes;
  intent prototypes English; default model switched to `Xenova/all-MiniLM-L6-v2` (smaller, fits Render free).
- Design: three critique agents (fintech visual, UX/copy, judge + accessibility) → one brief → redesign agent.
  "Club ledger" identity (warm paper, ink, green for money landed, yellow highlighter for agent notes), self-hosted
  Geist / Geist Mono / Instrument Serif, inbox-first flow with first-run state, live agent-run timeline
  (`lastRun.steps`), PayPal receipt chips (`proposal.receipt`), batched invoice card, refund confirm step,
  AG Grid flash cells + pinned totals + tooltips + saved column state, WCAG fixes, `?demo=1` presentation zoom.
- Video: narrated with Kokoro-82M TTS (offline, Apache-2.0) from `video/narration.json` (`video/narrate.py`);
  `video/record.mjs` syncs each scene to its voice line and mixes the voice in. 1:44, 1080p, loudness-normalized.
- 30 tests green.

## 2026-11-11: video redone, docs finalised, requirements checked
- Video (`video/demo.mp4`, 2:08): new script (problem and audience first, then the flow once, in order), narration
  split into beats so highlights and clicks land on the sentence that mentions them, spotlight + visible cursor,
  PayPal endpoint chip per step, burned-in subtitles plus `video/demo.srt`, crisp 1080p frames instead of an
  upscaled screen recording. Voice: full Kokoro model (the int8 one sounded rough), "Fabi" no longer read as
  "Fab-eye". Recorded with the real MiniLM model, not the fallback.
- Verified for the first time: the MiniLM model loads and gives the same demo result as the fallback
  (6 of 10 booked, 10 proposals).
- README / PITCH / DEVPOST: placeholder TODOs removed, development tools stated, button names corrected.
- `docs/SUBMIT.md`: what is left to do by hand, in order, and a requirements table.

Still not verified: real PayPal sandbox calls (no sandbox keys; the build box cannot reach PayPal).

## Next (all by hand, see docs/SUBMIT.md)
- Make the repo public. Upload the video to YouTube. Fill in Devpost.
- Optional: deploy on Render; run once against the PayPal sandbox.
