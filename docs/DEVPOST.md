# Devpost submission text

Copy each section into the matching Devpost field. The steps before that (public repo, YouTube upload,
optional hosting) are in [`SUBMIT.md`](SUBMIT.md).

**Project name:** Clubkeep

**Tagline:** The AI treasurer for clubs: matches messy PayPal payments to members, refunds the mistakes and invoices the people who haven't paid.

---

## Inspiration

Anyone who has been treasurer of a club knows the start-of-season PayPal inbox. "for max & tom membership"
from someone called Sarah. "🧗 dues - Fabi" from F. Ward. "dues" from K. N. The same $30 from Lena, twice.
$15 from a stranger for the bouldering trip. You end up with PayPal in one tab, a spreadsheet in the other,
and an evening gone.

Sports clubs, student clubs, choirs and community groups run on volunteers, and the treasurer job changes
hands every year or two. We wanted the boring part to go away without handing member data to a paid AI
service the club would never pay for anyway.

## What it does

Clubkeep connects to a club's PayPal account and works through the dues for the current period:

- **Syncs incoming payments** from PayPal Transaction Search (a webhook endpoint can trigger the sync).
- **Matches each payment to member(s)** from the note, payer name and payer email, handling nicknames,
  initials, typos, parents paying for children, and one payment covering several members ($60 = two
  people's dues).
- **Applies confident matches automatically** and shows the reasons for each one. In the demo club, 6 of
  10 payments are matched on the first run: "Fabi" is Fabian Ward, "Leoni" is Leonie Fischer, K. N. is Kim
  Nguyen by email.
- **Asks when it isn't sure.** Sarah Carter's $60 split between Max and Tom ("Note names 'max' and 'tom'",
  "Payer shares surname Carter") and Andrea Smith's "membership fee" for Paul Smith come back as match
  proposals.
- **Detects what doesn't fit**: duplicates, overpayments, underpayments, and payments that aren't dues at all.
- **Proposes the fix as a PayPal action**: a refund through Payments v2 (Lena's duplicate, Mark's trip money),
  or an invoice through Invoicing v2, sent to the member, with a reminder later (Sophie's missing $5, and
  everyone who hasn't paid).
- **Waits for the treasurer.** Every action that moves money is a proposal you approve, reject or edit.
  Approve all reminders in one click if you like.
- **Shows everyone's status** in AG Grid: paid, partial, unpaid, overpaid, outstanding amount, invoice status.
  Export to CSV.

It runs with no keys at all against a built-in mock PayPal, so the demo always works; with sandbox keys the
same buttons hit the PayPal sandbox.

## How we built it

- **Backend:** Node 20 and Express, a JSON file store with atomic writes, and a treasurer agent that runs
  sync -> match -> auto-apply -> propose -> execute on approval.
- **PayPal:** a client interface with two implementations. The sandbox client handles OAuth2, Transaction
  Search (`/v1/reporting/transactions`), Invoicing v2 (create, send, remind, list for status), Payments v2 capture
  refunds and webhook signature verification. The mock implements the same methods in memory, plus demo
  helpers for simulating a payment or an invoice being paid.
- **AI:** transformers.js running `Xenova/all-MiniLM-L6-v2` locally on CPU for English sentence embeddings
  (payment vs. member similarity, and the note's intent: dues, event, donation, other). The quantized model
  is about 23 MB, small enough for Render's free 512 MB instance. On top sits a transparent scoring engine:
  typo-tolerant name and nickname matching, initials, payer email, shared surnames and dues arithmetic,
  producing allocations with a confidence score, reasons and alternatives. A hashed character n-gram
  embedder is the offline fallback and is used in tests.
- **Frontend:** plain JavaScript single-page app with AG Grid Community for the members and payments grids,
  a review queue and an activity log.
- **Deploy:** Render free tier via `render.yaml`.
- **Tests:** `node:test` with a fake embedder and the mock PayPal client.
- **Demo video:** recorded from the running app with Playwright, with the picture timed to each sentence of
  the narration. The voice is AI-generated with Kokoro-82M, an open-source (Apache-2.0) text-to-speech model
  run offline through `kokoro-onnx`.

## Challenges we ran into

- **Splitting one payment across several members.** Matching is easy when it's one-to-one. "for max & tom
  membership" from a parent needs the names in the note, the shared surname and the amount to agree before
  you can confidently allocate $30 + $30.
- **Knowing when not to be confident.** A wrong auto-match is worse than no match. Andrea Smith paying
  "membership fee" probably means Paul Smith, but "probably" isn't good enough to book it. We spent real time
  on the threshold and on making the reasons visible, so the treasurer can trust the green rows and focus on
  the rest.
- **Transaction Search latency in the sandbox.** New transactions aren't searchable immediately, which is
  awkward for a live demo. The mock client with the same interface let us build and demo the full flow while
  the sandbox caught up.
- **Free AI that's good enough, on a free server.** No paid API was a hard constraint, and the model has to
  fit next to the app in 512 MB. A small embedding model alone isn't enough for names and nicknames, so the
  scoring engine does the precise work and the model handles the fuzzy language.

## Accomplishments that we're proud of

- The AI doesn't stop at a suggestion: approve a proposal and a real PayPal refund or invoice goes out.
- Every automatic decision explains itself in plain language.
- It costs nothing to run: no paid AI API, free hosting tier, open source.
- The full demo works with zero setup, and the same code path runs against the PayPal sandbox.

## What we learned

- For money, explainability beats cleverness. A treasurer will accept "$60 = $30 + $30, surname Carter"
  much faster than a bare confidence score.
- A small local embedding model plus hand-written scoring rules can cover a narrow domain well, without an LLM.
- PayPal's REST APIs cover the full loop a treasurer needs (read, refund, invoice, remind, notify), so the
  product can act instead of just reporting.
- Building against a mock with the exact same interface as the real client made the sandbox integration
  a configuration change rather than a rewrite.

## What's next for Clubkeep

- Try it with real club treasurers and tune the matcher on what they actually receive.
- Bank-transfer import next to PayPal, since many clubs get dues both ways.
- PayPal Subscriptions for recurring dues and Payouts for reimbursing members' expenses.
- Remember the treasurer's manual corrections as aliases for next time.
- A handover report for the next treasurer and the annual audit.
- Other languages, in the interface and through an optional multilingual model.

## Built with

`node.js` `express` `javascript` `paypal` `paypal-rest-api` `paypal-invoicing` `paypal-transaction-search`
`paypal-webhooks` `transformers.js` `hugging-face` `sentence-transformers` `ag-grid` `render` `html` `css`

## Tools / AI used

> **AI models and services.** Clubkeep uses one AI model at runtime: `Xenova/all-MiniLM-L6-v2`, a free
> English sentence-embedding model (about 23 MB quantized), run locally inside the Node.js server with
> transformers.js (`@huggingface/transformers`). No paid or hosted AI API is called at runtime. The model
> embeds each payment (note, payer name, payer email) and each member (name, nicknames, email); similarity
> between them feeds our scoring engine, which also uses typo-tolerant name matching, initials, payer email,
> shared surnames and dues arithmetic to decide which member(s) a payment belongs to, how to split it, and
> how confident it is. The model also classifies the note's intent (dues, event, donation, other) by
> similarity to English example phrases, which is how non-dues payments are flagged for refund. A hashed
> character n-gram embedder (our own code) is used as an offline fallback and in tests. A treasurer agent
> (our code) turns the results into proposals (refund via PayPal Payments v2, invoice and reminder via
> PayPal Invoicing v2) that execute only after the treasurer approves.
>
> **Demo video.** The narration is a synthetic voiceover generated with Kokoro-82M, an open-source text-to-speech model, from our
> script.
>
> **Development tools.** Claude Code (Anthropic's AI coding assistant) wrote most of the code, tests and
> documentation under our direction, reviewed the design, and built the pipeline that records the demo
> video. Claude is not used by the app at runtime.

## Links

- Code: https://github.com/Engel-sudo/paypal-hackathon (MIT; must be public before you submit)
- Video: the YouTube link from `SUBMIT.md` step 2
- Demo: your Render URL if you deploy (`SUBMIT.md` step 3); otherwise leave this out, the README's
  three-command local run is the testing path

## Testing instructions (for the Devpost field)

Node 20 or newer. `npm install`, `npm start`, open http://localhost:3000 and click **Check PayPal
payments**. No accounts or keys are needed: without PayPal keys the app runs the same code against a
built-in mock PayPal account seeded with a fictional club. To run it against the PayPal sandbox, set
`PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` (README, "Sandbox setup").
