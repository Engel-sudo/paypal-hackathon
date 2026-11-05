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
