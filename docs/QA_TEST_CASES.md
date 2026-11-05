# Onthec Fitness Club — QA test cases (phone)

Manual end-to-end tests for the live app: **https://gym-app.snitin322.workers.dev**

Covers everything built up to Phase 8 (members, payments, invoices, PT booking, workout plans and tracking, dashboard, leads), the design refresh (tabs at the bottom for each role, a sidebar on laptops, actions in panels that slide up from the bottom) and **coaching** (coach per client, health details, diet and supplements, weekly check-ins with photos, progress graphs; sections 18–21).

Work through the cases in order. Later sections use data created earlier. Tick each one ✅ or ❌, and report every ❌ using the template at the end.

---

## 0. Before you start

### Accounts you need (5 phones or numbers)

| Role | Name to use | How to create |
|---|---|---|
| **Owner** | You | Already exists |
| **Admin** | "QA Desk" | Created in test ST-01 |
| **Trainer** | "QA Trainer" | Created in test ST-02 |
| **Member A** | "QA Asha" | Created in test MB-01 (gets a plan, PT, workouts; QA Trainer becomes her coach in CO-01) |
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

### Where things are now
Every role has tabs at the bottom of the screen:

| Role | Tabs |
|---|---|
| Member | **Progress · Plan · Check-in · Profile** |
| Trainer | **Today · Clients · Schedule · Profile** |
| Owner / admin ("desk") | **Today · Members · PT · More** |

- **Member:** **Progress** is the home screen (graphs, this week's check-in, today's workout and meals, membership). **Plan** has *Today · My week · Meals · Full plan*. **Personal training** (book, confirm, history) and **Health details** are under **Profile**.
- **Trainer:** a client's page has *Progress · Workout · Diet · Profile* for coaching clients, plus *PT* when they have a package. A PT-only client shows *Workout · Diet · PT*. Workout tracking sits under the plan in the *Workout* view.
- **Desk:** a member's *Overview* has a **Coach** card with *Progress and check-ins* and *Health details* (owner or the coach only) and *Diet plan*. **More** also has **Diet** (templates and the food list).
- Desk screens used less often (Leads, Plans, Workouts, Diet, Staff, Gym details) are under **More**. Log out is on **More** (desk) or **Profile** (member, trainer).
- Most actions (Renew, Freeze, Record payment, Book, Mark session, Add plan…) open a **panel that slides up from the bottom**. Close it with **✕** or by tapping the dimmed area. A short message (e.g. "Payment recorded") pops up at the bottom when something is saved.
- Long screens are split into **views** you switch at the top (e.g. *Overview · Payments · PT · Workout* on a member page).

### What to check on every screen (no separate test case)
- Nothing is cut off and the page doesn't scroll sideways.
- Buttons are big enough to tap.
- Text is readable in **both light and dark** (the app follows the phone's setting).
- Error messages are in plain words, not codes.
- The bottom tabs never cover the last button on a screen (scroll to the bottom to check).

---

## 1. Install and login

**IN-01 — Install on Android (Chrome)** · any role
1. Open the app link in Chrome.
2. Tap **Install app** (or the browser menu → *Install app* / *Add to Home screen*).

**Expected:** The Onthec logo icon (olive background), named **Onthec**, appears on the home screen and opens full screen, without the browser address bar. If you installed the app before, remove it and install again to get the new icon.
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

**Expected:** The **Today** tab: a greeting, your first name, "Owner · ‹gym›", an **Add member** button (just a + icon on small phones), four count tiles, then the dashboard. Tabs at the bottom: **Today · Members · PT · More**.
- [ ] Pass / [ ] Fail

**LG-04 — Stay logged in**
1. Close the app completely.
2. Open it again from the home-screen icon.

**Expected:** Still logged in. No code needed.
- [ ] Pass / [ ] Fail

**LG-05 — Log out**
1. **More** tab → **Log out** (members and trainers: **Profile** tab → **Log out**).

**Expected:** Back to the start screen. Opening the app again asks for login.
- [ ] Pass / [ ] Fail

**LG-06 — First login asks for consent** · do this with Member A after MB-01

**Expected:** The "Before you start" screen appears. *Agree and continue* stays disabled until you tick the box, then opens the member home. On the next login it isn't asked again.
- [ ] Pass / [ ] Fail

---

## 2. Gym setup (owner)

**GY-01 — Gym details**
1. **More → Gym details**.
2. Fill in legal name, address, city, PIN, contact number and email. Leave GSTIN **empty**. Save.

**Expected:** Saved message. Opening it again shows the same values.
- [ ] Pass / [ ] Fail

**GY-02 — GSTIN check**
1. Enter a GSTIN with one wrong character → Save.

**Expected:** Refused with a clear message before saving. Then clear the field again (we test receipts without GST first).
- [ ] Pass / [ ] Fail

**PL-01 — Add plans**
1. **More → Plans** → **Add plan** (a panel slides up): "QA 1 month", length 1 month, ₹1,500.
2. Add "QA 3 months", 3 months, ₹4,000.

**Expected:**
- "Max freeze days" fills in automatically (0 for 1 month, 15 for 3 months).
- A "Plan added" message pops up and the panel closes.
- Both plans are listed with prices "incl. GST". **Edit** on a plan opens the same panel.
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
1. **More → Staff → Add staff** → "QA Desk", phone, role **Admin**.

**Expected:** Listed under staff as Admin. That person can log in and sees the desk app (Today · Members · PT · More). Under **More** they have no *Gym details*.
- [ ] Pass / [ ] Fail

**ST-02 — Add a trainer** · owner
1. **Add staff** → "QA Trainer", role **Trainer**.

**Expected:** Listed as Trainer, with an **Hours →** link.
- [ ] Pass / [ ] Fail

**ST-03 — Admin can only add trainers** · admin
1. As QA Desk: **More → Staff → Add staff** → role list.

**Expected:** Only "Trainer" can be chosen.
- [ ] Pass / [ ] Fail

**ST-04 — Duplicate number**
1. Add staff with QA Trainer's number again.

**Expected:** Refused: number already in use.
- [ ] Pass / [ ] Fail

---

## 4. Members (admin)

**MB-01 — Add member with plan, paid** · admin
1. **Members → Add member** (or **Today → Add member**) → "QA Asha", phone, plan **QA 1 month**, start today, payment **UPI**, reference "TEST123" → Add member.

**Expected:**
- The member page opens on **Overview**: name, Call and WhatsApp buttons, Active, days left, end date one month later.
- Views at the top: **Overview · Payments · PT · Workout**.
- **Payments** shows ₹1,500 UPI with an **Invoice …** link.
- [ ] Pass / [ ] Fail

**MB-02 — Add member, pay later** · admin
1. Add "QA Bina", plan **QA 3 months**, payment **Pay later**.

**Expected:**
- The member page shows **₹4,000 due**, and the membership card on **Overview** has a *Record payment* button.
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
1. QA Asha → Overview → **Edit details** (panel slides up) → add emergency contact and notes → Save.

**Expected:** "Details saved" message. Shown on Overview.
- [ ] Pass / [ ] Fail

**MB-07 — Part payment** · admin
1. QA Bina → Overview → **Record payment** (panel) → ₹1,000, Cash.
2. Then record another ₹4,000.

**Expected:**
- After ₹1,000: "Payment recorded" message, then "₹3,000 due · ₹1,000 paid". The invoice is under **Payments**.
- ₹4,000 is refused ("Only ₹3,000 is due").
- Recording ₹3,000 clears the due.
- [ ] Pass / [ ] Fail

**MB-08 — Renew (queue next membership)**
1. QA Asha → **Renew** → QA 3 months.

**Expected:** "Starts on" defaults to the day after the current membership ends. "Membership added" message. The new membership shows as upcoming under **Payments → Other memberships**.
- [ ] Pass / [ ] Fail

**MB-09 — Freeze and unfreeze**
1. Use a member on **QA 3 months** (freeze allowed) → **Freeze** 5 days from today → Freeze.
2. Then **Unfreeze**.

**Expected:**
- "Membership frozen" message. Status becomes Frozen, and the end date moves 5 days later.
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
1. QA Asha → **Payments** view → tap **Invoice …**.

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
1. **Profile** tab → **My payments** → invoice link.

**Expected:** The same PDF opens.
- [ ] Pass / [ ] Fail

---

## 6. Member home (Member A)

**MH-01 — Membership card**
1. Log in as QA Asha.

**Expected:**
- **Progress** (the home screen): greeting and first name, then **Your progress starts here** with *Send your first check-in* (graphs appear after check-ins, section 20). Below: today's workout, today's meals (once there's a diet), personal training, and an olive card with the plan, "N days left", a progress bar and the end date.
- **Profile**: the full membership card (date range, "Next: …" for the renewal from MB-08), Renew online, My payments, install help and Log out.
- [ ] Pass / [ ] Fail

**MH-02 — Due shown to member** · Member B
1. Log in as QA Bina (before MB-07 is fully paid, or on another pay-later member).

**Expected:** Amount due is shown.
- [ ] Pass / [ ] Fail

**MH-04 — Member tabs**
1. Tap **Progress**, **Plan**, **Check-in** and **Profile** in turn.
2. On **Profile**, tap **Personal training** (shown once Member A has a PT package, section 8).

**Expected:** Each tab opens its screen and is highlighted. **Plan** has *Today · My week · Meals · Full plan*. **Personal training** has *Upcoming · Book · History*, keeps the **Profile** tab highlighted, and "‹ Profile" goes back. The phone's back button returns to the previous screen.
- [ ] Pass / [ ] Fail

**MH-03 — Member can't open admin screens**
1. As a member, type `/admin/members` at the end of the app address.

**Expected:** Back on the member home. No admin data visible.
- [ ] Pass / [ ] Fail

---

## 7. Online renewal (Razorpay test mode) — Member A

**ON-01 — Renew online**
1. **Profile** tab → **Renew online** → pick QA 1 month.
2. Pay with the test card 4100 2800 0000 1007 → success on the test page.

**Expected:**
- "Payment successful" (or "Payment received, it will update shortly").
- Within about a minute the new membership appears and the payment is listed with an invoice.
- The desk sees it on the member page under **Payments** as Razorpay.
- [ ] Pass / [ ] Fail

**ON-02 — Payment cancelled**
1. Start **Renew online** and close the payment window.

**Expected:** Nothing is charged. A clear message, and no new membership.
- [ ] Pass / [ ] Fail

---

## 8. PT packages and selling (owner or admin)

**PT-01 — Create package**
1. **PT** tab → **Packages** → **Add package** (panel) → "QA 4 Sessions", 4 sessions, 30 days, ₹2,000.

**Expected:** Listed as 4 sessions · valid 30 days · ₹2,000.
- [ ] Pass / [ ] Fail

**PT-02 — Sell PT with trainer**
1. QA Asha → **PT** view → **Sell PT package** (panel) → QA 4 Sessions, trainer **QA Trainer**, Cash → Sell package.

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
1. QA Asha → **PT** view → **Adjust sessions** → Remove 10, reason "test".
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

**Expected:** **Progress** shows a *Personal training* card ("with QA Trainer · N sessions left"). **Profile → Personal training → Book** shows the package with sessions left, trainer and use-by date.
- [ ] Pass / [ ] Fail

**PT-07 — Trainer sees client** · Trainer

**Expected:** **Clients** tab shows QA Asha with sessions left and use-by date. Tapping her opens her page: Call and WhatsApp buttons, and views **Workout · Diet · PT** (after CO-01 makes QA Trainer her coach: **Progress · Workout · Diet · Profile · PT**).
- [ ] Pass / [ ] Fail

---

## 9. Trainer hours and booking

**BK-01 — Set weekly hours** · Trainer
1. **Profile** tab → **My availability** → **Add hours on** today's weekday, from about 3 hours from now to 6 hours from now.
2. Add tomorrow too. Session length 60 → **Save hours**.

**Expected:** "Saved" message. Overlapping ranges on the same day are refused before saving.
- [ ] Pass / [ ] Fail

**BK-02 — Book a session** · Member A
1. **Profile → Personal training → Book** → pick tomorrow → pick a time → **Book session**.

**Expected:**
- **Personal training → Upcoming** shows it, with "Free to cancel until …" (12 hours before).
- The PT card says "… sessions left · 1 booked".
- [ ] Pass / [ ] Fail

**BK-03 — Times you can't book** · Member A

**Expected:**
- Times less than 2 hours from now aren't offered.
- Days more than 14 days ahead aren't offered.
- The slot booked in BK-02 no longer appears.
- [ ] Pass / [ ] Fail

**BK-04 — Trainer's schedule** · Trainer

**Expected:** The **Schedule** tab shows the booking with QA Asha's name and phone. The desk sees it too: **PT** tab → **Sessions** → QA Trainer.
- [ ] Pass / [ ] Fail

**BK-05 — Reschedule** · Member A
1. **PT → Upcoming** → tomorrow's session → **Reschedule** (panel) → another time.

**Expected:** "Session moved" message. The old time is free again.
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
1. Member books again, then the trainer cancels it from the **Schedule** tab with a reason.

**Expected:** The member's sessions left is unchanged.
- [ ] Pass / [ ] Fail

**BK-09 — Time off cancels bookings** · Trainer
1. Member books tomorrow.
2. Trainer → **Profile → My availability** → **Add time off** → **Whole days** tomorrow, reason "QA leave".

**Expected:** The app lists the cancelled session. The member's session disappears and nothing is used up. Tomorrow has no bookable times. Remove the time off afterwards.
- [ ] Pass / [ ] Fail

**BK-10 — Desk books for a member** · admin
1. QA Asha's page → **PT** view → **Book session** (panel).

**Expected:** "Session booked" message. It shows in the member's Upcoming and in the trainer's Schedule tab.
- [ ] Pass / [ ] Fail

**BK-11 — Owner PT rules** · owner
1. **More → Gym details** → **PT booking rules** → change free-cancel to 6 hours → save.
2. Change it back to 12.

**Expected:** The member's "Free to cancel until" reflects the new rule.
- [ ] Pass / [ ] Fail

---

## 10. Completing sessions and disputes ⏱
Book a session that starts within the next 2–3 hours (set the trainer's hours accordingly), then wait until it starts.

**CS-01 — Trainer marks Completed** · Trainer
1. **Today** tab → the session → **Mark session** (panel) → **Completed** → note "Leg day" → Save.

**Expected:** "Session marked" message. Shows "Completed · marked by QA Trainer" and "Waiting for the member". Sessions left drops by 1.
- [ ] Pass / [ ] Fail

**CS-02 — Undo within an hour** · Trainer
1. **Undo mark** → then mark it again as **No-show**.

**Expected:** Undo gives the session back. Marking again uses it again. After an hour, the trainer has no Undo button.
- [ ] Pass / [ ] Fail

**CS-03 — Member confirms** · Member A
1. **Progress** shows "1 session to confirm" → tap it (or **Profile → Personal training** → *Please confirm*) → **Confirm**.

**Expected:** Status "Confirmed". The trainer's Undo is gone.
- [ ] Pass / [ ] Fail

**CS-04 — Member disputes** · Member A
1. On another marked session → **Not right?** → send empty, then with "I was there".

**Expected:** Empty is refused. Then the status says "Disputed".
- [ ] Pass / [ ] Fail

**CS-05 — Desk resolves** · owner or admin
1. **PT** tab → **To resolve · 1** → **Resolve dispute** (panel) → **Give session back** + note → Save decision.

**Expected:** The member's sessions left goes up by 1, and they see "Session given back" with the note. "Keep as used" on another dispute changes nothing.
- [ ] Pass / [ ] Fail

**CS-06 — Not marked yet**
1. Let a booked session end without marking it.

**Expected:** It appears under **Not marked yet** on the trainer's Today tab and on the desk's **PT → To resolve**. Desk **Today → Training** shows "1 session not marked".
- [ ] Pass / [ ] Fail

**CS-07 — Auto-confirm after 24 h ⏱** · Member A (next day)
1. Leave a marked session unanswered for 24 hours.

**Expected:** It shows "Confirmed (no reply in 24 h)". *Not right?* is gone.
- [ ] Pass / [ ] Fail

---

## 11. Workout plans

**WP-01 — Exercise library** · owner or admin
1. **More → Workouts → Exercise library**. If empty, tap **Add common exercises**.

**Expected:** About 50 exercises, grouped by muscle group, each with a short how-to. Search works.
- [ ] Pass / [ ] Fail

**WP-02 — Add your own exercise**
1. **Add exercise** (panel) → "QA Battle Ropes", Cardio, Full body, video link "youtube" (wrong), then fix it to `https://youtu.be/…`.

**Expected:** A wrong link is refused. The right one saves, and a **Video** link shows on the exercise.
- [ ] Pass / [ ] Fail

**WP-03 — Build a template**
1. **More → Workouts → New template** → name "QA Beginner split".
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
1. QA Asha → **Workout** view → Start from **QA Beginner split** → **Give plan**.

**Expected:** The plan shows, and **Show week** displays all 7 days.
- [ ] Pass / [ ] Fail

**WP-06 — Member's copy is separate**
1. Change the template's Monday weight.
2. Then reopen QA Asha's plan.

**Expected:** Asha's plan still has the old weight. Her own edits don't change the template either.
- [ ] Pass / [ ] Fail

**WP-07 — Trainer edits client plan** · Trainer
1. **Clients** tab → QA Asha → **Plan** → **Edit plan** → heavier weight → Save new version.

**Expected:** Saved with "by QA Trainer". The trainer can't open the plan of a member who has no PT with them.
- [ ] Pass / [ ] Fail

**WP-08 — Today's workout** · Member A

**Expected:**
- **Progress** shows a *Today's workout* card; tapping it opens the **Plan** tab.
- **Plan → Today** shows today's weekday with sets, weights, rest times and notes.
- **Plan → Full plan** shows all 7 days, and Sunday is a rest day.
- [ ] Pass / [ ] Fail

**WP-09 — No plan** · Member B

**Expected:** "Ask the front desk or your trainer for a plan."
- [ ] Pass / [ ] Fail

---

## 12. Workout tracking (My week) — Member A

**TR-01 — The week**

**Expected:** **Plan → My week** shows Mon–Sun. Today is selected, past days show "To do" (•) or "Missed" (✕), Sunday shows Rest (–), and future days show nothing.
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
1. Trainer (**Clients** → QA Asha → **Workout** view → *Workout tracking* below the plan) and admin (QA Asha → **Workout** view → *Workout tracking*).

**Expected:** Same week and ticks, with no *Mark done* or *Update* buttons.
- [ ] Pass / [ ] Fail

---

## 13. Dashboard

**DB-01 — Owner dashboard** · owner

**Expected:**
- **Today** tab: Active members, Ending in 7 days, Expired (30 days) and No plan, each tappable and opening the matching member list.
- Views below them: **Follow up · Money · Training**.
- **Money**: today and this month match the payments you made today, with the split by method.
- [ ] Pass / [ ] Fail

**DB-02 — Who to call** · owner or admin
1. Make sure a QA member's membership ends within 7 days (e.g. start QA 1 month about 25 days ago).
2. **Today → Follow up** → tap the phone icon, then the chat icon next to them.

**Expected:** The phone icon opens the dialer with their number. The chat icon opens WhatsApp with a ready message naming the gym and the end date. Do **not** press send unless it's your own number.
- [ ] Pass / [ ] Fail

**DB-03 — Admin can't see money** · admin

**Expected:** Only **Follow up · Training** views (no Money). Dues, PT, Workouts and Leads are visible.
- [ ] Pass / [ ] Fail

**DB-04 — PT and workouts numbers**

**Expected:** On **Today → Training**:
- PT this week shows the sessions you booked, completed and no-showed.
- "Workouts" shows how many members with a plan ticked a day this week.
- Disputes and unmarked counts link to **PT → To resolve**.
- [ ] Pass / [ ] Fail

**DB-05 — Trainer and member have no dashboard**

**Expected:** The trainer's Today tab shows their sessions. The member's Home shows their own cards. Neither shows gym numbers.
- [ ] Pass / [ ] Fail

---

## 14. Leads — owner or admin

**LD-01 — Add a lead**
1. **More → Leads → Add lead** (panel) → "QA Riya", a new number, source Instagram, interest "Weight loss", follow-up **today** → Add lead.

**Expected:** "Lead added" message. Listed under **Open** as "New", with "Follow up today" highlighted.
- [ ] Pass / [ ] Fail

**LD-02 — Duplicate warning**
1. Add lead → type QA Asha's number → tap the next field.

**Expected:** "This number is already a member (QA Asha)" appears before saving. Cancel.
- [ ] Pass / [ ] Fail

**LD-03 — Update status**
1. QA Riya → **Update** (panel) → Contacted, follow-up yesterday, note "Call after 6" → Save.

**Expected:** Status Contacted, and the follow-up shows in **red** as overdue.
- [ ] Pass / [ ] Fail

**LD-04 — Lost needs a reason**
1. Add another lead "QA Kabir" → Update → Lost with no reason, then with "Too far" → Save.

**Expected:** No reason → refused. With a reason it moves to **Lost** and is no longer under Open.
- [ ] Pass / [ ] Fail

**LD-05 — Dashboard follow-ups**
1. **Today → Follow up**.

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
1. As QA Trainer, try opening a member who has no PT with them and isn't their coaching client (e.g. QA Bina's workout plan via a link from the admin).

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

**GN-02 — Back navigation:** the phone's back button and the in-app "‹ Members", "‹ More"… links go where you expect. After switching a view (e.g. a member's **PT** view), opening something and coming back returns to the same view.
- [ ] Pass / [ ] Fail

**GN-03 — Slow or no internet:** turn on airplane mode and tap something.

**Expected:** A clear error, not a blank screen. It works again when you're back online.
- [ ] Pass / [ ] Fail

**GN-04 — Server waking up ⏱:** after 20 minutes of no use, open the app.

**Expected:** It may take 30–60 seconds the first time, then works normally. Note how long it took.
- [ ] Pass / [ ] Fail

---

## 17. New design (all roles)

**DS-01 — Desk tabs** · owner or admin
1. Tap **Today**, **Members**, **PT** and **More**. Then open **More → Plans**.

**Expected:** Each tab opens its screen and is highlighted. On Plans (and Leads, Workouts, Staff, Gym details) the **More** tab stays highlighted and "‹ More" goes back.
- [ ] Pass / [ ] Fail

**DS-02 — Member page views** · admin
1. QA Asha → tap **Overview**, **Payments**, **PT**, **Workout**.

**Expected:** Each view is short. The name, Call/WhatsApp buttons and any amount due stay on top in every view.
- [ ] Pass / [ ] Fail

**DS-03 — Panels** · any role
1. Open any panel (e.g. **Renew**). Close it with ✕. Open it again and tap the dimmed area above it.

**Expected:** It slides up from the bottom and closes both ways without saving anything. The page behind doesn't scroll while it's open. Long panels scroll inside.
- [ ] Pass / [ ] Fail

**DS-04 — PT tab (desk)** · owner or admin
1. **PT** tab → **Sessions** → pick each trainer → **To resolve** → **Packages**.

**Expected:** Sessions shows the chosen trainer's next two weeks. *To resolve* shows a count when there are disputes or unmarked sessions. Packages lists PT packages with **Add package**.
- [ ] Pass / [ ] Fail

**DS-05 — Trainer tabs** · Trainer
1. Tap **Today**, **Clients**, **Schedule**, **Profile**.

**Expected:** Today: greeting, "Sessions today" and "Later this fortnight" counts, **Check-ins to reply to** (when a coaching client has sent one), today's sessions. Clients: list (search box appears when there are more than 5). Schedule: next two weeks. Profile: account, *My availability*, Log out.
- [ ] Pass / [ ] Fail

**DS-06 — Light and dark** · any role
1. Switch the phone between light and dark mode (Settings → Display) with the app open.

**Expected:** The app switches too: cream background with olive buttons in light, dark green-black with light-olive buttons in dark. All text is readable in both.
- [ ] Pass / [ ] Fail

**DS-07 — Laptop** · owner or admin
1. Open the app link in a laptop browser (window wider than a tablet).

**Expected:** A sidebar on the left lists Today, Members, PT, Leads, Plans, Workouts, Diet, Staff, Gym details (owner only) and Account. No tabs at the bottom. The four count tiles sit in one row. Making the window narrow switches back to bottom tabs.
- [ ] Pass / [ ] Fail

---

## 18. Coaching: coach and health details (C1)

**CO-01 — Set a coach** · owner or admin
1. Members → open Member A → Overview → **Coach** card → **Set coach**.
2. Pick the trainer and save.

**Expected:** A "Coach saved" message; the card shows the trainer's name. The list offers trainers and the owner only (not admins). The card has **Diet plan** for everyone at the desk; **Progress and check-ins** and **Health details** only for the owner (an admin doesn't see them).
- [ ] Pass / [ ] Fail

**CO-02 — Trainer's clients** · trainer
1. Clients tab.

**Expected:** Member A is listed with "Coaching" (even without a PT package). Opening them shows **Progress · Workout · Diet · Profile** (and **PT** if they have a package), starting on Progress. The trainer can give and edit their workout plan and diet.
- [ ] Pass / [ ] Fail

**CO-03 — Coach fills in details** · trainer
1. Member A → **Profile** view → **Add details**. Fill height, weight, goal, a medical condition and a food allergy. Save.

**Expected:** "Details saved". Body facts show in tiles; the medical condition and allergy show under **Keep in mind**. A line says Member A hasn't agreed in the app yet.
- [ ] Pass / [ ] Fail

**CO-04 — Member agrees and updates** · Member A
1. **Progress** shows **Tell (coach) about you** → tap it (or **Profile → Health details**).
2. **Update my details** → change the goal → Save without ticking the box.
3. Tick **I agree to share these health details…** → Save.

**Expected:** Step 2 is refused with "Agree to share these details with your coach to save them." Step 3 saves. The trainer's Profile view now says Member A agreed, with the date. The Progress card is gone once details exist.
- [ ] Pass / [ ] Fail

**CO-05 — Who can see health details** · admin, another trainer, owner
1. As admin: open Member A → no "Health details" link.
2. As a trainer who isn't Member A's coach: Member A isn't in Clients (unless they have PT with them, and then there's no Profile view).
3. As owner: Member A → Coach card → **Health details**.

**Expected:** Only the coach, the owner and the member see the details.
- [ ] Pass / [ ] Fail

**CO-06 — Owner as coach** · owner
1. Set yourself as Member B's coach. Members → **My clients**.

**Expected:** Only the members you coach are listed. Admins don't have this filter.
- [ ] Pass / [ ] Fail

**CO-07 — Delete health details** · Member A
1. Profile → Health details → **Delete my health details** → Delete.

**Expected:** "Health details deleted"; the details are gone for the coach too, and the next save asks for agreement again. Membership and workout plan are unchanged.
- [ ] Pass / [ ] Fail

**CO-08 — Health details in a sheet at 360 px** · trainer
1. Member A → **Profile** → **Edit details** on the smallest phone you have.

**Expected:** The form is grouped as Body, Goal and food, Health, Lifestyle. Fields sit two per row in Body; nothing is cut off; the sheet scrolls inside and **Save** is reachable.
- [ ] Pass / [ ] Fail

---

## 19. Coaching: diet and supplements (C2)

**DI-01 — Food list** · owner or admin
1. More → **Diet** → **Food list** → **Add common foods**.
2. **Add food**: "Poha (cooked)", per 100 g, protein 2.5, carbs 23, fat 2 (leave calories empty).

**Expected:** About 35 foods appear, e.g. "Egg (whole) · 78 kcal per egg". The new food shows about 120 kcal per 100 g (worked out). Tapping a food opens it for editing; **Hide** greys it out.
- [ ] Pass / [ ] Fail

**DI-02 — Diet template** · owner
1. Diet → **New template**. Name it, add foods to Breakfast and Lunch, set times.
2. **Rest day** → **Make a rest-day version** → remove one food.
3. **Supplements** → add Whey protein, 1 scoop, After workout. Water 3.
4. **Create template**.

**Expected:** Totals update as you change amounts. The template is listed with its training-day calories.
- [ ] Pass / [ ] Fail

**DI-03 — Coach gives a diet** · trainer (coach of Member A)
1. Clients → Member A → **Diet** → pick the template → **Start diet**.
2. **Edit diet** → **Add food** to Dinner (search "chick") → change the amount → **Save diet**.

**Expected:** "Diet saved"; version 2. Typing a food that isn't listed offers "Add … to the food list".
- [ ] Pass / [ ] Fail

**DI-04 — Member sees meals** · Member A
1. **Progress** → **Today's meals** card (or **Plan → Meals**).

**Expected:** Daily calories, protein, carbs and fat; each meal with time, foods and amounts ("2 rotis", "150 g"); supplements with dose and timing; water. On a rest day of their workout plan it opens on **Rest day**.
- [ ] Pass / [ ] Fail

**DI-05 — Who can change a diet** · admin, another trainer
1. As admin: Member A → Coach card → **Diet plan** → edit and save.
2. As a trainer who isn't Member A's coach and has no PT with them: Member A isn't in Clients.

**Expected:** The desk can edit; other trainers can't reach it.
- [ ] Pass / [ ] Fail

**DI-06 — Rest-day meals** · Member A (diet with a rest-day version, workout plan with a rest day)
1. On a rest day of the workout plan, open **Plan → Meals**.

**Expected:** It opens on **Rest day** with the lighter meals and their total; **Training day** switches back. On a training day it opens on **Training day**.
- [ ] Pass / [ ] Fail

**DI-07 — Food added while planning** · trainer
1. Member A → **Diet** → **Edit diet** → **Add food** → search a food that isn't listed, e.g. "Sattu" → **Add "Sattu" to the food list**.
2. Fill per 100 g: protein 20, carbs 60, fat 7 → **Add food**.

**Expected:** The food is added to the meal at once (100 g) and appears in More → Diet → Food list for the desk.
- [ ] Pass / [ ] Fail

---

## 20. Coaching: weekly check-in and progress (C3)

Photos need R2 set up first (docs/R2_SETUP.md). Without it, the check-in has two steps and no photos.

**CK-01 — New tabs** · Member A

**Expected:** Tabs are **Progress · Plan · Check-in · Profile**. Plan has Today · My week · Meals · Full plan. A member with PT finds **Personal training** in Profile (and the next session on Progress).
- [ ] Pass / [ ] Fail

**CK-02 — First check-in** · Member A (no check-ins yet)
1. Progress shows **Your progress starts here** → **Send your first check-in**.
2. Step 1: weight; tap **Add body fat and measurements**, fill waist. **Next**.
3. Step 2: add front, left and right photos (camera or gallery). **Next**.
4. Step 3: a note → **Send check-in**.

**Expected:** "Check-in sent"; the card shows the weight, waist, the three photos and the note, with "Ravi will reply here". **Update this week's check-in** lets you change it.
- [ ] Pass / [ ] Fail

**CK-03 — Coach replies** · trainer (Member A's coach)
1. Today shows **Check-ins to reply to · 1** → tap Member A.
2. Progress view: graph, then the check-in. Tap a photo to see it large.
3. Write a reply → **Send reply**.

**Expected:** "Reply sent"; the check-in leaves the Today list. Member A sees the reply on Check-in and **(coach) replied** on Progress, and can no longer change that week.
- [ ] Pass / [ ] Fail

**CK-04 — Graph** · Member A (after two or more weekly check-ins; the desk can't backdate them, so this needs two weeks of testing)

**Expected:** Progress shows **Body weight** large with the change since the first point and 1M / 3M / 6M / All. Small cards for body fat and each measurement entered; tapping one makes it the large graph. Readable in dark mode.
- [ ] Pass / [ ] Fail

**CK-05 — Privacy** · admin, another trainer, owner

**Expected:** An admin and other trainers can't open Member A's progress or photos. The owner can: member page → Coach card → **Progress and check-ins**. A photo link stops working after about 15 minutes (reload the page to get a fresh one).
- [ ] Pass / [ ] Fail

**CK-06 — Owner as coach** · owner (coach of Member B)

**Expected:** When Member B sends a check-in, the desk Today shows **Check-ins to reply to**, opening Member B's progress page with the reply box.
- [ ] Pass / [ ] Fail

**CK-07 — Check-in without photos** · Member B (with a coach)
1. **Check-in** → weight → **Next** → **Skip photos** → **Send check-in**.

**Expected:** Sent without photos; the coach sees the weight and note only. Photos can still be added with **Update this week's check-in** until the coach replies.
- [ ] Pass / [ ] Fail

**CK-08 — One check-in a week** · Member A
1. After sending this week's check-in, open **Check-in** again.

**Expected:** It shows this week's check-in (not a new form). Next Monday, the form opens again for the new week, and last week moves to **Earlier weeks**.
- [ ] Pass / [ ] Fail

---

## 21. Coaching: strength and consistency (C4)

**SG-01 — Workouts this week** · Member A (with a workout plan)
1. Plan → My week → tick a day as done.
2. Open Progress.

**Expected:** A **Workouts this week** card shows "1 of N" (N = training days in the plan) with bars for the last 8 weeks; this week's bar is the strongest colour.
- [ ] Pass / [ ] Fail

**SG-02 — Strength graphs** · Member A (after ticking weighted exercises on two or more weeks)

**Expected:** Orange cards for up to 3 lifts (the ones trained most often with a weight) with their heaviest set. Tapping one makes it the large graph, titled "(lift) · heaviest set", with the change since the first week. Skipped exercises and sets without a weight don't count.
- [ ] Pass / [ ] Fail

**SG-03 — Coach sees the same** · Member A's coach, and the owner

**Expected:** The client's Progress view (coach) and the desk Progress page (owner) show the same strength and workouts cards above the check-ins.
- [ ] Pass / [ ] Fail

**SG-04 — Graphs update after ticking a day** · Member A
1. **Plan → My week** → today → **Update what I did** → raise the weight of a main lift → Save.
2. Go back to **Progress**.

**Expected:** That lift's card shows the new heaviest set for this week, and **Workouts this week** went up by one.
- [ ] Pass / [ ] Fail

---

## Reporting a failure

Copy this for each ❌ and send it to me (a screenshot helps a lot):

```
Test ID:        e.g. BK-07
Phone / browser: e.g. iPhone 13, Safari (installed app)
Logged in as:   Owner / Admin / Trainer / Member A / Member B
Light or dark:  e.g. dark
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
