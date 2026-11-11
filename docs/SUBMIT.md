# Before you submit

Deadline: **Nov 12, 2026, 12:00 PST (21:00 in Germany).** Steps 1, 2 and 5 are required; do them in this order.

## 1. Make the repository public (required)

The rules ask for a public repository with an open-source license. The repo is currently **private**.
GitHub: Settings > General > Danger Zone > Change visibility > Public. The MIT license is already detected
and shows in the About box. While you are there, add a description ("Clubkeep: the AI treasurer for clubs
that collect dues on PayPal") and, if you deploy, the demo URL as the website.

## 2. Upload the video to YouTube (required)

- Upload `video/demo.mp4`. Visibility **Public** (not unlisted or private).
- Title: `Clubkeep: the AI treasurer for clubs (PayPal AI Hackathon)`.
- Subtitles: the video has them burned in. Optionally also upload `video/demo.srt` under Subtitles > English.
- The video is 2:08, has no music and no third-party footage.

## 3. Hosted demo (optional, recommended)

A working build is required as either a hosted demo or setup instructions; the README's three-command local
run covers that. A live URL still helps, because judges are more likely to click than to clone.

- Render dashboard > New > Blueprint > pick this repo. It reads `render.yaml` and creates a free service.
- Open the URL, click **Check PayPal payments**, and check that the badge at the top says
  "On-server AI (MiniLM)". If it says "Built-in matcher", the model did not load; the app still works.
- Add the URL to the Devpost form and to the repo's About box.

## 4. Real PayPal sandbox (optional, the biggest remaining improvement)

Everything in the video runs on the built-in mock PayPal client. The sandbox client
(`src/paypal/sandbox.js`) is covered by tests with recorded request shapes but has **never been run against
the real sandbox**. Judging stage 1 is pass/fail on "reasonably uses PayPal APIs", so a real run is worth
an hour if you have one:

1. developer.paypal.com > Apps & Credentials (Sandbox) > create a REST app; enable Transaction Search and Invoicing.
2. `PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... npm start`, then click **Check PayPal payments**.
3. Approve one invoice proposal and check it shows up in the sandbox business account under Invoicing.
4. If it works, say so in the Devpost text and add a screenshot of the sandbox invoice to the image gallery.
   If something fails, the error from PayPal is shown on the proposal; fix or mention it under limitations.

Transaction Search lags by up to a few hours, so payments you send today may not be searchable before the deadline.
Invoices are instant.

## 5. Fill in the Devpost form (required)

- Text for every field: [`DEVPOST.md`](DEVPOST.md).
- Image gallery: `docs/img/inbox.png` (use as the thumbnail), `members.png`, `payment-panel.png`, `firstrun.png`.
- Links: the public GitHub URL, the YouTube URL, the Render URL if you have one.
- The "tools / AI used" answer is the "Tools / AI used" section of `DEVPOST.md`.
- Check the eligibility box honestly (legal age, not from a restricted country) and submit a few hours early;
  a submission can still be edited until the deadline.

## What the rules ask for, and where it is

| Requirement | Status |
|---|---|
| Uses PayPal meaningfully | Transaction Search, Payments v2 refunds, Invoicing v2, webhooks (`src/paypal/sandbox.js`); see step 4 |
| Uses AI meaningfully | On-server MiniLM embeddings + scoring matcher + treasurer agent (`src/ai/`, `src/agent.js`) |
| Working build, not a mockup | Runs with `npm install && npm start`; 30 tests pass |
| Public repo with open-source license | MIT license present; **repo still private (step 1)** |
| Text description, tools used | `DEVPOST.md` |
| Video under 3 minutes, public on YouTube | `video/demo.mp4` is 2:08; **upload pending (step 2)** |
| English | Yes |
| New project in the submission period | Yes (first commit Nov 5, 2026) |
