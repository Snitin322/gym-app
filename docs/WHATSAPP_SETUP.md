# WhatsApp login codes — complete setup

This sets up Meta's **free WhatsApp test number** so the API can send login codes to your WhatsApp.
It takes about 20–30 minutes the first time. Checked against Meta's docs as of October 2026; Meta renames
buttons often, so if a label differs slightly, look for the closest match (or send a screenshot).

**You will end up with three values** for `apps/api/.env`:

| Value | Looks like | Where it comes from |
|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | `123456789012345` (15–16 digits) | Part 3 |
| `WHATSAPP_ACCESS_TOKEN` | `EAAG...` (long, ~200 characters) | Part 3 (24 h) or Part 6 (permanent) |
| An approved template named `login_code` | — | Part 4 |

> Never paste the access token into chat, GitHub, or `.env.example`. Only into `apps/api/.env`.

---

## What you need first

- A **Facebook account** (your personal one is fine — Meta uses it to log you in to the developer tools).
- **WhatsApp** on your phone, on the number you will log in to the gym app with.
- A computer browser (the setup pages don't work well on a phone).

---

## Part 1 — Register as a Meta developer (one time)

1. Open **https://developers.facebook.com** and click **Log in** (top right). Log in with Facebook.
2. Click **Get Started** (or **My Apps** — if it opens the app list directly, you're already registered; skip to Part 2).
3. Accept the Platform Terms → **Continue**.
4. **Verify your account**: Meta sends a code to your phone or email. Enter it → **Continue**.
5. "Which of the following best describes you?" → choose **Developer** → **Complete Registration**.

## Part 2 — Create the app

1. Go to **https://developers.facebook.com/apps** → click **Create App**.
2. **App details**
   - App name: `Onthec Gym`
   - App contact email: your email
   - → **Next**
3. **Use cases**: select **Connect with customers through WhatsApp** → **Next**.
   *(If you don't see it: choose **Other** → **Next** → app type **Business** → **Next**. Later, on the app dashboard, find **WhatsApp** in the product list and click **Set up**.)*
4. **Business portfolio**
   - If you have none, choose **Create a business portfolio**: business name `Onthec Gym`, your name, your business email → **Create** (or **Next**).
   - If one exists, select it.
5. **Publishing requirements**: it may list nothing yet → **Next**.
6. Check the summary → **Create app**. Facebook may ask for your password again.

You land on **Connect on WhatsApp → Quickstart** (left menu: *Customize use case*).

## Part 3 — Test number, token and your own number

1. On Quickstart, click **Start using the API**. You are taken to **API Setup**.
2. **Messaging account** (Meta's new name for "WhatsApp Business Account"):
   - If a dropdown shows one, keep it selected.
   - If not, click **Create a WhatsApp Business account** and follow the prompts (name: `Onthec Gym`).
   - Note the **Messaging account ID** shown in the panel (useful in Part 4's backup option).
3. Click **Generate access token** → a Facebook popup opens → **Continue** → select the Messaging account if asked → **Save/Continue**.
   - Copy the token that appears (starts with `EAA`). **It expires after 24 hours** (see Part 6 for a permanent one).
4. **From**: a free **test number** is preselected (often a US `+1 555…` number). Just below it, copy the **Phone number ID**.
   - ⚠️ Copy the **ID**, not the phone number itself. Using the number is the most common mistake.
5. **To**: open the dropdown → **Manage phone number list** → **Add phone number**.
   - Country: India (+91), then your 10-digit WhatsApp number → **Next**.
   - WhatsApp sends you a verification code **as a WhatsApp message** (not SMS). Enter it → **Done/Verify**.
   - The test number can message at most **5** numbers you add here.
6. Select your number in **To** and click **Send message**.
   - You should receive Meta's **"Hello World"** message on WhatsApp within a few seconds. ✅ That proves the app, token and number work.
   - Reply "Hi" to it (optional; it keeps the chat open for non-template messages).

## Part 4 — Create the `login_code` template

Login codes must use an approved **Authentication** template. Meta fixes the wording:
*"123456 is your verification code. For your security, do not share this code. This code expires in 5 minutes."* plus a **Copy code** button.

1. Open **WhatsApp Manager → Message templates**:
   - From the app: left menu **WhatsApp → API Setup**, find the link **Manage message templates** / **WhatsApp Manager**, or
   - Directly: **https://business.facebook.com/latest/whatsapp_manager/message_templates**
2. At the top, make sure the selected business is **Onthec Gym** and the account is the **Messaging account from Part 3**.
3. Click **Create template**.
4. **Category**: **Authentication** → **Next/Continue**.
5. **Template name**: `login_code` (lower-case, underscore — exactly this).
   **Language**: **English (US)**.
6. **Code delivery setup**: choose **Copy code**.
7. **Content**:
   - ✅ **Add security recommendation**
   - ✅ **Add expiry time for the code** → **5** minutes
   - Button text: leave **Copy code**
8. **Message validity period** (if shown): leave the default, or set **10 minutes**.
9. Click **Submit**.
10. The template list shows its **Status**. Wait until it says **Active** (usually minutes; can take up to a few hours).

**Backup option** if the template screen gives trouble (greyed-out Authentication, errors): add a line
`WHATSAPP_BUSINESS_ACCOUNT_ID=<Messaging account ID from Part 3>` to `apps/api/.env` and tell Claude —
the template can be created through Meta's API with the same settings instead.

## Part 5 — Save the values in `.env`

1. Open `apps/api/.env` in VS Code or Notepad.
2. Set these lines (no quotes needed, no spaces around `=`):

   ```
   OTP_PROVIDER=whatsapp
   WHATSAPP_PHONE_NUMBER_ID=<Phone number ID from Part 3, step 4>
   WHATSAPP_ACCESS_TOKEN=<token from Part 3, step 3 — or the permanent one from Part 6>
   WHATSAPP_OTP_TEMPLATE=login_code
   WHATSAPP_TEMPLATE_LANGUAGE=en_US
   ```

3. Save. Make sure `SEED_OWNER_PHONE` is the **same number** you added in the **To** list.
4. Tell Claude it's done — it will start the API and send a real login code to your WhatsApp.

To go back to codes in the terminal log at any time: `OTP_PROVIDER=console`.

## Part 6 — Permanent access token (recommended, ~5 minutes)

The Part 3 token stops working after 24 hours (login codes then fail with "could not send your code").
A **System User** token doesn't expire:

1. Open **https://business.facebook.com/settings** → left menu **Users → System users**.
2. **Add** → name `onthec-api`, role **Admin** → **Create system user**.
3. Select it → **Assign assets**:
   - **Apps** → `Onthec Gym` → under *Full control* turn on **Manage app**.
   - **WhatsApp accounts** → your Messaging account → under *Full control* turn on **Manage WhatsApp Business accounts**.
   - → **Assign assets**.
4. Click **Generate token** → app `Onthec Gym` → expiry **Never** → tick permissions:
   `business_management`, `whatsapp_business_messaging`, `whatsapp_business_management` → **Generate token**.
5. Copy it **now** (it's shown only once) and put it in `WHATSAPP_ACCESS_TOKEN` in `apps/api/.env`.

## Part 7 — Later, before real members use it (not needed for testing)

The free test number only messages the 5 numbers in your list. For real members:

1. **Business verification**: Business Settings → **Security Centre** → **Start verification** (needs business documents such as GST certificate, shop licence or utility bill in the business name).
2. **Add a real business number** (API Setup → **Add phone number**): a number that is **not** currently used on the normal WhatsApp or WhatsApp Business app. Meta reviews the display name ("Onthec Gym").
3. **Add a payment method** (WhatsApp Manager → Settings → Payment methods). Authentication messages are charged per message — see Meta's WhatsApp pricing page for the current India rate.
4. Swap `WHATSAPP_PHONE_NUMBER_ID` to the new number's ID. The `login_code` template carries over within the same Messaging account.

---

## Troubleshooting

When sending fails, the app shows *"We could not send your code on WhatsApp"*, and the API terminal logs
`WhatsApp login code: Meta rejected it` with Meta's reason. Common ones:

| Meta error | Meaning | Fix |
|---|---|---|
| `131030` / "Recipient phone number not in allowed list" | Test number can only message numbers you added | Part 3 step 5: add and verify the number |
| `190` / "Session has expired" / OAuthException | Access token expired (24 h) or copied wrongly | Generate a new token (Part 3) or use a permanent one (Part 6) |
| `132001` / "Template name does not exist in the translation" | Template not approved yet, or name/language mismatch | Check status is **Active**, name is `login_code`, language **English (US)** = `en_US` |
| `100` / "Invalid parameter" / "Unsupported post request" | Wrong Phone number ID (often the phone number was pasted instead) | Copy the **Phone number ID** from API Setup |
| `131056` / pair rate limit | Too many messages to the same number in a short time | Wait a few minutes |
| `131026` / "Message undeliverable" | That number has no WhatsApp, or hasn't accepted the latest WhatsApp terms | Open WhatsApp on that phone and update it |
| Nothing in the log, request hangs | Network/DNS | On Jio Fiber keep DNS on `1.1.1.1` / `8.8.8.8` (see README) |
