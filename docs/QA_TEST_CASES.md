# Onthec Gym — QA test cases (phone)

Manual end-to-end tests for the live app: **https://gym-app.snitin322.workers.dev**

Covers everything built up to Phase 8 (members, payments, invoices, PT booking, workout plans and tracking, dashboard, leads).

Work through the cases in order. Later sections use data created earlier. Tick each one ✅ or ❌, and report every ❌ using the template at the end.

---

## 0. Before you start

### Accounts you need (5 phones or numbers)

| Role | Name to use | How to create |
|---|---|---|
| **Owner** | You | Already exists |
| **Admin** | "QA Desk" | Created in test ST-01 |
| **Trainer** | "QA Trainer" | Created in test ST-02 |
| **Member A** | "QA Asha" | Created in test MB-01 (gets a plan, PT, workouts) |
| **Member B** | "QA Bina" | Created in test MB-02 (pay later, no PT) |

A different browser, or a private/incognito tab, counts as a separate "phone". You can be logged in as a different person in each.

### Login codes
Codes are not sent on WhatsApp yet. Use **one** of these:
- **Easiest:** in Render → onthec-api → Environment, set `OTP_TEST_PHONES` to the five numbers (comma-separated) and `OTP_TEST_CODE` to any 6 digits. Everyone logs in with that code. **Remove both settings after testing.**
- **Or:** after tapping *Send code*, open Render → onthec-api → **Logs** and search `login code`.

### Good to know
- This is the **live** database. Use names starting with **"QA"** so they're easy to spot later.
- **Recording a payment uses up an invoice number for good.** That's fine for testing, but real invoices will start after these. We plan to move to a fresh production database before launch anyway.
- Online payment uses **Razorpay test mode**: no real money. Test card **4100 2800 0000 1007**, any future expiry, any CVV, OTP from the test page.
- The server sleeps after 15 minutes. The first tap after a break can take 30–60 seconds. That's expected, not a bug.
- Cases marked ⏱ need you to wait (hours or a day) or to do them at a certain time.

### What to check on every screen (no separate test case)
- Nothing is cut off and the page doesn't scroll sideways.
- Buttons are big enough to tap.
- Text is readable in the dark theme.
- Error messages are in plain words, not codes.

---

## 1. Install and login

**IN-01 — Install on Android (Chrome)** · any role
1. Open the app link in Chrome.
2. Tap **Install app** (or the browser menu → *Install app* / *Add to Home screen*).

**Expected:** An Onthec Gym icon appears on the home screen and opens full screen, without the browser address bar.
- [ ] Pass / [ ] Fail

**IN-02 — Install on iPhone (Safari)** · any role
1. Open the link in **Safari**.
2. Follow the **Add to your Home Screen** steps shown in the app (Share → Add to Home Screen).

**Expected:** The icon appears and the app opens full screen.
- [ ] Pass / [ ] Fail

**LG-01 — Unknown number can't log in**
1. Log in with a number that isn't in the gym.

**Expected:** "This number is not registered with the gym. Please contact the front desk." No code is sent.
- [ ] Pass / [ ] Fail

**LG-02 — Wrong code**
1. Owner number → *Send code* → enter a wrong 6-digit code.

**Expected:** A wrong-code message. After 5 wrong tries: "Too many wrong attempts. Please request a new code." A new code then works.
- [ ] Pass / [ ] Fail

**LG-03 — Owner logs in**
1. Owner number → correct code.

**Expected:** Home screen shows "Hi ‹name›", OWNER, the dashboard, and tiles: Members, Plans, PT packages, PT disputes, Workouts, Leads, Staff, Gym details.
- [ ] Pass / [ ] Fail

**LG-04 — Stay logged in**
1. Close the app completely.
2. Open it again from the home-screen icon.

**Expected:** Still logged in. No code needed.
- [ ] Pass / [ ] Fail

**LG-05 — Log out**
1. Home → **Log out**.

**Expected:** Back to the start screen. Opening the app again asks for login.
- [ ] Pass / [ ] Fail

**LG-06 — First login asks for consent** · do this with Member A after MB-01

**Expected:** The "Before you start" screen appears. *Agree and continue* stays disabled until you tick the box, then opens the member home. On the next login it isn't asked again.
- [ ] Pass / [ ] Fail

---

## 2. Gym setup (owner)

**GY-01 — Gym details**
1. Home → **Gym details**.
2. Fill in legal name, address, city, PIN, contact number and email. Leave GSTIN **empty**. Save.

**Expected:** Saved message. Opening it again shows the same values.
- [ ] Pass / [ ] Fail

**GY-02 — GSTIN check**
1. Enter a GSTIN with one wrong character → Save.

**Expected:** Refused with a clear message before saving. Then clear the field again (we test receipts without GST first).
- [ ] Pass / [ ] Fail

**PL-01 — Add plans**
1. **Plans** → **Add plan**: "QA 1 month", length 1 month, ₹1,500.
2. Add "QA 3 months", 3 months, ₹4,000.

**Expected:**
- "Max freeze days" fills in automatically (0 for 1 month, 15 for 3 months).
- Both plans are listed with prices "incl. GST".
- [ ] Pass / [ ] Fail

**PL-02 — Bad price**
1. Add plan with price "abc".

**Expected:** Clear error. Nothing is saved.
- [ ] Pass / [ ] Fail

**PL-03 — Deactivate a plan**
1. Deactivate "QA 1 month".
2. Open **Members → Add member** → plan list.

**Expected:** "QA 1 month" isn't offered. Activate it again afterwards.
- [ ] Pass / [ ] Fail

---

## 3. Staff (owner, then admin)

**ST-01 — Add an admin** · owner
1. **Staff → Add staff** → "QA Desk", phone, role **Admin**.

**Expected:** Listed under staff as Admin. That person can log in and sees the admin home (dashboard and tiles).
- [ ] Pass / [ ] Fail

**ST-02 — Add a trainer** · owner
1. **Add staff** → "QA Trainer", role **Trainer**.

**Expected:** Listed as Trainer, with an **Hours →** link.
- [ ] Pass / [ ] Fail

**ST-03 — Admin can only add trainers** · admin
1. As QA Desk: **Staff → Add staff** → role list.

**Expected:** Only "Trainer" can be chosen.
- [ ] Pass / [ ] Fail

**ST-04 — Duplicate number**
1. Add staff with QA Trainer's number again.

**Expected:** Refused: number already in use.
- [ ] Pass / [ ] Fail

---

## 4. Members (admin)

**MB-01 — Add member with plan, paid** · admin
1. **Members → Add member** → "QA Asha", phone, plan **QA 1 month**, start today, payment **UPI**, reference "TEST123" → Add member.

**Expected:**
- The member page opens: Active, days left, end date one month later.
- Payments shows ₹1,500 UPI with an **Invoice …** link.
- [ ] Pass / [ ] Fail

**MB-02 — Add member, pay later** · admin
1. Add "QA Bina", plan **QA 3 months**, payment **Pay later**.

**Expected:**
- The member page shows **₹4,000 due** with a *Record payment* button.
- The warning "amount will show as due" appeared before saving.
- [ ] Pass / [ ] Fail

**MB-03 — Discount needs a reason**
1. Add a member, change the price to ₹3,500 on the ₹4,000 plan, and don't give a reason → Add member.

**Expected:** "Give a reason for the discount". With a reason it saves, and the card shows "₹500 off · reason".
- [ ] Pass / [ ] Fail

**MB-04 — Same phone twice**
1. Add a member with QA Asha's number.

**Expected:** Refused: number already used.
- [ ] Pass / [ ] Fail

**MB-05 — Search and filters**
1. **Members** → search "QA".
2. Tap the filters **Active**, **Expiring**, **Expired**, **No plan**, **Dues**.

**Expected:** Search finds QA members by name and by part of the phone number. **Dues** shows QA Bina. Each filter shows only matching members.
- [ ] Pass / [ ] Fail

**MB-06 — Edit details**
1. QA Asha → **Edit details** → add emergency contact and notes → Save.

**Expected:** Shown on the member page.
- [ ] Pass / [ ] Fail

**MB-07 — Part payment** · admin
1. QA Bina → **Record payment** → ₹1,000, Cash.
2. Then record another ₹4,000.

**Expected:**
- After ₹1,000: "₹3,000 due · ₹1,000 paid", with an invoice for ₹1,000.
- ₹4,000 is refused ("Only ₹3,000 is due").
- Recording ₹3,000 clears the due.
- [ ] Pass / [ ] Fail

**MB-08 — Renew (queue next membership)**
1. QA Asha → **Renew** → QA 3 months.

**Expected:** "Starts on" defaults to the day after the current membership ends. The new membership shows as upcoming under "All memberships".
- [ ] Pass / [ ] Fail

**MB-09 — Freeze and unfreeze**
1. Use a member on **QA 3 months** (freeze allowed) → **Freeze** 5 days from today → Freeze.
2. Then **Unfreeze**.

**Expected:**
- Status becomes Frozen, and the end date moves 5 days later.
- Freezing more days than allowed is refused.
- Unfreeze ends the freeze, and the end date adjusts.
- [ ] Pass / [ ] Fail

**MB-10 — Cancel membership**
1. On a spare QA member: **Cancel membership** → reason → **Yes, cancel it**.

**Expected:** Status Cancelled. The cancelled membership shows nothing due.
- [ ] Pass / [ ] Fail

---

## 5. Invoices

**IV-01 — Download invoice (receipt)** · admin
1. QA Asha → Payments → tap **Invoice …**.

**Expected:**
- A PDF opens or downloads, titled as a receipt with "Receipt no.".
- It shows the gym details from GY-01, member name, plan, ₹1,500, UPI, TEST123.
- There are no GST lines (no GSTIN set).
- [ ] Pass / [ ] Fail

**IV-02 — Tax invoice with GSTIN** · owner
1. Gym details → enter a **valid** GSTIN (ask your CA, or use a test one that passes the check) → Save.
2. Record a new payment for any QA member and open its invoice.

**Expected:**
- "Tax invoice", taxable value + CGST 9% + SGST 9%, adding up exactly to the amount.
- SAC code and GSTIN printed.
- Clear the GSTIN again afterwards if you're not GST-registered yet.
- [ ] Pass / [ ] Fail

**IV-03 — Invoice numbers have no gaps**
1. Look at the invoice numbers created so far.

**Expected:** Consecutive (…/0003, …/0004, …), with no repeats.
- [ ] Pass / [ ] Fail

**IV-04 — Member downloads their own invoice** · Member A
1. Member home → **Payments** → invoice link.

**Expected:** The same PDF opens.
- [ ] Pass / [ ] Fail

---

## 6. Member home (Member A)

**MH-01 — Membership card**
1. Log in as QA Asha.

**Expected:**
- Card shows plan name, Active, a big "N days left", date range and progress bar.
- The upcoming renewal from MB-08 shows as "Next: …".
- [ ] Pass / [ ] Fail

**MH-02 — Due shown to member** · Member B
1. Log in as QA Bina (before MB-07 is fully paid, or on another pay-later member).

**Expected:** Amount due is shown.
- [ ] Pass / [ ] Fail

**MH-03 — Member can't open admin screens**
1. As a member, type `/admin/members` at the end of the app address.

**Expected:** Back on the member home. No admin data visible.
- [ ] Pass / [ ] Fail

---

## 7. Online renewal (Razorpay test mode) — Member A

**ON-01 — Renew online**
1. Member home → **Renew online** → pick QA 1 month.
2. Pay with the test card 4100 2800 0000 1007 → success on the test page.

**Expected:**
- "Payment successful" (or "Payment received, it will update shortly").
- Within about a minute the new membership appears and the payment is listed with an invoice.
- The desk sees it on the member page as Razorpay.
- [ ] Pass / [ ] Fail

**ON-02 — Payment cancelled**
1. Start **Renew online** and close the payment window.

**Expected:** Nothing is charged. A clear message, and no new membership.
- [ ] Pass / [ ] Fail

---

## 8. PT packages and selling (owner or admin)

**PT-01 — Create package**
1. **PT packages → Add package** → "QA 4 Sessions", 4 sessions, 30 days, ₹2,000.

**Expected:** Listed as 4 sessions · valid 30 days · ₹2,000.
- [ ] Pass / [ ] Fail

**PT-02 — Sell PT with trainer**
1. QA Asha → **Sell PT package** → QA 4 Sessions, trainer **QA Trainer**, Cash → Sell package.

**Expected:**
- The PT card shows "4 of 4 sessions left", "with QA Trainer" and the use-by date (30 days including today).
- Paid, with an invoice.
- Only trainers are offered in the trainer list.
- [ ] Pass / [ ] Fail

**PT-03 — Sell PT pay later + discount** · use another QA member
1. Price ₹1,500 with no reason, then with reason "Trial offer", **Pay later**.

**Expected:** No reason → refused. With a reason → "₹500 off · Trial offer", ₹1,500 due, and the member appears in the Dues filter.
- [ ] Pass / [ ] Fail

**PT-04 — Adjust sessions**
1. On QA Asha's PT card → **Adjust sessions** → Remove 10, reason "test".
2. Then Remove 1 with reason "Before the app".

**Expected:**
- Removing 10 is refused ("Only 4 sessions left").
- Removing 1 leaves "3 of 4 sessions left", and **Session history** shows +4 and −1 with names.
- Add the session back afterwards (Add 1, reason "undo test").
- [ ] Pass / [ ] Fail

**PT-05 — Extend validity**
1. **Extend** → pick a date earlier than the current use-by date, then a later one.

**Expected:** Earlier is refused. Later updates the use-by date.
- [ ] Pass / [ ] Fail

**PT-06 — Member sees PT** · Member A

**Expected:** Home shows the PT card with sessions left, trainer and use-by date.
- [ ] Pass / [ ] Fail

**PT-07 — Trainer sees client** · Trainer

**Expected:** Trainer home → **My clients** shows QA Asha, phone, sessions left.
- [ ] Pass / [ ] Fail

---

## 9. Trainer hours and booking

**BK-01 — Set weekly hours** · Trainer
1. Home → **My availability** → **Add hours on** today's weekday, from about 3 hours from now to 6 hours from now.
2. Add tomorrow too. Session length 60 → **Save hours**.

**Expected:** "Saved" message. Overlapping ranges on the same day are refused before saving.
- [ ] Pass / [ ] Fail

**BK-02 — Book a session** · Member A
1. PT card → **Book a session** → pick tomorrow → pick a time → **Book session**.

**Expected:**
- **Upcoming sessions** shows it, with "Free to cancel until …" (12 hours before).
- The PT card says "… sessions left · 1 booked".
- [ ] Pass / [ ] Fail

**BK-03 — Times you can't book** · Member A

**Expected:**
- Times less than 2 hours from now aren't offered.
- Days more than 14 days ahead aren't offered.
- The slot booked in BK-02 no longer appears.
- [ ] Pass / [ ] Fail

**BK-04 — Trainer's schedule** · Trainer

**Expected:** **My schedule** shows the booking with QA Asha's name and phone.
- [ ] Pass / [ ] Fail

**BK-05 — Reschedule** · Member A
1. Tomorrow's session → **Reschedule** → another time.

**Expected:** Moved. The old time is free again.
- [ ] Pass / [ ] Fail

**BK-06 — Free cancel** · Member A
1. Cancel tomorrow's session (more than 12 hours away).

**Expected:** Message says it's free. Sessions left is unchanged.
- [ ] Pass / [ ] Fail

**BK-07 — Late cancel ⏱** · Member A
1. Book a session for **today** (within 12 hours).

**Expected:**
- No Reschedule button.
- Cancel shows a red warning that it uses up the session.
- After cancelling, sessions left drops by 1.
- [ ] Pass / [ ] Fail

**BK-08 — Trainer cancels (free)** · Trainer
1. Member books again, then the trainer cancels it from **My schedule** with a reason.

**Expected:** The member's sessions left is unchanged.
- [ ] Pass / [ ] Fail

**BK-09 — Time off cancels bookings** · Trainer
1. Member books tomorrow.
2. Trainer → My availability → **Add time off** → **Whole days** tomorrow, reason "QA leave".

**Expected:** The app lists the cancelled session. The member's session disappears and nothing is used up. Tomorrow has no bookable times. Remove the time off afterwards.
- [ ] Pass / [ ] Fail

**BK-10 — Desk books for a member** · admin
1. QA Asha's page → PT → **Book session**.

**Expected:** Booked. It shows in the member's Upcoming and in the trainer's schedule.
- [ ] Pass / [ ] Fail

**BK-11 — Owner PT rules** · owner
1. Gym details → **PT booking rules** → change free-cancel to 6 hours → save.
2. Change it back to 12.

**Expected:** The member's "Free to cancel until" reflects the new rule.
- [ ] Pass / [ ] Fail

---

## 10. Completing sessions and disputes ⏱
Book a session that starts within the next 2–3 hours (set the trainer's hours accordingly), then wait until it starts.

**CS-01 — Trainer marks Completed** · Trainer
1. My schedule → the session → **Mark session** → **Completed** → note "Leg day" → Save.

**Expected:** Shows "Completed · marked by QA Trainer" and "Waiting for the member". Sessions left drops by 1.
- [ ] Pass / [ ] Fail

**CS-02 — Undo within an hour** · Trainer
1. **Undo mark** → then mark it again as **No-show**.

**Expected:** Undo gives the session back. Marking again uses it again. After an hour, the trainer has no Undo button.
- [ ] Pass / [ ] Fail

**CS-03 — Member confirms** · Member A
1. Home → **Please confirm** → **Confirm**.

**Expected:** Status "Confirmed". The trainer's Undo is gone.
- [ ] Pass / [ ] Fail

**CS-04 — Member disputes** · Member A
1. On another marked session → **Not right?** → send empty, then with "I was there".

**Expected:** Empty is refused. Then the status says "Disputed".
- [ ] Pass / [ ] Fail

**CS-05 — Desk resolves** · owner or admin
1. Home shows **PT disputes** with a count → open it → **Resolve dispute** → **Give session back** + note → Save decision.

**Expected:** The member's sessions left goes up by 1, and they see "Session given back" with the note. "Keep as used" on another dispute changes nothing.
- [ ] Pass / [ ] Fail

**CS-06 — Not marked yet**
1. Let a booked session end without marking it.

**Expected:** It appears under **Not marked yet** on the trainer home and on the PT disputes screen. The dashboard shows "1 session not marked".
- [ ] Pass / [ ] Fail

**CS-07 — Auto-confirm after 24 h ⏱** · Member A (next day)
1. Leave a marked session unanswered for 24 hours.

**Expected:** It shows "Confirmed (no reply in 24 h)". *Not right?* is gone.
- [ ] Pass / [ ] Fail

---

## 11. Workout plans

**WP-01 — Exercise library** · owner or admin
1. **Workouts → Exercise library**. If empty, tap **Add common exercises**.

**Expected:** About 50 exercises, grouped by muscle group, each with a short how-to. Search works.
- [ ] Pass / [ ] Fail

**WP-02 — Add your own exercise**
1. **Add exercise** → "QA Battle Ropes", Cardio, Full body, video link "youtube" (wrong), then fix it to `https://youtu.be/…`.

**Expected:** A wrong link is refused. The right one saves, and a **Video** link shows on the exercise.
- [ ] Pass / [ ] Fail

**WP-03 — Build a template**
1. **Workouts → New template** → name "QA Beginner split".
2. **Mon:** title "Chest + Triceps" → add Barbell Bench Press. Set weights to 20, 22.5 and 25 kg. **Copy last set** once. Rest 90 s.
3. **Tue:** add Treadmill, 20 minutes.
4. **Sun:** tick **Rest day**.
5. Try weight "22.3" on one set → Create template. Fix it → Create template.

**Expected:**
- 22.3 is refused with "Monday, Barbell Bench Press: Weight must be in steps of 0.25 kg".
- After fixing, the template saves and shows version 1.
- [ ] Pass / [ ] Fail

**WP-04 — New version keeps history**
1. Open the template → change a weight → **Save new version**.

**Expected:** Version 2. **Earlier versions** shows version 1 with its old weights.
- [ ] Pass / [ ] Fail

**WP-05 — Give a member a plan** · admin
1. QA Asha → **Workout plan** → Start from **QA Beginner split** → **Give plan**.

**Expected:** The plan shows, and **Show week** displays all 7 days.
- [ ] Pass / [ ] Fail

**WP-06 — Member's copy is separate**
1. Change the template's Monday weight.
2. Then reopen QA Asha's plan.

**Expected:** Asha's plan still has the old weight. Her own edits don't change the template either.
- [ ] Pass / [ ] Fail

**WP-07 — Trainer edits client plan** · Trainer
1. **My clients** → QA Asha → **Workout plan →** → **Edit plan** → heavier weight → Save new version.

**Expected:** Saved with "by QA Trainer". The trainer can't open the plan of a member who has no PT with them.
- [ ] Pass / [ ] Fail

**WP-08 — Today's workout** · Member A

**Expected:**
- Home shows **Today's workout** for today's weekday, with sets, weights, rest times and notes.
- **See the whole week** shows all 7 days, and Sunday is a rest day.
- [ ] Pass / [ ] Fail

**WP-09 — No plan** · Member B

**Expected:** "Ask the front desk or your trainer for a plan."
- [ ] Pass / [ ] Fail

---

## 12. Workout tracking (My week) — Member A

**TR-01 — The week**

**Expected:** **My week** shows Mon–Sun. Today is selected, past days show "To do" (•) or "Missed" (✕), Sunday shows Rest (–), and future days show nothing.
- [ ] Pass / [ ] Fail

**TR-02 — Mark done**
1. Today → check the exercises are pre-filled from the plan → **Mark done**.

**Expected:** Today shows ✓ Done, with "Saved by QA Asha".
- [ ] Pass / [ ] Fail

**TR-03 — Update what I did**
1. A past day within the last 7 days → **Update what I did**.
2. Change a weight, **Add a set**, tick **Skipped** on cardio, add note "Felt strong" → Save.

**Expected:** The day shows your changes, "Skipped" and the note.
- [ ] Pass / [ ] Fail

**TR-04 — Last time**
1. On a later day with the same exercise:

**Expected:** "Last time (‹day›): …" shows what you saved before.
- [ ] Pass / [ ] Fail

**TR-05 — Locked days**

**Expected:**
- Future days say "You can tick this day on the day."
- Days older than a week say they're locked, with no buttons.
- Rest days can't be ticked.
- [ ] Pass / [ ] Fail

**TR-06 — Previous weeks**
1. Tap **‹** to go back a week, then **Back to this week**.

**Expected:** Last week's days and ticks show correctly. **›** can't go past this week.
- [ ] Pass / [ ] Fail

**TR-07 — Plan changes don't change history**
1. The trainer changes the plan's weights.
2. Member A looks at a day already ticked.

**Expected:** The ticked day still shows the old weights. Days not ticked show the new ones.
- [ ] Pass / [ ] Fail

**TR-08 — Trainer and desk can look, not tick**
1. Trainer (client plan page) and admin (member page) → **Workout tracking**.

**Expected:** Same week and ticks, with no *Mark done* or *Update* buttons.
- [ ] Pass / [ ] Fail

---

## 13. Dashboard

**DB-01 — Owner dashboard** · owner

**Expected:**
- Active members, Ending in 7 days, Expired (30 days) and No plan, each tappable and opening the matching member list.
- **Money taken:** today and this month match the payments you made today, with the split by method.
- [ ] Pass / [ ] Fail

**DB-02 — Who to call** · owner or admin
1. Make sure a QA member's membership ends within 7 days (e.g. start QA 1 month about 25 days ago).
2. Tap 📞, then 💬.

**Expected:** 📞 opens the dialer with their number. 💬 opens WhatsApp with a ready message naming the gym and the end date. Do **not** press send unless it's your own number.
- [ ] Pass / [ ] Fail

**DB-03 — Admin can't see money** · admin

**Expected:** No "Money taken" card. Dues, PT, Workouts and Leads are visible.
- [ ] Pass / [ ] Fail

**DB-04 — PT and workouts numbers**

**Expected:**
- PT this week shows the sessions you booked, completed and no-showed.
- "Workouts" shows how many members with a plan ticked a day this week.
- Disputes and unmarked counts link to PT disputes.
- [ ] Pass / [ ] Fail

**DB-05 — Trainer and member have no dashboard**

**Expected:** The trainer home shows schedule and clients. The member home shows their own cards. Neither shows gym numbers.
- [ ] Pass / [ ] Fail

---

## 14. Leads — owner or admin

**LD-01 — Add a lead**
1. **Leads → Add lead** → "QA Riya", a new number, source Instagram, interest "Weight loss", follow-up **today** → Add lead.

**Expected:** Listed under **Open** as "New", with "Follow up today" highlighted.
- [ ] Pass / [ ] Fail

**LD-02 — Duplicate warning**
1. Add lead → type QA Asha's number → tap the next field.

**Expected:** "This number is already a member (QA Asha)" appears before saving. Cancel.
- [ ] Pass / [ ] Fail

**LD-03 — Update status**
1. QA Riya → **Update** → Contacted, follow-up yesterday, note "Call after 6" → Save.

**Expected:** Status Contacted, and the follow-up shows in **red** as overdue.
- [ ] Pass / [ ] Fail

**LD-04 — Lost needs a reason**
1. Add another lead "QA Kabir" → Update → Lost with no reason, then with "Too far" → Save.

**Expected:** No reason → refused. With a reason it moves to **Lost** and is no longer under Open.
- [ ] Pass / [ ] Fail

**LD-05 — Dashboard follow-ups**
1. Home dashboard.

**Expected:** **Lead follow-ups due** lists QA Riya (overdue), with call and WhatsApp buttons.
- [ ] Pass / [ ] Fail

**LD-06 — Convert to member**
1. QA Riya → **Convert to member**.

**Expected:**
- New member opens with name and number filled in. Add with a plan.
- Back in Leads, QA Riya is under **Joined**, with an "Open member page →" link.
- [ ] Pass / [ ] Fail

**LD-07 — Auto-joined**
1. Add a lead "QA Meera" with a new number.
2. Add a member with the **same number** directly from Members → Add member.

**Expected:** QA Meera moves to **Joined** automatically.
- [ ] Pass / [ ] Fail

**LD-08 — Search and filters**

**Expected:** Search by name or part of the number works. Open / Joined / Lost / All show the right leads.
- [ ] Pass / [ ] Fail

---

## 15. Privacy and access

**AC-01 — Trainer sees only their clients**
1. As QA Trainer, try opening a member who has no PT with them (e.g. QA Bina's workout plan via a link from the admin).

**Expected:** "Not found" (or an error). No data shown.
- [ ] Pass / [ ] Fail

**AC-02 — Member sees only their own data**

**Expected:** Member A never sees Member B's name, payments, sessions or workouts anywhere.
- [ ] Pass / [ ] Fail

**AC-03 — Admin can't change gym details**
1. As admin, open `/admin/gym`.

**Expected:** Not allowed. Owner-only screens don't open.
- [ ] Pass / [ ] Fail

---

## 16. General phone checks

**GN-01 — Small phone:** use the smallest phone you have. Every screen fits, with no sideways scrolling.
- [ ] Pass / [ ] Fail

**GN-02 — Back navigation:** the phone's back button and the in-app "← Back" links go where you expect.
- [ ] Pass / [ ] Fail

**GN-03 — Slow or no internet:** turn on airplane mode and tap something.

**Expected:** A clear error, not a blank screen. It works again when you're back online.
- [ ] Pass / [ ] Fail

**GN-04 — Server waking up ⏱:** after 20 minutes of no use, open the app.

**Expected:** It may take 30–60 seconds the first time, then works normally. Note how long it took.
- [ ] Pass / [ ] Fail

---

## Reporting a failure

Copy this for each ❌ and send it to me (a screenshot helps a lot):

```
Test ID:        e.g. BK-07
Phone / browser: e.g. iPhone 13, Safari (installed app)
Logged in as:   Owner / Admin / Trainer / Member A / Member B
Steps I did:    1. …  2. …
What I expected:
What happened:
Screenshot:     (attach)
Time it happened (roughly): e.g. 28 Oct, 6:40 pm
```

## After testing
- [ ] Remove `OTP_TEST_PHONES` and `OTP_TEST_CODE` from Render (if you set them).
- [ ] Clear the GSTIN in Gym details if you're not GST-registered yet.
- [ ] Tell me which tests failed. QA data can stay until we move to the fresh production database.
