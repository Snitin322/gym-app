# Progress photos: setting up Cloudflare R2

Weekly check-ins can include front, left and right photos. They're stored in a **private** Cloudflare R2 bucket. Nothing in it is public: the app only hands out links that stop working after 15 minutes, and only to the member, their coach and the owner.

Until R2 is set up, the live app still takes check-ins (weight, measurements, note), but **skips the photo step**.

**Cost:** R2's free tier includes 10 GB of storage a month. Photos are shrunk on the phone to about 250 KB each, so 50 clients × 3 photos a week is about 2 GB a year. That stays free for years.

You'll use the Cloudflare account that already hosts the app (gym-app.snitin322.workers.dev).

---

## 1. Turn on R2

1. Open the [Cloudflare dashboard](https://dash.cloudflare.com) and pick your account.
2. In the left menu, open **R2 Object Storage**.
3. If asked, follow the steps to turn R2 on. Cloudflare may ask for a payment method even for the free tier. You aren't charged unless you go over the free limits.

## 2. Create the bucket

1. **R2 Object Storage → Create bucket**.
2. **Bucket name:** `onthec-photos`
3. **Location:** Automatic is fine. If you can choose, pick **Asia-Pacific (APAC)**: the app's database and API are in Singapore.
4. **Default storage class:** Standard.
5. **Create bucket**.
6. Leave **Public access** off. Don't add a public development URL or a custom domain. The bucket must stay private.

## 3. Find your Account ID

On the R2 overview page, look for **Account ID**. It's also inside the S3 API address, `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Copy it.

## 4. Create an access key for the app

1. **R2 Object Storage → Manage API tokens** (sometimes shown as **API → Manage API tokens** on the R2 page).
2. **Create API token** (an *Account API token* is best: it keeps working if your user changes).
3. **Token name:** `onthec-api photos`
4. **Permissions:** **Object Read & Write**.
5. **Specify bucket(s):** Apply to specific buckets only → `onthec-photos`.
6. **TTL:** Forever.
7. **Create API Token**.
8. Copy the **Access Key ID** and **Secret Access Key** now. Cloudflare shows the secret only once.

**Don't paste these values in a chat, an email or GitHub.** They only go in the two places below.

## 5. Give the app the four values

**Render** (the live API):

1. [Render dashboard](https://dashboard.render.com) → **onthec-api** → **Environment**.
2. Add these four variables:

| Key | Value |
| --- | --- |
| `R2_ACCOUNT_ID` | the Account ID from step 3 |
| `R2_ACCESS_KEY_ID` | the Access Key ID from step 4 |
| `R2_SECRET_ACCESS_KEY` | the Secret Access Key from step 4 |
| `R2_BUCKET` | `onthec-photos` |

3. **Save changes.** Render redeploys the API, which takes a few minutes.

**Your computer** (optional, only to test real R2 locally): add the same four lines to `apps/api/.env`. Without them, local development keeps photos in memory, and they're lost when the API restarts.

The app needs all four values or none. If only some are set, the API refuses to start and its log names the missing one.

## 6. Check it works

1. Log in as a member who has a coach → **Check-in** tab.
2. Step 2 now asks for **Front, Left side and Right side** photos. Add one and send the check-in.
3. Log in as the coach → **Clients** → that member → **Progress**. The photo shows. Tap it to see it large.
4. Back in Cloudflare → R2 → `onthec-photos`, you'll see a folder per gym with the check-in photos.

If photos don't show, open Render → **onthec-api** → **Logs** and look for `R2 upload failed`. The most common causes are a missing or mistyped key, or a token that isn't allowed to write to `onthec-photos`.

## Good to know

- **CORS isn't needed.** Photos are uploaded through the app's own API, and shown with signed links.
- **Changing the key later:** create a new token, update the two key variables on Render, then delete the old token in Cloudflare.
- **Deleting a member's photos:** this will be part of the account-deletion flow (DPDP). Until then, photos stay in the bucket.
