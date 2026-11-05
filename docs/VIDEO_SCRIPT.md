# Demo video script (target 2:45, hard limit 2:50)

Follows the demo flow in `PLAN.md`. The automated recording (`video/`) shows the on-screen actions with the
captions below burned in; the voiceover can be recorded over it afterwards. No music, or only royalty-free
music you have the rights to.

Format per shot: **Time** | **On screen** | **Voiceover** | **Caption**.
Voiceover lines are written to fit the shot length at a calm pace (about 2.5 words per second).

---

### 0:00 - 0:15 | Problem

**On screen:** The PayPal activity view (or the app's Payments grid before matching) with the messy notes
visible: "für max & tom beitrag winter", "🧗 dues - Fabi", "Beitrag" from Lena twice, "for the bouldering trip saturday".
Slow zoom on two or three notes.

**Voiceover:** "This is a climbing club's PayPal account at the start of the semester. Sixty euros from someone
called Sabine, for 'max and tom'. Dues from 'Fabi'. Lena, twice. And fifteen euros from a stranger, for a trip."

**Caption:** `A club's PayPal inbox at the start of the semester`

### 0:15 - 0:30 | Who

**On screen:** Cut to a spreadsheet with a member list and ticks (a simple mock-up is fine, label it as
illustrative), then to the Kassenwart start screen: summary bar shows 14 members, 0 paid.

**Voiceover:** "Every sports club, student club and Verein has a volunteer treasurer who sorts this out by hand,
in a spreadsheet, every semester. Kassenwart does it for them."

**Caption:** `Volunteer treasurers reconcile this by hand. Kassenwart does it for them.`

### 0:30 - 0:55 | Run the agent

**On screen:** Click **Run treasurer agent**. Activity log shows "Synced 10 payments from PayPal". Members
grid fills: most rows turn Paid. Hover one matched payment to show its reasons:
"Note names 'max' and 'tom'", "Payer shares surname Becker", "60 = 2 x 30 dues".

**Voiceover:** "One click. The agent pulls the payments from PayPal and matches them to members, even when the
names don't line up. Sabine is Max and Tom's mother: sixty euros, two members, same surname. Confident matches
are applied, and each one says why."

**Caption:** `Payments synced from PayPal, matched to members, with reasons`

### 0:55 - 1:25 | Review queue

**On screen:** Scroll the review queue. Pause briefly on each card:
1. Split payment / match review card.
2. "Refund duplicate payment from Lena Hoffmann": 30 EUR, with the earlier payment date.
3. "Mark Evans paid 15 EUR for a trip, not dues": refund or ignore.
4. "Sophie Wagner paid 25 of 30 EUR": reminder for 5 EUR.
5. Reminder cards for members who haven't paid.

**Voiceover:** "What the AI isn't sure about, or what moves money, lands here. Lena paid twice: refund the second
one. Mark isn't a member and paid for a trip: refund or keep it. Sophie is five euros short. And the rest
haven't paid at all. Nothing happens until the treasurer approves."

**Caption:** `Anything that moves money waits for one click`

### 1:25 - 1:45 | Approve the refund

**On screen:** Click **Approve** on Lena's refund card. Card turns Done with "Refund ... COMPLETED".
Lena's payment row shows Refunded. Activity log line from PayPal.

**Voiceover:** "Approve, and Kassenwart issues the refund through PayPal's Payments API. The result comes
straight back from PayPal."

**Caption:** `Approved: refund issued via PayPal Payments v2`

### 1:45 - 2:05 | Approve the reminders

**On screen:** Open one reminder card, edit a word in the member message, then click **Approve all reminders**.
Cards turn Done; the Members grid's invoice column fills with invoice IDs and status SENT.

**Voiceover:** "Reminders become PayPal invoices: created, sent, with a pay button for the member. You can edit
the message first, or approve them all at once."

**Caption:** `Reminders sent as PayPal invoices (Invoicing v2)`

### 2:05 - 2:20 | PayPal sandbox dashboard [TODO: record by hand once sandbox keys exist]

**On screen:** Log in to the sandbox business account at sandbox.paypal.com. Show the refund in the activity
list and the sent invoices in Invoicing. Optionally show the invoice email in the sandbox personal account.

**Voiceover:** "And here it is on the PayPal side: the refund, and the invoices, in the club's sandbox account."

**Caption:** `Same actions, visible in the PayPal sandbox`

> If this shot can't be recorded, cut it and give the 15 seconds to the closing shot; remove the line
> above and don't claim sandbox results in the video.

### 2:20 - 2:35 | Member pays

**On screen:** Click the demo **Simulate invoice payment** for one member (in sandbox mode: pay the invoice from a
sandbox personal account and run a sync). Their row flips from Unpaid to Paid; summary bar updates.

**Voiceover:** "When a member pays the invoice, the next sync marks them paid. No spreadsheet."

**Caption:** `Invoice paid: the member flips to Paid`

### 2:35 - 2:48 | Close and call to action

**On screen:** Full Members grid with everyone's status, click **Export CSV**. End card: "Kassenwart",
hosted demo URL, GitHub URL, "Free local AI. PayPal sandbox. Open source (MIT)."

**Voiceover:** "Kassenwart. The free AI treasurer for clubs that get paid on PayPal. Try the demo, the link is below."

**Caption:** `Try it: kassenwart.onrender.com · Open source, MIT` [TODO: confirm URL]

---

## Timing check

| Segment | Start | End | Length |
|---|---|---|---|
| Problem | 0:00 | 0:15 | 15 s |
| Who | 0:15 | 0:30 | 15 s |
| Run the agent | 0:30 | 0:55 | 25 s |
| Review queue | 0:55 | 1:25 | 30 s |
| Approve refund | 1:25 | 1:45 | 20 s |
| Approve reminders | 1:45 | 2:05 | 20 s |
| Sandbox dashboard (TODO) | 2:05 | 2:20 | 15 s |
| Member pays | 2:20 | 2:35 | 15 s |
| Close | 2:35 | 2:48 | 13 s |
| **Total** | | | **2:48** |

## Recording notes

- Record at 1920x1080, browser zoom so the grid text is readable on a phone.
- Reset the demo first (`POST /api/demo/reset`) so the numbers match the voiceover (14 members, 10 payments).
- Numbers in the voiceover and captions ("ten payments", "14 members", "five euros short") must match what the app actually
  shows on the day. Check them against the final build and adjust the lines if the matcher's results change.
- If the hosted demo runs in mock mode, the video should say so once (the mode badge on screen is enough) and the
  sandbox shot should be the only place that claims real sandbox calls.
- Upload as public on YouTube, under 3 minutes, no copyrighted music.
