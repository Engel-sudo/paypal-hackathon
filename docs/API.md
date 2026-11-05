# HTTP API (contract between backend and frontend)

All responses are JSON. Every write endpoint returns the full `State` so the UI can just re-render.
If env `ADMIN_TOKEN` is set, write endpoints need header `x-admin-token`; on 401 the UI should
prompt for the token once and keep it in localStorage.

## GET /api/state -> State
```jsonc
{
  "mode": { "paypal": "mock" | "sandbox", "ai": "local-model" | "hashed-ngrams", "aiModel": "Xenova/...", "adminRequired": false },
  "settings": { "clubName": "...", "period": "Winter semester 2026/27", "periodStart": "2026-10-01",
                "dueDate": "2026-11-15", "currency": "EUR", "defaultDues": 30, "autoApplyThreshold": 0.8 },
  "summary": { "members": 14, "paid": 6, "partial": 1, "unpaid": 7, "overpaid": 0,
               "expected": 405, "collected": 240, "openProposals": 9, "unmatchedPayments": 3 },
  "members": [ {
      "id": "m01", "name": "Lena Hoffmann", "email": "...", "nicknames": ["..."], "dues": 30,
      "paid": 30, "outstanding": 0, "credit": 0,          // credit = paid beyond dues
      "status": "paid" | "partial" | "unpaid" | "overpaid",
      "lastPaymentAt": "2026-10-03T10:00:00Z" | null,
      "invoice": { "id": "INV2-...", "status": "SENT" | "PAID" | ..., "reminders": 1, "url": "..." } | null
  } ],
  "payments": [ {
      "id": "8MC5...", "date": "...", "payerName": "Sabine Becker", "payerEmail": "...",
      "amount": 60, "refunded": 0, "currency": "EUR", "note": "für max & tom beitrag", "source": "paypal" | "invoice",
      "intent": { "label": "dues" | "event" | "donation" | "other", "score": 0.71 },
      "status": "matched" | "needs_review" | "unmatched" | "refunded" | "ignored",
      "allocations": [ { "memberId": "m02", "memberName": "Max Becker", "amount": 30 } ],
      "match": {                                         // the AI's best guess, also present when matched
        "confidence": 0.93,
        "allocations": [ { "memberId": "m02", "memberName": "Max Becker", "amount": 30 } ],
        "reasons": [ "Note names 'max' and 'tom'", "Payer shares surname Becker", "60 = 2 x 30 dues" ],
        "alternatives": [ { "memberId": "...", "memberName": "...", "score": 0.4 } ]
      } | null
  } ],
  "proposals": [ {
      "id": "p_...", "type": "match" | "refund" | "reminder" | "review",
      "status": "pending" | "done" | "rejected" | "failed",
      "title": "Refund duplicate payment from Lena Hoffmann",
      "detail": "Lena already paid 30 EUR on Oct 3. This second 30 EUR on Oct 9 looks like a duplicate.",
      "confidence": 0.88,
      "paymentId": "..." | null, "memberId": "..." | null, "amount": 30 | null,
      "message": "text that goes to the member (reminder/refund note)" | null,
      "result": "Refund 7XY... COMPLETED" | null, "createdAt": "...", "decidedAt": "..." | null
  } ],
  "log": [ { "at": "...", "kind": "agent" | "paypal" | "user" | "error", "message": "..." } ]
}
```

## Endpoints
| Method | Path | Body | Does |
|---|---|---|---|
| GET | /api/state | | everything above |
| POST | /api/agent/run | | sync PayPal (transactions + invoices), match, auto-apply confident matches, create proposals |
| POST | /api/proposals/:id/approve | `{ "message"?: string }` (edited member message) | executes: match -> allocate, refund -> PayPal refund, reminder -> PayPal invoice send/remind |
| POST | /api/proposals/:id/reject | | marks rejected |
| POST | /api/proposals/approve-all | `{ "type"?: "match" \| "reminder" \| "refund" }` | approves every pending proposal (of that type) |
| POST | /api/payments/:id/assign | `{ "allocations": [ { "memberId", "amount" } ] }` | manual match (empty array = ignore payment) |
| POST | /api/members | `{ name, email, nicknames?: string[], dues? }` | add member |
| PUT | /api/members/:id | partial member | edit |
| DELETE | /api/members/:id | | remove |
| PUT | /api/settings | partial settings | edit |
| GET | /api/export.csv | | members CSV |
| POST | /api/demo/simulate-payment | `{ payerName, payerEmail?, amount, note }` (all optional -> random messy one) | mock only: new incoming PayPal payment |
| POST | /api/demo/pay-invoice/:invoiceId | | mock only: member pays the invoice |
| POST | /api/demo/reset | | reseed club and mock PayPal |
| POST | /api/webhooks/paypal | PayPal webhook | verifies (if PAYPAL_WEBHOOK_ID) and runs a sync |
| GET | /api/health | | `{ ok: true }` |

Errors: `{ "error": "message" }` with 4xx/5xx.
