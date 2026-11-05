# Demo video script

The narrated video (`video/demo.mp4`) is generated end to end:

1. `video/narration.json` holds the voiceover lines below.
2. `video/narrate.py` turns them into speech with Kokoro-82M (open-source TTS, voice `af_heart`).
3. `video/record.mjs` drives the app in a browser with Playwright. Each scene lasts at least as long as its line, the captions are burned in, and the voice is mixed in at the logged scene start times.

Regenerate: `KOKORO_DIR=<model dir> python video/narrate.py`, then `NODE_PATH=$(npm root -g) node video/record.mjs`.

Optional extra shot to add by hand once sandbox keys exist: the refund and invoices in the PayPal sandbox dashboard (sandbox.paypal.com).

| # | Scene | Voiceover | On screen | Caption | Voice length |
|---|---|---|---|---|---|
| 1 | cold | Every club has a treasurer. Usually a volunteer, doing the books at the kitchen table. | Title card: Clubkeep, the AI treasurer for clubs. | Clubkeep · the AI treasurer for clubs | 4.99s |
| 2 | problem | This is a climbing club's PayPal account at the start of the season. Sixty dollars from Sarah, for Max and Tom. Dues from someone called Fabi. Lena, twice. And fifteen dollars from a stranger, for a trip. So, who paid for what? | Card styled as a PayPal inbox: Sarah Carter $60 "for max & tom membership", F. Ward "🧗 dues - Fabi", Lena Park $30 twice, Mark Evans $15 "for the bouldering trip saturday". | A club's PayPal inbox at the start of the season | 14.91s |
| 3 | intro | Clubkeep is an AI treasurer for clubs that collect dues on PayPal. It works out who paid, chases who didn't, and returns what shouldn't be there. And nothing moves without your okay. | Card with the three promises: finds who paid, chases who didn't, returns what shouldn't be there. Nothing moves without your OK. | Finds who paid · chases who didn't · refunds the rest | 11.07s |
| 4 | start | Here's the club. Fourteen members, four hundred and five dollars in dues, and nothing booked yet. | The app, first-run state: 14 members, $405 expected, nothing booked. | Riverside Climbing Club: 14 members, $405 in dues | 5.38s |
| 5 | run | One click. Clubkeep pulls the payments from PayPal, and an AI model that runs on the club's own server matches each one to a member. | Click "Check PayPal payments". The run timeline plays: invoices, Transaction Search, AI matching, plan. | PayPal Transaction Search → on-server AI → matched | 8.04s |
| 6 | reasons | Six are matched straight away. Fabi is Fabian Ward. Leoni, with a typo, is Leonie Fischer. And every match shows its reasons, so you can check it. | Payments grid. Open F. Ward ("Fabi") and Leoni Fischer: the panel shows the reasons and confidence. | Nicknames, typos, initials: each match shows why | 9.05s |
| 7 | inbox | Everything else comes to you. Sarah's sixty dollars covers her two kids, Max and Tom. Lena paid twice. Mark isn't a member, he paid for a trip. And Sophie is five dollars short. | To approve: the Carter split card, Lena's double payment, Mark's trip payment, Sophie's $5 in the invoice batch. | Anything unsure, or that moves money, waits for you | 11.33s |
| 8 | approve | Confirm the split. Approve the refund, and Clubkeep sends Lena's money back through the PayPal Payments API. | Confirm the split. Approve Lena's refund, confirm, the PayPal receipt chip appears. | Refund sent via PayPal Payments v2 | 6.76s |
| 9 | remind | Everyone who still owes gets a PayPal invoice, with a friendly note you can edit. Send them all in one go. | The batch card: "Send 6 invoices". Invoices created and sent. | Reminders sent as PayPal invoices (Invoicing v2) | 6.38s |
| 10 | paid | When a member pays their invoice, the next sync marks them as paid. | Members grid: a member pays the invoice, the row flashes to Paid. | Invoice paid → member marked Paid | 3.43s |
| 11 | history | Every decision, and every PayPal call, is on the record. | History tab: agent decisions and PayPal calls. | Every decision and PayPal call is logged | 3.41s |
| 12 | close | Clubkeep. Open source, free to run, and built on PayPal. A semester of spreadsheet work, done in two minutes. | End card: Clubkeep, open source (MIT), PayPal + on-server AI + AG Grid, demo URL. | Clubkeep · open source · built on PayPal | 6.63s |

Voice total: 91.4 s. With pauses and actions the video runs about 2:10–2:30, under the 3 minute limit.
