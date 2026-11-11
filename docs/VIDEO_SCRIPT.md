# Demo video script

`video/demo.mp4` is generated end to end from the running app, so it can be re-recorded whenever the
script or the interface changes.

1. `video/narration.json` holds the voiceover below, split into scenes and beats (a beat is one or two
   sentences, with the pause that follows it).
2. `video/narrate.py` speaks every beat with Kokoro-82M (open-source text-to-speech, run offline) and
   writes the start and end of each beat to `video/narration/timing.json`.
3. `video/record.mjs` drives the app in a browser with Playwright. Each highlight and click waits for the
   beat that talks about it, so the picture follows the words. It captures full-quality 1080p frames,
   burns in the subtitles, mixes the voice in and also writes `video/demo.srt` for YouTube's captions.

Regenerate:

```bash
KOKORO_DIR=<folder with kokoro-v1.0.onnx and voices-v1.0.bin> python video/narrate.py
NODE_PATH=$(npm root -g) node video/record.mjs
```

`VOICE=am_michael` (or any other Kokoro voice) and `SPEED=0.95` change the narrator. Names the model
misreads are respelled under `say` in `narration.json` ("Fabi" is spoken as "Fahbee").

What the video is built to show a judge: the problem and who has it in the first 25 seconds, then the whole
flow once, in order, with the PayPal endpoint behind each step named on screen.

| # | Scene | Voiceover | On screen | Length |
|---|---|---|---|---|
| 1 | hook | It's dues season at the Riverside Climbing Club. The money arrives on PayPal, and it arrives like this. Sixty dollars, for Max and Tom. Thirty, from someone called Fabi. Lena, who paid twice. And fifteen from a stranger, for a bouldering trip. Someone has to work out who actually paid. In most clubs, that someone is a volunteer with a spreadsheet. | Card styled as the club's incoming PayPal payments. Each row appears and lights up as it is named, then the question "So who actually paid?" | 23.2s |
| 2 | intro | Clubkeep is an AI treasurer that does that job for them. Here's the club. Fourteen members, four hundred and five dollars to collect, and nothing booked yet. | Brand card, then the app in its first-run state with the season card highlighted: 14 members, $405 to collect, $0 booked. | 9.6s |
| 3 | run | One click. Clubkeep pulls every incoming payment through PayPal's Transaction Search API. Then a small language model, running on the club's own server, reads each note and matches it to a member. No member data goes to an AI company. | Click **Check PayPal payments**. The run timeline plays; the Transaction Search step and then the AI matching step are spotlighted. API chip: `GET /v1/reporting/transactions`. | 15.8s |
| 4 | reasons | Six of the ten payments are booked straight away, and every one shows its reasoning. Fabi is Fabian Ward's nickname. Leoni, with a typo, is Leonie Fischer. | Payments grid. Open F. Ward ("Fabi") and Leoni Fischer: the agent's note with reasons and confidence is spotlighted. | 10.0s |
| 5 | ask | When it isn't sure, it doesn't guess. It asks. Sarah's sixty dollars is exactly two memberships, and the note names her kids. Confirm, and Max and Tom are both paid. | To approve: the Carter split card with its three reasons. Click **Mark Max and Tom as paid**. | 10.5s |
| 6 | refund | Lena's second payment is a duplicate. Approve it, and Clubkeep sends her money back through the PayPal Payments API. The refund receipt stays attached to the decision. Mark isn't a member. His fifteen dollars was for a trip, so that goes back too. | Lena's double payment: approve, confirm, the PayPal receipt chip. Then Mark's trip payment: approve, confirm. API chip: `POST /v2/payments/captures/{id}/refund`. | 15.4s |
| 7 | invoices | That leaves six people who still owe. Instead of an awkward message, each one gets a PayPal invoice with a pay button. Sophie was five dollars short, so hers is for five. Edit the note if you like, and send them all at once. | The batch card "Send dues invoices to 6 members", Sophie's $5 row, edit her note, **Send 6 invoices**. API chip: `POST /v2/invoicing/invoices · /send`. | 14.0s |
| 8 | paid | When Sophie pays her invoice, Clubkeep picks it up from PayPal and marks her as paid. | Members grid: Sophie's invoice is paid, her row turns to Paid. API chip: `GET /v2/invoicing/invoices → PAID`. | 5.3s |
| 9 | history | Every decision, and every PayPal call, is logged for the next treasurer. | The collected total, then the History tab with agent decisions and PayPal calls. | 4.7s |
| 10 | close | Clubkeep reads payments, refunds mistakes and sends invoices, all through PayPal. The AI explains itself, and nothing moves money without your click. It's open source, and free to run. An evening of spreadsheet work, done in two minutes. | End card: the three promises, the PayPal APIs used, the repository URL, and a note that it was recorded on the demo club with the mock PayPal client. | 15.2s |

Narration: 124 seconds. The finished video runs 2:08, under the 3 minute limit.

Still worth adding by hand once sandbox keys exist: a few seconds of the refund and the invoices in the
PayPal sandbox dashboard (sandbox.paypal.com), cut in after the invoices scene.
