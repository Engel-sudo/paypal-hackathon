# Devpost submission text

Copy each section into the matching Devpost field. Items marked TODO need to be filled in or removed
before submitting.

**Project name:** Kassenwart

**Tagline:** The AI club treasurer: matches messy PayPal payments to members, refunds the mistakes and invoices the people who haven't paid.

---

## Inspiration

Anyone who has been treasurer of a club knows the start-of-semester PayPal inbox. "für max & tom beitrag"
from someone called Sabine. "dues - Fabi" from an email address nobody recognises. The same 30 euros from
Lena, twice. 15 euros from a stranger for the bouldering trip. You end up with PayPal in one tab, a
spreadsheet in the other, and an evening gone.

Small clubs, student clubs and German *Vereine* run on volunteers, and the treasurer job changes hands every
year or two. We wanted the boring part to go away without handing member data to a paid AI service the club
would never pay for anyway.

> [TODO: if you talked to a real treasurer, add one sentence about what they told you. Do not invent it.]

## What it does

Kassenwart connects to a club's PayPal account and works through the dues for the current period:

- **Syncs incoming payments** from PayPal Transaction Search (a webhook endpoint can trigger the sync).
- **Matches each payment to member(s)** from the note, payer name and payer email, handling nicknames, typos,
  umlauts, German and English, parents paying for children, and one payment covering several members
  (60 EUR = two people's dues).
- **Applies confident matches automatically** and shows the reasons for each one ("Note names 'max' and
  'tom'", "Payer shares surname Becker", "60 = 2 x 30 dues").
- **Detects what doesn't fit**: duplicates, overpayments, underpayments, and payments that aren't dues at all.
- **Proposes the fix as a PayPal action**: a refund through Payments v2, or an invoice through Invoicing v2,
  sent to the member, with a reminder later.
- **Waits for the treasurer.** Every action that moves money is a card you approve, reject or edit. Approve
  all reminders in one click if you like.
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
- **AI:** transformers.js running `Xenova/paraphrase-multilingual-MiniLM-L12-v2` locally on CPU for
  multilingual sentence embeddings (payment vs. member similarity, and the note's intent: dues, event,
  donation, other). On top sits a transparent scoring engine: typo-tolerant name and nickname matching,
  umlaut folding, payer email, shared surnames and dues arithmetic, producing allocations with a confidence
  score, reasons and alternatives. A hashed character n-gram embedder is the offline fallback and is used in tests.
- **Frontend:** plain JavaScript single-page app with AG Grid Community for the members and payments grids,
  a review queue and an activity log.
- **Deploy:** Render free tier via `render.yaml`.
- **Tests:** `node:test` with a fake embedder and the mock PayPal client.

## Challenges we ran into

- **Splitting one payment across several members.** Matching is easy when it's one-to-one. "für max & tom"
  from a parent needs the names in the note, the shared surname and the amount to agree before you can
  confidently allocate 30 + 30.
- **Knowing when not to be confident.** A wrong auto-match is worse than no match. We spent real time on
  the threshold and on making the reasons visible, so the treasurer can trust the green rows and focus on the rest.
- **Transaction Search latency in the sandbox.** New transactions aren't searchable immediately, which is
  awkward for a live demo. The mock client with the same interface let us build and demo the full flow while
  the sandbox caught up.
- **Free AI that's good enough.** No paid API was a hard constraint. A small multilingual embedding model
  alone isn't enough for names and nicknames, so the scoring engine does the precise work and the model
  handles the fuzzy language.

**[TODO: add any challenge that actually happened during the build, e.g. a specific PayPal API surprise.]**

## Accomplishments that we're proud of

- The AI doesn't stop at a suggestion: approve a card and a real PayPal refund or invoice goes out.
- Every automatic decision explains itself in plain language.
- It costs nothing to run: no paid AI API, free hosting tier, open source.
- The full demo works with zero setup, and the same code path runs against the PayPal sandbox.

## What we learned

- For money, explainability beats cleverness. A treasurer will accept "60 = 2 x 30 dues, surname Becker"
  much faster than a bare confidence score.
- A small local embedding model plus hand-written scoring rules can cover a narrow domain well, without an LLM.
- PayPal's REST APIs cover the full loop a treasurer needs (read, refund, invoice, remind, notify), so the
  product can act instead of just reporting.
- Building against a mock with the exact same interface as the real client made the sandbox integration
  a configuration change rather than a rewrite.

## What's next for Kassenwart

- Try it with real club treasurers and tune the matcher on what they actually receive.
- Bank-transfer import next to PayPal, since many Vereine get dues both ways.
- PayPal Subscriptions for recurring dues and Payouts for reimbursing members' expenses.
- Remember the treasurer's manual corrections as aliases for next time.
- A handover report for the next treasurer and the annual cash audit.
- German UI.

## Built with

`node.js` `express` `javascript` `paypal` `paypal-rest-api` `paypal-invoicing` `paypal-transaction-search`
`paypal-webhooks` `transformers.js` `hugging-face` `sentence-transformers` `ag-grid` `render` `html` `css`

## Tools / AI used

> **AI models and services.** Kassenwart uses one AI model: `Xenova/paraphrase-multilingual-MiniLM-L12-v2`,
> a free multilingual sentence-embedding model, run locally inside the Node.js server with transformers.js
> (`@huggingface/transformers`). No paid or hosted AI API is called at runtime. The model embeds each
> payment (note, payer name, payer email) and each member (name, nicknames, email); similarity between them
> feeds our scoring engine, which also uses typo-tolerant name matching, payer email, shared surnames and
> dues arithmetic to decide which member(s) a payment belongs to, how to split it, and how confident it is.
> The model also classifies the note's intent (dues, event, donation, other) by similarity to example
> phrases, which is how non-dues payments are flagged for refund. A hashed character n-gram embedder
> (our own code) is used as an offline fallback and in tests. A treasurer agent (our code) turns the results
> into proposals (refund via PayPal Payments v2, invoice and reminder via PayPal Invoicing v2) that execute
> only after the treasurer approves.
>
> **Development tools.** [TODO: list the AI coding assistants used during development, e.g. which
> assistant and for what, so the Tools section is complete and accurate.]

## Links

- Demo: `https://kassenwart.onrender.com` [TODO: confirm]
- Video: [TODO: YouTube link]
- Code: [TODO: GitHub URL, with the MIT license visible in About]

## Sandbox logins for judges (optional)

[TODO: if you configure the hosted demo against the sandbox, decide whether to share a sandbox
personal-account login so judges can send a test payment. Never share real credentials.]
