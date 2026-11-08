# Build plan: Clubkeep, the AI treasurer for clubs

Goal: a complete, deployable hackathon entry built on 2026-11-05. Submit by Nov 10.

## Product in one line
A club treasurer connects the club's PayPal account. The assistant reads every incoming
payment, works out which member(s) it was for from messy notes ("for max & tom membership"),
proposes refunds for duplicates and strangers, and chases people who haven't paid through
PayPal invoices. The treasurer approves with one click. AG Grid shows the members and their status.

## Constraints (from the user)
- No paid AI API. The AI runs locally on the server: a free sentence-embedding model
  (transformers.js, `Xenova/all-MiniLM-L6-v2`, English, ~23 MB quantized, chosen to fit Render's
  free 512 MB instance) plus a scoring engine. Intent prototypes are English phrases.
  A hashed n-gram embedder is the fallback (offline, tests).
- Audience is international: sports clubs, student clubs, choirs, hobby and community groups,
  alumni associations. Demo currency USD.
- PayPal sandbox keys from `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`. Mock client behind
  the same interface until then.
- Hosted on Render's free tier.

## Architecture
```
server.js               Express: JSON API + static frontend
src/paypal/index.js     picks real or mock client from env
src/paypal/sandbox.js   real client: OAuth, Transaction Search, Invoicing v2, Payments v2 refunds, webhook verify
src/paypal/mock.js      in-memory PayPal with the same methods + demo helpers
src/ai/embedder.js      local transformers.js embedder, hashed fallback
src/ai/matcher.js       payment -> member allocation with confidence + reasons; note intent
src/agent.js            treasurer agent: sync, match, detect duplicates/overpay/strangers, plan reminders; execute approved actions
src/ledger.js           per-member paid / outstanding / status
src/store.js, seed.js   JSON file store, demo club
public/                 single page app, AG Grid Community 32.3.3 from jsDelivr
test/                   node:test, fake embedder + mock PayPal
docs/                   API contract, pitch docs, video script
video/                  Playwright recorder -> demo.mp4
```

## Work split (parallel)
| Track | Owner | Output |
|---|---|---|
| Backend + tests | main session | src/, server.js, test/ |
| Frontend | agent "frontend" | public/ against docs/API.md, mock-friendly |
| Pitch + README + license | agent "docs" | README.md (5 judging criteria), LICENSE, docs/PITCH.md, docs/DEVPOST.md, docs/VIDEO_SCRIPT.md |
| Video | main session after integration | video/record.mjs, video/demo.mp4 (captioned, AI-generated narration from docs/VIDEO_SCRIPT.md via a free text-to-speech tool) |
| Deploy config | main session | render.yaml |

## Demo flow (the video follows this)
Demo club: "Riverside Climbing Club (demo)", 2026–27 season, 14 members, dues $30 (Mia Sato $15
student rate), $405 expected.

1. Problem: 14 members, 10 PayPal payments with messy notes, the treasurer does this by hand in a spreadsheet.
2. Click **Run treasurer agent**: payments sync from PayPal, 6 get matched automatically, with reasons
   (Lena Park, J. Kowalski by initials, Sophie Ward's partial $25, "Fabi" = Fabian Ward,
   kim.nguyen@example.com by email, "Leoni" = Leonie Fischer).
3. Review queue: 2 match proposals (Sarah Carter's $60 split across Max and Tom Carter; Andrea Smith's
   "membership fee" for Paul Smith, low confidence), 2 refund proposals (Lena Park's duplicate $30,
   Mark Evans' $15 for the bouldering trip), 6 invoice reminders (incl. Sophie Ward's missing $5).
4. Approve the refunds: real PayPal refund calls. Approve reminders: PayPal invoices created and sent.
5. Simulate a member paying an invoice: the grid flips to Paid.
6. Close: AG Grid with everyone's status, export CSV.

## Definition of done
- `npm test` green; `npm start` works with no env vars (mock + hashed embedder).
- With sandbox keys the same buttons hit PayPal sandbox.
- README with sections for the 5 criteria, MIT license, render.yaml, Progress.md updated.
- video/demo.mp4 under 3 minutes.
