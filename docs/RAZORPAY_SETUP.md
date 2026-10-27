# Razorpay setup (test mode)

This gets the three values the app needs for online renewals (Phase 4c). **Test mode is free, needs no KYC
and moves no real money** — perfect for building and trying everything. Checked against Razorpay's docs
in October 2026; if a label differs slightly, look for the closest match.

You will end up with:

| Setting | Looks like | From |
|---|---|---|
| `RAZORPAY_KEY_ID` | `rzp_test_AbC123…` | Part 2 |
| `RAZORPAY_KEY_SECRET` | ~24 random characters (shown **once**) | Part 2 |
| `RAZORPAY_WEBHOOK_SECRET` | a long random string **you create** | Part 3 |

> Never paste these into chat, GitHub or `.env.example` — only into `apps/api/.env` and the Render dashboard.

---

## Part 1 — Create the account (5 minutes)

1. Go to **https://dashboard.razorpay.com/signup**.
2. Sign up with your email (or Google) and verify the **email OTP**.
3. Enter your **mobile number** and verify the **SMS OTP**.
4. It asks a few business questions (business type, name, etc.). You can fill these in or skip for now —
   they're only needed later for **Live mode** (KYC).
5. You land on the Dashboard. If it shows an "Activate account" / KYC banner, ignore it for now.

## Part 2 — Test-mode API keys

1. At the top of the Dashboard, switch the mode toggle to **Test Mode** (the banner/strip turns orange or
   shows "Test Mode").
2. Go to **Account & Settings** (left menu, bottom) → under **Website and app settings** click **API Keys**.
3. Click **Generate Key** (or *Generate Test Key*).
4. A pop-up shows **Key Id** (`rzp_test_…`) and **Key Secret**.
   - Click **Download Key Details** or copy both now — **the secret is shown only once**.
   - If you lose it, use **Regenerate** and update it everywhere.

## Part 3 — Webhook (how Razorpay tells our server a payment succeeded)

The webhook is what marks a payment as paid in the app, so this part matters.

1. **Create a webhook secret** (any long random string). In a terminal, run:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Copy the output. This is **your** secret — it is *not* the API Key Secret.
2. Still in **Test Mode**: **Account & Settings** → **Webhooks** (under *Website and app settings*) →
   **+ Add New Webhook**.
3. Fill in:
   - **Webhook URL:** `https://gym-app.snitin322.workers.dev/api/v1/webhooks/razorpay`
   - **Secret:** the string from step 1
   - **Alert Email:** your email (Razorpay emails you if deliveries keep failing)
   - **Active Events:** tick
     - `payment.captured`
     - `payment.failed`
     - `order.paid`
4. Click **Create Webhook**. If it asks for an OTP in test mode, enter **754081** (Razorpay's fixed test OTP).

> The endpoint itself is built in Phase 4c. Until it's deployed, Razorpay may report failed test deliveries
> — that's expected. Razorpay retries for 24 hours.

## Part 4 — Save the values

1. In `apps/api/.env` add:

   ```
   RAZORPAY_KEY_ID=rzp_test_...
   RAZORPAY_KEY_SECRET=...
   RAZORPAY_WEBHOOK_SECRET=...
   ```

2. In **Render** → **onthec-api** → **Environment** → **Add Environment Variable**, add the same three
   keys and values → **Save changes** (Render redeploys).
3. Tell Claude it's done.

## Testing payments (after 4c is built)

In test mode the checkout accepts Razorpay's test details instead of real money, for example:
- **UPI:** `success@razorpay` (succeeds) or `failure@razorpay` (fails)
- **Card:** a test card from Razorpay's docs ("Test card details"), any future expiry, any CVV, OTP from the test screen

## Later: going live

1. Complete **KYC / account activation** on the Dashboard (business documents, bank account, website).
2. Switch to **Live Mode** → **API Keys** → **Generate Key** → replace `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in Render.
3. Create a **separate Live-mode webhook** with the same URL and events, and a new secret → update
   `RAZORPAY_WEBHOOK_SECRET` in Render.

## Notes

- **Free Render plan:** Razorpay expects the webhook to answer within 5 seconds. If the API is asleep
  (30–60 s to wake), the first delivery fails and Razorpay retries automatically, so the payment still
  completes — just a minute later. The always-on Render plan avoids this.
- The app never stores card or bank details — Razorpay's checkout handles them.
