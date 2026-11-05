# PayPal AI Hackathon: research & brainstorm notes

Source: https://paypalaihackathon.devpost.com/ (+ /rules, /resources). Researched 2026-10-21.
Status (2026-10-24): brainstorm stage. No idea picked, not registered/built yet.

## Key facts
- Deadline: **Nov 12, 2026, 12:00 PST = 21:00 Germany**. Submission period opened Oct 1.
- Judging Dec 1–15, winners ~Dec 21.
- Online, worldwide, solo or team. New project, or an existing one significantly updated during the period.
- ~18k registered (most won't submit).
- Requirement: must meaningfully use **PayPal (sandbox)** AND **AI**. No tracks, no fixed problem.

## Submission checklist
- [ ] Working build: hosted demo URL OR complete setup instructions (mockups get disqualified)
- [ ] Public GitHub repo with all code and an open-source license visible in About
- [ ] Text description of features
- [ ] Tools section: which AI models/services were used and how
- [ ] Demo video **< 3 min**, public on YouTube, shown on the target device, no copyrighted music
- [ ] English
- [ ] If existing project: explain what was changed during the period

## Judging
- **Stage 1 (pass/fail):** fits the theme + reasonably uses PayPal APIs/SDKs.
- **Stage 2:** 5 **equally weighted** criteria:
  1. Technological Implementation (depth of PayPal + AI, non-trivial, working)
  2. Design (complete, coherent product, not a proof of concept)
  3. Potential Impact (real problem, specific real audience)
  4. Innovation/Idea (novel, differs from existing concepts)
  5. Presentation (video shows the flow end to end, with problem / who / why)
- Ties broken in criteria order → Tech Implementation first.
- Judges **may not run the app** (may judge only on text + video). Judging may use **AI-driven analysis**.

## Prizes
- 1st $12k, 2nd $8k, 3rd $5k
- $5k each: Most Creative, Most Impactful, Best Demo Delivery, Best Use of PayPal + AI, Best Use of Agentic Commerce
- Sponsors: **AG Grid** $5k / $2k / $1k×3 (5 winners, the best sponsor odds); APIMatic $1k×3; Bryntum $1k×3; Channel3 $1.5k; Render credits ($1k/$750/$500)
- A project can win at most 1 grand/category prize + 1 sponsor prize.

## Useful resources
- PayPal Agent Toolkit, PayPal MCP server, REST API, JS SDK v6
- Disputes, Payouts, Invoicing, Subscriptions, Webhooks, Pay Later
- Discord for questions (linked on the resources page)

## Winning tactics
1. Avoid the inspiration-page ideas (AI shopping agent, receipt bill-split, budget categorizer); everyone will build those.
2. The AI must **transact**, not only recommend. Use Agent Toolkit/MCP + a less common API (Disputes/Payouts/Invoicing/Webhooks).
3. Specific real audience. Talk to 2–3 real users and quote them.
4. The video is the main lever (Presentation + Best Demo + judges may not run the app). Show the transaction in the sandbox dashboard.
5. Stack a sponsor prize: AG Grid (data grid) + host on Render.
6. Make judging easy: hosted demo with sandbox logins and sample data; README sections mirroring the 5 criteria.
7. One polished main flow > many half-working features.

## Idea shortlist
| Idea | Notes |
|---|---|
| **Club treasurer assistant** ⭐ | AI matches PayPal payments to members (messy notes), chases people who haven't paid, refunds. TUM clubs / Vereine. Real users reachable. |
| **Website-client checkout setup** ⭐ | Owner describes business → AI sets up products/checkout/invoices via PayPal. Ties to websitesproject. |
| Dispute Copilot | AI assembles evidence + responds via Disputes API; AG Grid queue. **Verify sandbox supports test disputes.** |
| Agent Allowance Wallet | Spending rules / approvals between AI agents and checkout. Agentic Commerce prize. |
| Sell-to-Agents storefront | Shop catalog as MCP server + PayPal checkout; Channel3. |
| Freelancer tax helper | Categorize PayPal transactions → EÜR export, flag missing receipts. |
| Invoice chaser | Agent invoices + escalating reminders + Pay Later. |
| Milestone escrow | AI checks a deliverable against the agreed criteria → partial/full payout. Close to an inspiration idea. |

## Idea filter
1. Does a PayPal API touch it? 2. Is AI essential? 3. Demo-able start to finish in 3 min? 4. A real named user?

## Plan (once an idea is picked)
- **Wk 1:** register on Devpost, PayPal dev account + sandbox buyer/seller, Agent Toolkit hello world, prove the risky API, contact 2–3 users.
- **Wk 2:** main flow end to end, AG Grid, deploy on Render.
- **Wk 3:** polish, seed data, README, license, video → **submit by Nov 10**.

## Open questions
- Which idea? Solo or team?
- Time available alongside the TUM semester.
