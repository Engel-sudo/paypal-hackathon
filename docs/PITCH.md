# Clubkeep: pitch

*The AI treasurer for clubs. It reads the club's PayPal inbox, works out who paid for whom, and turns
the mess into refunds and invoices you approve with one click.*

---

## The problem

It's a few weeks into the new climbing season. The Riverside Climbing Club's PayPal account has filled up:

- $60 from **Sarah Carter**, note: *"for max & tom membership"*. Nobody called Sarah is a member.
  Max and Tom Carter are.
- $30 from **J. Kowalski**, note *"membership jonas k"*. The member list says *Jonas Kowalski*.
- $30 from **Andrea Smith**, note *"membership fee"*. No Andrea on the list, but there is a Paul Smith.
- $30 from **Lena Park**, *"fall dues Lena"*. A few days later, another $30 from Lena, note *"dues"*.
- $25 from **Sophie Ward**, *"climbing dues Sophie W."*. Dues are $30.
- $15 from **Mark Evans**, *"for the bouldering trip saturday"*. Mark isn't a member, and this isn't dues.
- *"🧗 dues - Fabi"* from **F. Ward**. The member list has Fabian Ward.
- $30 from **K. N.**, note *"dues"*. Only the email, kim.nguyen@example.com, gives it away.

Every one of these is obvious to a human who reads it carefully, and every one needs a decision.
Multiply by a member list of dozens and you get the treasurer's evening: PayPal in one tab, the
spreadsheet in the other, ticking names, guessing nicknames, writing awkward "hey, did you pay?"
messages, and leaving the duplicate in the account because refunding it means more clicking.

Then the treasurer hands over the job next year, and the next person starts from scratch.

## Who it's for

Volunteer treasurers of small groups that collect dues over PayPal: sports clubs, student clubs, choirs,
hobby and community groups, alumni associations, anywhere members pay by PayPal. They are not
accountants. They have a PayPal account, a member list and a spreadsheet, and they are doing this next
to a job or their studies.

The personas below are **illustrative composites** written to make the use case concrete. They are not
real people and not interview results.

**Persona A (illustrative): the student-club treasurer.**
A graduate student who took over the treasurer role of a university club with around 60 members.
Dues are collected at the start of each term through a club PayPal account. Members pay from their
phones, often in a hurry, sometimes for a friend. The previous treasurer left a spreadsheet and no
notes. The goal: know who has paid before the first trip, without spending a weekend on it.

**Persona B (illustrative): the parent volunteer at a youth sports club.**
Handles dues for a youth section where parents pay for their children, so the payer's name almost never
matches the member's. Some families have two or three kids in the club. Payment notes are first names,
nicknames, or nothing useful at all.

## Why now

- **PayPal is already where the money is** for many small clubs, because members can pay from their phone
  in seconds. The data is there; it's just unstructured.
- **Small models run on a cheap CPU.** A sentence-embedding model that understands "membership fee",
  "fall dues" and "dues" as the same thing is about 23 MB and runs inside a Node process with
  transformers.js, on a free hosting tier. Not long ago this would have meant paying for a hosted AI API,
  which a club with $30 dues won't do.
- **PayPal's APIs cover the whole loop**: read transactions, refund captures, create and send invoices,
  send reminders, receive webhooks. An assistant can act, not just advise.
- **Privacy expectations are rising** for organizations that hold member data. Running the AI locally and
  storing data in a file on the club's own server is a design choice, not a compromise.

## The "aha" moment

The treasurer clicks **Run treasurer agent**. Ten payments sync from PayPal. Six are matched on their own,
and each one says why: the nickname "Fabi" is Fabian Ward, "Leoni" is a typo for Leonie Fischer, the email
belongs to Kim Nguyen.

What's left is a short queue, each item a decision with the work already done:

- *Split Sarah Carter's $60 between Max and Tom Carter.* The reasons: "Note names 'max' and 'tom'",
  "Payer shares surname Carter", "$60 = $30 + $30 (their dues together)". **Approve.**
- *Andrea Smith's "membership fee" is probably for Paul Smith.* Lower confidence, so it asks. **Approve** or reassign.
- *Refund the duplicate payment from Lena Park ($30).* **Approve**, and a PayPal refund goes out.
- *Mark Evans paid $15 for a trip, not dues.* Refund it, or keep it and ignore it.
- *Sophie Ward paid $25 of $30.* An invoice for the missing $5 is ready.
- *Everyone who hasn't paid at all.* Six reminders in total, Sophie's included. **Approve all**, and a PayPal
  invoice goes to each of them.

A minute later a member pays the invoice and their row flips to *Paid*. That's the moment: the evening of
spreadsheet work became a few clicks, and none of it happened without the treasurer saying yes.

## Why it wins, criterion by criterion

**Technological Implementation.** Real PayPal depth: Transaction Search in, Payments v2 refunds out,
Invoicing v2 create, send and remind, webhook verification. Real AI that changes outcomes: local sentence
embeddings plus a scoring engine that splits one payment across several members, detects duplicates,
overpayments and non-dues payments, and assigns a confidence to each decision. A mock client behind the
same interface means it runs anywhere, and there are automated tests.

**Design.** A complete product, not a demo of an API. One screen answers the treasurer's question
(who still owes what), the AI always explains itself, money only moves on approval, every match can be
corrected by hand, and the member list exports to CSV for the annual audit.

**Potential Impact.** A specific, reachable audience with a recurring pain: every club, every season, every
treasurer handover, in every country where members pay by PayPal. The AI is free to run, so the cost
argument that usually kills tools for volunteer organizations doesn't apply.

**Innovation.** Reconciliation tools generally expect a reference number. Clubkeep starts from what clubs
actually receive: free text, nicknames, initials, typos, parents paying for children, one payment for two
people. And it doesn't stop at a match list; it proposes and executes the PayPal action that resolves each
leftover.

**Presentation.** The narrated demo follows one treasurer through one season's dues, from messy inbox to
everyone paid.

## Competitive landscape

We describe categories here rather than specific products, because we haven't done a feature-by-feature
review of named tools.

| Category | What it does well | Where it leaves the treasurer |
|---|---|---|
| **Spreadsheets** (what most small clubs use) | Free, flexible, everyone knows them | Fully manual: reading notes, matching names, writing reminders, issuing refunds |
| **Club and membership management software** | Member records, fee schedules, often recurring billing and accounting exports | Tends to assume structured payments (its own checkout, direct debit, references). Usually a paid subscription and a bigger setup than a small club wants |
| **Bank reconciliation in accounting tools** | Rule-based matching of bank lines to invoices | Built for bookkeepers and invoice numbers, not for "for max & tom membership". Rules don't cover nicknames, splits or parents paying |
| **PayPal's own dashboard** | Shows every payment, lets you refund and invoice | No idea who your members are. Every match and every action is manual |

Clubkeep's position: it sits on top of the PayPal account the club already has, understands the
free-text reality, and does the PayPal actions for you, with your approval.

## Business model and path after the hackathon

This is a hackathon entry first. Realistic paths, roughly in order:

1. **Open source, self-hosted, free.** MIT licensed. A club with a technical member runs it on a free
   or cheap host. This is the honest starting point and it's how we find out if the matching holds up
   on real data.
2. **Hosted version for clubs without a technical member.** A small flat fee per club per year to cover
   hosting and support. Data stays per club; the AI stays local to the server, so there's no per-request
   AI cost to pass on.
3. **Integrations that make it the treasurer's main tool:** bank-transfer import alongside PayPal,
   PayPal Subscriptions for recurring dues, Payouts for reimbursing members' expenses, a handover report
   for the next treasurer and the annual audit.
4. **Partnerships** with umbrella organizations (sports federations, student unions, alumni networks) that
   could recommend it to their member clubs. We have not talked to any of them yet.

## Risks and answers

| Risk | Answer |
|---|---|
| **The AI matches a payment to the wrong person.** | Anything below the confidence threshold goes to review (in the demo, Andrea Smith's payment for Paul Smith). Every auto-match shows its reasons and can be reassigned or ignored by hand. Money never moves without a click. |
| **Refunding the wrong payment.** | Refunds are always proposals, never automatic. The proposal shows payer, amount, date and why it looks like a duplicate. |
| **Member data and privacy law.** | No hosted AI API; the model runs on the club's server. Data lives in a JSON file the club controls. Nothing is sent anywhere except the PayPal calls the treasurer approves. (This is a design property, not a legal assessment; a club still needs its own data-protection basics.) |
| **Transaction Search is not real-time.** | Syncs are cheap and can run on a schedule or on a webhook. Dues collection is a days-to-weeks process, so a delay of hours is acceptable. |
| **Clubs also get bank transfers, not only PayPal.** | True, and it's the first roadmap item. The matcher is source-agnostic; it only needs payer, amount and note. |
| **Small model, edge cases, notes in other languages.** | The scoring engine doesn't rely on the model alone: exact emails, fuzzy names, initials, surnames and amount arithmetic carry a lot of the weight, and the hashed n-gram fallback keeps it working offline. The default model is English; a multilingual model can be configured, at a higher memory cost. |
| **Treasurer turnover means nobody maintains it.** | The tool's whole point is to make handover easier: everything is in one place, with a log of who decided what. |
| **"Is this just a hackathon toy?"** | It's a working app with tests, a deploy config and a sandbox-backed PayPal client. Whether clubs want it is exactly what we'd test next. |
