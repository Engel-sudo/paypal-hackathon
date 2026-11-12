# Clubkeep (PayPal AI Hackathon entry)

An AI treasurer for clubs: matches PayPal payments to members, proposes refunds, sends dues invoices.

- Stack: Node 22 + Express, plain JS frontend with AG Grid Community, transformers.js MiniLM on the server,
  PayPal REST (Transaction Search, Invoicing v2, Payments v2 refunds, webhooks).
- Run: `npm install`, `npm start`. Tests: `npm test`. Sandbox connection check: `npm run sandbox:check`.
- Overview and setup: `README.md`. API contract: `docs/API.md`. Video pipeline: `docs/VIDEO_SCRIPT.md`.
