# Gym Management App — Detailed Plan

This expands on [CLAUDE.md](../CLAUDE.md). CLAUDE.md holds the rules; this file holds the design decisions, the per-phase scope and the open questions. Anything marked **Decision needed** should be settled before the phase that depends on it starts.

---

## 1. Open decisions

Recommended defaults are in bold. Phase 0 only needs #9 (where to host the web app).

| # | Decision | Options | Recommendation | Needed by |
|---|----------|---------|----------------|-----------|
| 1 | API framework | Express / Fastify | **Fastify** — built-in schema hooks, faster, good TS types; Zod via `fastify-type-provider-zod` | Phase 1 |
| 2 | How a user picks their gym at login | Subdomain per gym / gym code / phone-first then pick gym | **Phone-first**: verify OTP, then list the gyms that phone has an account in (auto-select if one). Keeps `gym_id` out of URLs and works for one PWA install | Phase 2 |
| 3 | OTP delivery | MSG91 SMS / Twilio / WhatsApp OTP / Firebase Auth | **Decided: WhatsApp Cloud API** authentication template (copy-code button). No DLT registration needed; free Meta test number during development; same Meta setup is reused for reminders in Phase 10. SMS (MSG91 + DLT) can be added later as a fallback channel | Phase 2 |
| 4 | Are plan prices GST-inclusive? | Inclusive / exclusive | **Inclusive** (what Indian gyms quote). Server back-calculates base and tax | Phase 3 |
| 5 | Is the gym GST-registered? | Yes (tax invoice) / No (bill of supply) | Support both: `gyms.gstin` nullable; if null, issue a bill of supply with zero tax | Phase 4 |
| 6 | Offline payments (cash / UPI at desk) | Support / Razorpay only | **Support** — admin records a manual payment; most Indian gyms still take cash | Phase 4 |
| 7 | Late-cancel policy for PT | Free cancel up to N hours before; later = session used | **12 hours**, configurable per gym in `gyms.settings` | Phase 5 |
| 8 | WhatsApp provider | Meta Cloud API direct / BSP (Interakt, Gupshup, AiSensy) | **Meta Cloud API** if you can verify a Meta Business account; BSP otherwise. Templates need Meta approval | Phase 10 |
| 9 | Hosting | see §8 | Web: **Cloudflare Pages** (or Vercel / Netlify) — HTTPS is required for Home Screen install. Later: Postgres + API in Mumbai region | Web: Phase 0. API: Phase 1 (public URL by Phase 4 for webhooks) |
| 10 | Branding | — | Name is **Onthec Gym**; placeholder logo and lime-on-dark colours in Phase 0 — swap for the real logo when available | Phase 11 |

---

## 2. Architecture

```
               ┌────────────────────────── apps/web (React PWA) ─────────────────────────┐
  Member  ───▶ │ /m/*  member routes   /t/*  trainer routes   /admin/*  desktop routes   │
  Trainer      │ TanStack Query ── fetch ──▶ API   (access token in memory)              │
  Admin        └──────────────────────────────────────────────┬──────────────────────────┘
                                                              │ HTTPS, refresh cookie
               ┌──────────────────────────── apps/api ────────▼──────────────────────────┐
  Razorpay ──▶ │ routes (thin) → services (logic) → tenant-scoped Prisma client          │
  webhook      │ auth plugin: verify JWT → AsyncLocalStorage { userId, gymId, role }     │
               │ jobs (pg-boss): expiry status, PT auto-confirm, reminders, invoice PDFs │
               └───────┬───────────────────────────┬─────────────────────┬───────────────┘
                       ▼                           ▼                     ▼
                  PostgreSQL                 Cloudflare R2        MSG91 / WhatsApp / Web Push
```

Key choices:

- **Tenant scoping**: a Prisma Client extension (`$extends` query hooks — Prisma middleware is deprecated) reads `gymId` from `AsyncLocalStorage` and injects `where: { gymId }` on reads and `data: { gymId }` on creates for every tenant model. Services only ever get the scoped client. An unscoped client exists only in `src/db/unscoped.ts` for login, webhooks and jobs, and a lint rule blocks importing it elsewhere. Postgres Row-Level Security can be added later as defence in depth.
- **Background jobs**: `pg-boss` (queue stored in Postgres) — no Redis to run. Jobs run inside the API process at first; split into a worker process later if needed.
- **Shared package**: Zod schemas, enums (roles, statuses), money and date helpers (`formatPaise`, `toIST`, `financialYear`), and inferred types used by both web and API.
- **Testing**: Vitest everywhere; API integration tests hit a real Postgres (Docker) with each test file in a transaction or a truncated schema. Playwright for a handful of end-to-end flows from Phase 3 on.

---

## 3. Data model details

Additions and refinements to the list in CLAUDE.md. All tables get `id` (UUID v7 or cuid), `created_at`, `updated_at`. Every tenant table has `gym_id` + index, and multi-column uniques include `gym_id`.

### Identity and auth
- `users` — unique `(gym_id, phone)`; phone stored in E.164 (`+91…`). `role` enum: `member | trainer | admin | owner`. `deleted_at` / `anonymised_at` for the deletion flow.
- `otp_requests` — phone, `code_hash` (never the plain code), expires_at (5 min), attempts, consumed_at. Rate limit: 3 sends / 15 min / phone, 5 verify attempts per code.
- `refresh_tokens` — user_id, `token_hash`, family_id, expires_at, revoked_at, user_agent. Rotate on every refresh; reuse of an old token revokes the whole family.
- `consents` — user_id, gym_id, purpose (`terms`, `privacy`, `whatsapp`, `marketing`), notice_version, granted_at, withdrawn_at.

### Memberships
- `membership_plans` — add `max_freeze_days`, `gst_inclusive` (default from gym), `sort_order`.
- `memberships` — `start_date`, `end_date` as `DATE`. Store `status` but treat dates as truth: a nightly job moves `active → expired`; reads also compute it so a missed job can't show wrong data.
- **Renewal rule**: if the member has an active membership, the new one starts the day after its `end_date` (queued, status `upcoming`); otherwise it starts today (IST).
- **Freeze rule**: a freeze extends `end_date` by the freeze length; total freeze days per membership ≤ `max_freeze_days`; no overlapping freezes; check-in blocked during a freeze.

### Payments and invoices
- `payments` — add `method` (`razorpay | cash | upi_manual | card_manual`), `recorded_by` (for manual), `paid_at`, `refunded_paise`. Status: `created → paid | failed`, `paid → refunded | partially_refunded`.
- `payment_items` — what the payment buys (`membership` / `pt_purchase`, ref id, amount). Fulfilment (creating the membership or PT purchase) happens only when the payment becomes `paid`.
- `webhook_events` — provider, `event_id` **unique**, type, payload JSON, processed_at. The handler inserts first; a unique-violation means "already handled", return 200.
- `invoices` — `invoice_number`, `financial_year` (e.g. `2026-27`), `base_paise`, `cgst_paise`, `sgst_paise`, `igst_paise`, `total_paise`, `sac_code` (999723 for fitness services — confirm with the gym's CA), `buyer_snapshot` JSON, `seller_snapshot` JSON (invoices must not change when the gym edits its address later).
- `invoice_sequences` — `(gym_id, financial_year)` primary key, `next_number`. Incremented with `SELECT … FOR UPDATE` inside the payment transaction so numbers are gap-free and consecutive per FY (GST requirement; ≤16 chars, e.g. `GYM/26-27/00042`).
- **GST maths** (inclusive price P paise, 18%): `base = round(P × 100 / 118)`, `tax = P − base`, `cgst = floor(tax / 2)`, `sgst = tax − cgst`. Intra-state is CGST+SGST; IGST only if the buyer has a GSTIN in another state (rare — support in schema, not UI).

### PT
- `pt_packages` — as in CLAUDE.md.
- `pt_purchases` — balance is **never stored**: `balance = SUM(pt_session_ledger.change)` for that purchase. Purchase writes a `+session_count` ledger row (reason `purchase`).
- `pt_sessions` — add `ends_at`, `completed_at`, `confirmation_status` (`pending | confirmed | auto_confirmed | disputed`), `dispute_reason`, `resolved_by`, `resolution`.
- `pt_session_ledger` — reasons: `purchase`, `session_completed`, `late_cancel`, `no_show`, `dispute_refund`, `adjustment` (no `expired` rows: expiry is worked out from `expires_on`). Unique `(session_id, reason)` so a session can't be deducted twice.
- **Booking rule**: allowed only if `balance − (future booked sessions) ≥ 1` and the purchase hasn't expired by the session date. Run in a transaction with `SELECT … FOR UPDATE` on the purchase row.
- **No double-booking**: Postgres exclusion constraint on `(trainer_id, tstzrange(scheduled_at, ends_at))` where status = `booked` (needs `btree_gist`; added via raw SQL in the migration).
- `trainer_availability` — weekday, start_time, end_time (local IST times), slot_minutes. `trainer_time_off` — trainer_id, from, to, reason.
- **Dispute flow**: trainer marks complete → ledger `−1` + `confirmation_status = pending` → member confirms or disputes within 24h → no action = `auto_confirmed` (pg-boss job scheduled at completion + 24h) → admin resolves disputes; upheld dispute writes `+1 dispute_refund`.

### Check-in
- `attendance` — add `scanned_by` (staff user), `membership_id`. Duplicate check-ins within a configurable window (default 2h) return "already checked in" and don't insert.
- QR token: `base64url(memberId.gymId.timeWindow) + HMAC-SHA256(secret_per_gym)`; window = 30s; scanner accepts current and previous window. The app regenerates every 30s, so screenshots expire. Works offline on the member side (secret-derived key fetched at login — see Phase 5 note).

### Other
- `audit_logs` — gym_id, actor_user_id, action, entity, entity_id, before/after JSON. Written for: manual payments, refunds, membership edits/freezes, ledger adjustments, dispute resolutions, role changes, deletions.
- `notifications_log` — add `dedupe_key` unique (e.g. `expiry-7d:<membership_id>`) so reminder jobs are safe to re-run.
- `leads` — add `notes`, `assigned_to`, `converted_member_id`.

---

## 4. Phases in detail

Each phase ends with: tests pass, lint passes, typecheck passes, commit (and a short demo note in the PR / commit body).

### Phase 0 — Installable PWA shell
- pnpm workspace with `apps/web` only (React + Vite + TypeScript strict).
- One screen: logo + "Welcome to Onthec Gym".
- `vite-plugin-pwa`: web app manifest (name, `display: standalone`, theme colours), service worker that precaches the app shell, auto-update.
- Icons generated from `apps/web/public/logo.svg` by `@vite-pwa/assets-generator`: 64/192/512, maskable 512 (Android), apple-touch-icon 180 (iOS), favicon.
- iOS meta tags: `apple-mobile-web-app-capable`, status bar style, title, apple-touch-icon; safe-area padding for the notch.
- Install help: "Install app" button on Android/desktop Chrome (`beforeinstallprompt`); step-by-step "Share → Add to Home Screen" card on iPhone/iPad; hidden once installed.
- ESLint, Vitest (install-platform detection tests), GitHub Actions CI.
- Deploy to an HTTPS static host so it can be installed from a real phone.

**Done when** CI is green and, from the deployed URL, the app can be added to the Home Screen on an iPhone (Safari) and an Android phone (Chrome), and opens full-screen with the Onthec Gym icon and name.

### Phase 1 — Backend setup
- Add `apps/api` (Fastify) and `packages/shared` to the workspace; shared `tsconfig.base.json` and root ESLint config for Node packages.
- Database: **Neon** (free cloud Postgres) — `neondb` for development, `onthec_test` for tests. No Docker on the dev machine; CI uses a Postgres 17 service container.
- Env loading validated by Zod at startup (`apps/api/src/env.ts`); `apps/api/.env.example` committed.
- Prisma schema in `apps/api/prisma/` with the `gyms` table; idempotent seed creates Onthec Gym.
- Standard error shape and error codes (`packages/shared/src/errors.ts`); CORS limited to the web origins.
- Health endpoint `GET /api/v1/health` (checks the DB).
- API production build bundled with tsup (`apps/api/dist/server.js`).
- Root scripts: `db:migrate`, `db:deploy`, `db:seed`, `db:reset`, `db:studio`; `dev` runs web + api.
- Deferred to Phase 2: Prettier, the `db/unscoped` import lint rule (arrives with the tenant-scoped client), API hosting.

**Done when** `pnpm install && pnpm db:deploy && pnpm db:seed && pnpm dev` works against Neon on a fresh clone and CI is green.

### Phase 2 — Auth and tenancy

Approved decisions: phone-first login then pick a gym; no self sign-up (only people the gym added can log in); login codes by WhatsApp (`OTP_PROVIDER=whatsapp`; `console` + `.env` test numbers for local work); API on Render (Singapore) behind the Cloudflare Worker at `/api/*` so the refresh cookie is first-party (Safari).

**2a — API auth and tenancy (done)**
- Tables: `users` (unique gym+phone), `otp_challenges` (HMAC'd codes, not tenant-owned), `refresh_tokens` (rotating, per-login family), `consents`.
- Endpoints under `/api/v1`: `auth/otp/request`, `auth/otp/verify` (session, or `select_gym` + 5-min selection token), `auth/select-gym`, `auth/refresh`, `auth/logout`, `me`, `me/consent`, `users`, `users/:id` (admin/owner).
- OTP: 6 digits, 5 min, 3 sends / 15 min / phone, 5 attempts per code (counted atomically); unregistered numbers get `ACCOUNT_NOT_FOUND` and no SMS. Per-IP limits on all auth routes.
- Tokens: HS256 access JWT, 15 min; refresh token in `httpOnly; SameSite=Lax; Path=/api/v1/auth` cookie (Secure in production), 30 days, rotated on every use; reusing a rotated token revokes the whole family.
- Tenancy: `forTenant(db, gymId)` Prisma extension (`src/db/tenant.ts`) adds the gym filter to every read/update/delete on tenant models, stamps `gymId` on creates and throws `TenantViolationError` for another gym's id. Protected routes only get `request.auth.db`. ESLint blocks importing `db/unscoped` outside bootstrap, health and auth code. A test fails if a model with `gymId` is missing from `TENANT_MODELS`.
- Seed: Onthec Gym + owner from `SEED_OWNER_PHONE` / `SEED_OWNER_NAME`.
- WhatsApp sender (`src/services/auth/whatsapp.ts`): Cloud API `messages` call with the `login_code` authentication template (code in body + copy-code button). Meta errors become `OTP_DELIVERY_FAILED` (502) and are logged with the masked number; a failed send is deleted so it doesn't count towards the 3-per-15-min limit.
- For production: Meta business verification, a dedicated WhatsApp business number, and a System User access token (temporary tokens last 24 h).
- Tests: OTP flow and limits, multi-gym selection, refresh rotation + reuse, logout, roles, and the isolation template every later endpoint copies (gym A gets 404 — identical to "missing" — on gym B ids; lists never include gym B rows).

**2b — Login screens (done)**
- React Router, TanStack Query, Tailwind v4 (brand tokens in `apps/web/src/index.css`).
- Screens: welcome (Log in + install help) → phone → 6-digit code (auto-submits; `autocomplete="one-time-code"`; resend after 30 s; says "WhatsApp" or "development mode" from the API's `channel`) → gym picker if needed → consent (DRAFT notice text — review before launch) → home placeholder with role, gym and logout.
- API client (`apps/web/src/api/client.ts`): access token in memory only; on 401 it refreshes once via the cookie and retries; concurrent requests share one refresh (a second use of the same refresh token would end the login). Non-JSON/unreachable API → readable "server not available" message.
- Session restored on reload via `/auth/refresh`. `RequireAuth` guards signed-in pages and forces consent first.
- Dev: Vite proxies `/api` to the local API (same origin, first-party cookie); the service worker never serves `/api`.
- Tests: client refresh logic; full login, wrong code, unregistered number, gym choice, consent, reload and logout with a fake API.

**2c — Deploy the API (done — live at https://onthec-api.onrender.com, used via https://gym-app.snitin322.workers.dev/api)**
- `render.yaml` Blueprint: free web service `onthec-api` in Singapore, migrations on start, health check, Render-generated `JWT_SECRET`/`OTP_SECRET`, DB and WhatsApp values entered in the dashboard.
- Cloudflare Worker (`apps/web/worker/index.ts`, `run_worker_first: ["/api/*"]`) forwards `/api/*` to `API_ORIGIN` with the real client IP; everything else is static assets. Unreachable API → standard error JSON (502).
- Steps and day-to-day notes: `docs/DEPLOY.md`.
- Known gap: the Render URL is publicly reachable, so a caller could bypass the Worker and spoof `X-Forwarded-For` to dodge per-IP limits (per-phone OTP limits still apply). Add a shared proxy secret header before launch.

### Phase 3 — Members and plans

Approved decisions: plans in **months only** (no trials); prices **GST-inclusive**; memberships recorded **without payment** until Phase 4; **freezing per plan** with suggested limits 1 month → 0, 3 → 15, 6 → 30, 12 → 45 days (editable); no member deletion yet (DPDP flow later).

**3a — API (done)**
- Tables: `membership_plans` (unique name per gym, deactivate not delete), `members` (profile 1:1 with a member user), `memberships` (plan name/months/price/freeze limit copied at sale; dates only), `membership_freezes`. DB check constraints: positive price/duration, end ≥ start.
- Date rules (`packages/shared/src/dates.ts`, `memberships.ts`): "today" is India time; end = day before the same date N months later, or month-end if that date doesn't exist (31 Jan + 1 → 28 Feb); valid through the end date; days left counts today. Status (upcoming/active/frozen/expired/cancelled) is derived, never stored — no nightly job.
- Renewal: starts the day after the latest running/queued membership, else today; overlaps refused.
- Freeze: inclusive dates within the membership, total ≤ plan limit, no overlaps; extends the end date and shifts any queued renewal. Unfreeze ends the current freeze yesterday (or removes a future/same-day one) and gives the days back.
- Member list status: active / frozen / expiring (≤ 7 days, no renewal queued) / upcoming / expired / none; filters all · active · expiring · expired · none; search by name or phone digits.
- Endpoints (owner/admin): `GET/POST /plans`, `PATCH /plans/:id`; `GET/POST /members`, `GET/PATCH /members/:id`, `POST /members/:id/memberships`; `POST /memberships/:id/freeze|unfreeze|cancel`; `POST /users` (owner adds admin/trainer, admin adds trainer). Any user: `GET /me/membership`.
- Mutations run in serializable transactions (concurrent desk edits → 409 CONFLICT, "try again").
- Tests: date maths, status, freeze limits/shift/unfreeze, renewal start, filters, staff roles, and gym A/B isolation on every new endpoint.

**3b — Admin screens (done)**
- Owner/admin home shows **Members** and **Plans**; `/admin/*` routes are guarded by role (`RequireRole`).
- Plans: list (active first), add/edit with price in rupees (stored as paise), length 1–24 months, max freeze days pre-filled from the gym's table until edited, activate/deactivate.
- Members: search (name or phone), filter chips (All · Active · Expiring · Expired · No plan) kept in the URL, rows show plan + "N days left" + status badge.
- Add member: name, phone, optional plan + start date (shows the end date), joined date, emergency contact, notes; opens the member page.
- Member page: current membership with big "days left", price, freeze usage and freeze history; actions Renew (default start = day after current ends), Freeze (shows days and new end date, enforces remaining), Unfreeze, Cancel (confirm step), Edit details (empty field clears it); all memberships listed.
- Tests: role guard, plan form (paise + suggested freeze), list filter, add member, freeze, cancel confirmation; label helpers.

**3c — Member home card (done)**
- Members' home shows their membership: plan, status badge, big "N days left" / "Last day today" / "Frozen until …" / "Starts …" / "Expired N days ago", date range, progress bar ("day X of Y").
- Freeze note (current or planned pause), renew reminder in the last 7 days unless a renewal is queued, "Next: … from …" for a queued renewal, renew prompt when expired, "contact the front desk" when there is no plan, collapsible past memberships.
- Data from `GET /me/membership`; refreshes when the app is reopened.

**3d — Wrap-up (done)**
- Staff screen (`/admin/staff`, home link): lists owner, admins, trainers (`GET /users?kind=staff`); owner adds admins or trainers, admins add trainers.
- Plan edit: emptying the description now removes it.

Phase 3 is complete.

### Phase 4 — Payments and invoices

Approved decisions: GST status not decided yet — build both (GSTIN set → tax invoice; empty → bill of supply/receipt); pay later allowed (dues); desk discounts with a reason (online = plan price); Phase 3 memberships count as paid outside the app; refunds and credit notes deferred; Razorpay in test mode first.

**4a — Desk payments and dues (done)**
- Gym details (owner only, `GET/PATCH /gym`, admins can read): legal name, address, city, PIN, state (GST code), GSTIN with check-digit validation and state match (state filled from the GSTIN), SAC (default 999723), invoice prefix (1–5 chars → `PREFIX/26-27/0001` ≤ 16), contact phone, email.
- `payments` table (paise, method cash/upi/card/bank_transfer/razorpay, status, reference, note, paid_at, recorded_by, Razorpay ids); memberships gain `list_price_paise`, `discount_reason`, `paid_outside_app` (migration backfills existing rows as paid outside the app). DB checks: amount > 0, paid ⇒ paid_at, price ≤ list price.
- Selling (add member / renew): price defaults to the plan price; lower = discount (reason required), never higher; payment Cash/UPI/Card/Bank transfer (+ reference) for the full price, or Pay later.
- Due = price − paid (0 if cancelled or paid outside the app). `POST /memberships/:id/payments` records full or part payments; overpaying refused.
- Screens: sale fields with payment chips, "₹X due" on member page/rows, Record payment panel, payments list, Dues filter, member home shows due + "My payments".
- Tests: desk payment, pay later + dues filter, discounts (reason, cap), free membership, part payments/overpayment/nothing due, cancelled/legacy, member view, gym details validation and roles, gym isolation.

**4b — GST invoices (done)**
- Every paid payment gets an invoice in the same transaction (`issueInvoiceInTx`): gap-free number per gym and Indian financial year from `invoice_sequences` (`PREFIX/26-27/0001`, ≤ 16 chars); payment-creating transactions are serializable, so a race returns 409 "try again" instead of leaving a hole.
- GSTIN set → **tax invoice**: GST-inclusive amount split into taxable value + CGST 9% + SGST 9% in whole paise (adds up exactly; DB check); SAC printed; place of supply = gym's state. No GSTIN → **receipt** with no tax lines.
- Seller/buyer details and description are copied at issue time; invoices are never edited or deleted. One invoice per payment (part payments say "(part payment)").
- PDF (`GET /invoices/:id/pdf`, pdfkit, A4): owners/admins any invoice of their gym; members (and trainers) only their own. Amounts print as "Rs." (built-in font has no ₹), with amount in words (Indian numbering).
- Older payments without an invoice: "Create invoice" (`POST /payments/:id/invoice`, idempotent).
- Tests: GST split across many amounts, FY switch at 1 April IST, numbering (per gym, part payments, concurrent sales stay 1..n), snapshot immutability, PDF access rules, legacy invoicing.

**4c — Razorpay online renewal (done)**
- Member home: **Renew online** (only when Razorpay keys are configured) → choose an active plan (shows start/end and GST-inclusive price) → `POST /me/orders` creates a `created` payment (amount = plan price, decided by the server) and the Razorpay order (receipt = payment id) → Checkout → `POST /me/orders/verify` checks the Checkout signature (HMAC of `order|payment` with the key secret) but does **not** mark paid → app polls `GET /me/payments/:id` until confirmed (≈60 s, then "payment received, it will update shortly").
- **Webhook is the source of truth** (`POST /api/v1/webhooks/razorpay`, raw body, `X-Razorpay-Signature` HMAC with the webhook secret): `payment.captured`/`order.paid` → in one serializable transaction create the membership (renewal start rule; honoured even if the plan was deactivated after payment), mark the payment paid and issue the invoice; amount/currency mismatch → not fulfilled (logged); `payment.failed` → failed (a later successful attempt on the same order still fulfils). Idempotent: `webhook_events` (provider + event id) and "already paid" checks; concurrent duplicate deliveries fulfil once.
- Webhook code may use the unscoped client only to find the payment's gym, then switches to the tenant client (ESLint allow-list updated).
- Settings: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (all or none; startup refuses Key Id pasted as the secret). Setup: `docs/RAZORPAY_SETUP.md`.
- Tests: server-side amount, signatures (Checkout + webhook), forged/other-member access, webhook fulfilment + invoice, repeats/both event types/concurrent deliveries, bad signature/wrong amount/unknown order, fail-then-succeed, renewal start, deactivated plan; app flow with a fake Checkout.

Phase 4 is complete (refunds/credit notes deferred).

### Phase 5 — PT packages and booking

Approved decisions: one-to-one sessions; 60-minute sessions (adjustable per trainer); free cancellation until 12 h before, later cancellation or no-show uses the session (gym setting); booking up to 14 days ahead with at least 2 h notice; unused sessions expire, admins can extend validity; PT sold at the desk only for now (online later); trainer commission out of scope.

**5a — PT packages, selling and the session ledger (done)**
- `pt_packages` (name unique per gym, 1–200 sessions, valid 1–730 days, GST-inclusive price). Screen: **PT packages** (owner/admin) to add, edit, deactivate.
- Selling from the member page (**Sell PT package**): package, trainer (only this gym's trainers), price/discount with reason, desk payment or pay later — same rules as memberships. `pt_purchases` keeps snapshots (name, sessions, price); valid from the sale day for `validity_days` days including that day.
- **Balance is never stored**: it is the sum of `pt_session_ledger` rows. A sale writes `+N` (purchase). Admin **Adjust sessions** writes ± with a reason and can never take the balance below zero. **Extend** only moves the use-by date later. Expired = today is after `expires_on` (no job needed).
- Payments: `payments.pt_purchase_id` (a payment is for a membership or a PT package, never both — DB check); part payments and dues work as for memberships and count in the Dues filter; every payment gets a GST invoice ("12 Sessions: 12 personal training sessions with Ravi, valid till …").
- Member home: PT card ("9 of 12 sessions left · with Ravi · use by 18 May", session history). Trainer home: **My clients** with sessions left and use-by dates (`GET /trainer/clients`).
- Tests: ledger sum = balance, negative guard, extend rules, expiry, discounts, pay later/part payments, trainer must be this gym's trainer, member/trainer views, gym isolation; screens for packages, selling, adjusting, payments, extend, member and trainer cards.

**5b — Availability and booking (done; plan approved 27 Oct 2026)**

Approved decisions: members, the desk and the trainer (for their own clients) can book; slots run back to back at the trainer's session length (6:00, 7:00…); adding time off over existing bookings lists them and cancels them free; changing weekly hours never touches existing bookings.

- Data:
  - `trainers` profile (CLAUDE.md table): session length (default 60 min), specialisation.
  - `trainer_availability`: weekday + start/end time in India time (several ranges per day allowed).
  - `trainer_time_off`: from/to + reason.
  - `pt_sessions`: purchase, trainer, member, `starts_at`/`ends_at` (UTC), status (`booked`, `cancelled`; `completed`/`no_show` in 5c), booked by, cancelled by/at/reason, late flag.
  - Gym settings (owner edits in Gym details): free-cancel window 12 h, booking horizon 14 days, minimum notice 2 h.
  - DB exclusion constraint (needs `btree_gist`): no overlapping `booked` sessions per trainer.
- Rules (server-side):
  - Slots = trainer's hours on each of the next 14 days, cut into session-length blocks, minus time off, minus booked sessions, minus anything within the minimum notice; never after the package's use-by date.
  - Booking: the package's own trainer only; session date ≤ `expires_on`; sessions left − future booked ≥ 1; member has nothing else at that time. Serializable transaction (no raw SQL on tenant tables); a lost race returns 409 "That slot was just taken".
  - Cancel: by the member ≥ 12 h before → free; later → one `late_cancel` ledger line (−1, once only). By trainer/desk → never deducts.
  - Reschedule = cancel + rebook in one transaction; free until 12 h before, after that only a late cancel is possible.
- Screens:
  - Trainer: **My availability** (weekly hours, session length, time off) and **My schedule** (upcoming sessions by day with client name/phone).
  - Member: **Book a session** from the PT card (day → time → confirm); **Upcoming sessions** with Reschedule/Cancel and a warning before a late cancel.
  - Desk: book/cancel for a member from the member page; view/edit a trainer's hours from Staff.
  - Owner: the three PT rules in Gym details.
- Tests: slot generation (time off, bookings, session length, notice, horizon, use-by date); booking refused when balance − booked < 1; concurrent booking of the last session/slot (one wins); trainer double-booking blocked by the DB; late cancel deducts exactly once, free/staff cancel never; reschedule; another member's package refused; gym isolation; screens.
- Delivery: **5b-1** schema, rules, API and tests (done) → **5b-2** screens (done). Session reminders wait for Phase 10.
- 5b-1 API: `GET/PUT /trainers/:id/availability`, `POST/DELETE /trainers/:id/time-off`, `GET /trainers/:id/sessions`, `GET /pt-purchases/:id/slots`, `POST /pt-purchases/:id/sessions`, `POST /pt-sessions/:id/cancel`, `POST /pt-sessions/:id/reschedule`, `GET /me/pt-sessions`, `GET /members/:id/pt-sessions`, `GET/PATCH /pt-rules` (owner edits). Slot rules live in `packages/shared/src/pt-booking.ts` so the app and API agree. DB exclusion constraints (btree_gist) stop overlapping booked sessions per trainer and per member.
- 5b-2 screens: trainer **My availability** (`/trainer/availability`: weekly hours per weekday as 15-minute choices shown like "6:00 am", session length, time off with the list of sessions it cancelled) and **My schedule** on trainer home (next 14 days by day, client name/phone, cancel/reschedule); member **Book a session** on the PT card (day → time → confirm, "N sessions left · M booked", disabled with a reason when nothing is left to book or the package expired) and **Upcoming sessions** (free-cancel time shown; after it a warning that cancelling uses the session and no reschedule); desk **Book session** and upcoming sessions on the member page, **Hours →** per trainer on Staff (`/admin/trainers/:id/availability`); owner **PT booking rules** in Gym details. Web tests in `apps/web/src/pages/booking.test.tsx`.

**5c — Completing sessions and disputes (done; plan approved 28 Oct 2026)**

Approved decisions: trainer notes are visible to the member and the desk; no-shows can be disputed like completed sessions; a trainer can undo their own mark within 1 hour (after that, dispute or adjustment); unmarked sessions stay booked (reserved) until someone marks them — never charged automatically.

- Marking: from the session's start time, its trainer (or the desk) marks **Completed** or **No-show** with an optional note → one `−1` ledger line (`session_completed` / `no_show`); the session must still be booked, checked in a serializable transaction, so a double tap charges once. Undo by the same trainer within 1 hour (or by the desk while unconfirmed and undisputed) puts the session back to booked and writes a balancing `+1 adjustment` line.
- Member check: for 24 h after marking the member can **Confirm** or **Dispute** (reason required). No reply = **auto-confirmed**, worked out from the time (no background job). Disputes after 24 h are refused.
- Desk: **PT disputes** list (count on admin home). Resolve once with a note: **Give session back** (upheld → `+1 dispute_refund`) or **Keep as used** (rejected). Also a **Not marked yet** list (started sessions still booked) for the trainer and the desk.
- Data: `pt_sessions` gains `marked_at`, `marked_by_id`, `confirmed_at`, `disputed_at`, `dispute_reason`, `resolved_at`, `resolved_by_id`, `resolution` (`upheld`/`rejected`), `resolution_note`. Confirmation status in the API (`pending`, `confirmed`, `auto_confirmed`, `disputed`, `upheld`, `rejected`) is derived.
- **Tests**: only the session's trainer or the desk can mark, only after the start; double mark charges once; no-show charges; undo window; confirm; dispute window and auto-confirm; upheld restores exactly once, rejected changes nothing; other members/trainers/gyms are refused; screens.
- Delivery: **5c-1** schema, API and tests (done) → **5c-2** screens (done).
- 5c-2 screens: the session card (`ui/PtSessionCard.tsx`) handles every state — trainer/desk **Mark session** (Completed / No-show + note) once it has started, **Undo mark** (trainer within the hour, desk until the member answers), member **Confirm** / **Not right?** (reason) with the 24-hour deadline, status badges, the trainer’s note, the member’s reason and the desk’s answer, and desk **Resolve dispute** (Give session back / Keep as used + note). Trainer home: **Not marked yet** above My schedule (which keeps just-marked sessions for an hour so they can be undone). Member home: Please confirm / Upcoming / Recent sessions. Desk: **PT disputes** (`/admin/pt-disputes`, count on home) with open disputes and every trainer’s unmarked sessions; member page shows recent sessions with their status.

Phase 5 is complete.
- 5c-1 API: `POST /pt-sessions/:id/mark` (`outcome` completed/no_show, `note`), `/undo-mark`, `/confirm`, `/dispute` (`reason`), `/resolve` (owner/admin: `resolution` upheld/rejected, `note`); `GET /pt-disputes` (open, owner/admin); `GET /pt-sessions/unmarked` (trainer: own; desk: all). `PtSessionView` gained `confirmation`, `disputeUntil`, `undoUntil`, notes and dispute fields. The 5b unique index on ledger (session, reason) was replaced by the booked-status check, because an undone mark can be marked again.

### Phase 6 — Workout plans (done; plan approved 28 Oct 2026)

Approved decisions: each member gets their own copy of a template; one line per set (pyramids allowed); every save keeps the previous version; the exercise library starts with ~50 common exercises (editable); trainers edit only their PT clients' plans; members without a plan see "Ask the front desk or your trainer for a plan" (no automatic default); exercise media is a video link only (uploads later with R2). QR check-in moved to Phase 7 (then Phase 8 after workout tracking was added).

- **Exercise library** (per gym): name, muscle group, type (strength/cardio), description, optional video link; seeded with common exercises, editable; deactivate instead of delete.
- **Weekly plan**: Monday–Sunday; each day has a title (e.g. "Chest + Triceps") or is a rest day, and an ordered list of items. Strength: one line per set (reps or seconds, weight in kg in 0.25 steps), rest between sets, rest before the next exercise, note. Cardio: minutes, optional distance, note.
- **Templates** (owner/admin) and **member plans** (a copy; editing never affects other members). Every save stores the previous version with who changed it and when.
- **Access**: owner/admin any plan and all templates; trainer their PT clients' plans (active PT package with them); member read-only.
- **Member home**: "Today's workout" (India date) and the full week.
- Data: `workout_exercises`, `workout_plans` (template or member plan; the week is one Zod-validated JSON document), `workout_plan_versions`.
- **Tests**: edit rights (trainer only for own PT clients, members read-only), template copy is independent, versions kept, today's workout by India date, validation limits, isolation; screens.
- Delivery: **6a** exercise library, templates and plan editor (desk), backend and tests (done) → **6b** assigning to members, trainer access, member "Today's workout" (done).
- 6a: `GET/POST /workout-exercises` (`?all=1` includes inactive), `PATCH /workout-exercises/:id`, `POST /workout-exercises/starter` (adds the ~50 common exercises the gym lacks; the dev seed adds them too); `GET/POST /workout-templates`, `GET/PUT/DELETE /workout-templates/:id` (PUT sends the `version` it started from; a stale save gets 409 `PLAN_CHANGED`), `GET /workout-templates/:id/versions`. Trainers can read the library and templates; only owner/admin change them. Screens: **Workouts** tile → templates list, **Exercise library** (search, add/edit/deactivate, "Add common exercises"), template editor (`ui/WorkoutPlanEditor.tsx`, reused in 6b) with day tabs, sets (reps or timed, kg), rests, cardio, rest days, earlier versions and delete.
- 6b: `GET/POST/PUT /members/:id/workout-plan` (POST `{templateId?}` gives a copy or a blank week; if the member already has a plan it becomes the next version), `GET /members/:id/workout-plan/versions`, `GET /me/workout-plan` (`{ plan }`). Access: owner/admin any member; trainer only a member with an active PT package with them (not expired, sessions left); members only their own read-only plan. Screens: **Workout plan** section on the member page and `/trainer/clients/:memberId/workout` ("Workout plan →" in My clients) — give plan from a template or blank, edit, show week, earlier versions, start again from a template; member home **Today's workout** (India date) with "See the whole week", or "Ask the front desk or your trainer for a plan".

Phase 6 is complete.

### Phase 7 — Workout tracking (done; plan approved 28 Oct 2026)

Approved decisions: no phone use during exercises — members tick the day afterwards; today and the past 7 days can be ticked or edited (older days lock, future days can't be ticked); rest days show "Rest" and can't be ticked; an exercise not in the plan can be added from the library; logs are visible to the member, their PT trainer and owner/admin; members without a plan don't see the calendar.

- **Weekly calendar** (member home): Mon–Sun of the current week with ‹ › for earlier weeks; each day shows its plan title and Done / Rest / To do / Missed / upcoming.
- **A day**: the plan's exercises for that weekday pre-filled (sets, reps or seconds, weight; cardio minutes and distance). **Mark done** saves as planned; **Update what I did** lets them change sets, reps and weights, mark an exercise skipped, add one from the library, add a note.
- **History**: one `workout_logs` row per member per date with the plan and version it came from and a copy of what was done, so later plan changes never alter it. "Last time" under each exercise (previous log with it, not skipped).
- **Trainer / desk**: the same calendar read-only, for PT clients (trainer) or any member (owner/admin).
- **Tests**: pre-fill per weekday, mark done vs edits, history fixed after plan changes, date window, rest days, access, isolation; screens.
- Built: `GET /me/workout-week?start=` (Monday–Sunday with planned items, log, status, `canLog`, last time), `PUT /me/workout-days/:date` (`{ items, note }`; only the member, today and the past 7 days, not a rest day, needs a plan), `GET /members/:id/workout-week` (PT trainer / desk, read-only). Members can now read the active exercise library (to add one when updating a day). Screens: **My week** under Today's workout (`ui/WorkoutCalendar.tsx`), and **Workout tracking** inside the member's plan section for the desk and trainer.

### Phase 8 — QR check-in
- Member: full-screen QR pass that rotates every 30s with a countdown; brightness hint.
- Front desk: scanner screen (`@zxing/browser` or `html5-qrcode`, camera on a tablet/phone) → big green/red result with member photo, name, plan, days left; manual check-in by search.
- Rules: deny if expired/frozen/no membership (red, with reason); dedupe window.
- Member: attendance history + simple monthly count.
- *Offline note*: the member pass needs a signing key on the device to work offline; simplest safe option for MVP is **online-only generation** (pass fetched every 30s). Revisit if gym Wi-Fi is poor.
- **Tests**: token expiry, tampering, cross-gym token rejected, dedupe, frozen membership denied.

### Phase 9 — Admin dashboard
- Cards: active members, expiring this week, expired last 30 days (renewal targets), revenue today / this month (by method), pending dues, PT sessions this week, today's check-ins.
- Leads: list, create, status pipeline (`new → contacted → trial → converted / lost`), follow-up date, convert-to-member.
- All aggregates computed in SQL with IST date boundaries; indexes reviewed with `EXPLAIN`.
- **Tests**: aggregates on a fixed seed, IST boundary cases, isolation (dashboard numbers never include other gyms).

### Phase 10 — Notifications
- Web push: subscribe/unsubscribe, VAPID keys in env, service worker handler, remove dead subscriptions on 404/410.
- WhatsApp: approved templates — `membership_expiry_7d`, `_3d`, `_0d`, `pt_session_reminder` (2h before), `payment_receipt` (with invoice link). Only send if WhatsApp consent recorded.
- Daily scheduler at 09:00 IST; `notifications_log.dedupe_key` prevents double sends; quiet hours.
- Member settings: toggle channels.
- *iOS note*: web push on iPhone only works when the PWA is installed to the Home Screen (iOS 16.4+) — WhatsApp is the reliable channel there.
- **Tests**: scheduler picks the right members on each day offset, dedupe, consent respected, provider failures logged and retried.

### Phase 11 — PWA polish and production
- Real logo/branding, iOS splash screens, offline handling for data screens (cached last-known membership, "you're offline" banner), "update available" prompt.
- 360px audit of every member/trainer screen; Lighthouse PWA + accessibility pass.
- Production: env/secrets, migrations on deploy, daily DB backups with a tested restore, Sentry (web + API), uptime check, Razorpay live keys + live webhook URL.
- Account deletion flow (DPDP): request → admin notified → after confirmation, anonymise name/phone/photos/measurements; keep payments and invoices (GST record retention) linked to the anonymised user.

---

## 5. API conventions

- Base path `/api/v1`. JSON only. Dates as `YYYY-MM-DD`, timestamps as ISO-8601 UTC.
- Errors: `{ "error": { "code": "MEMBERSHIP_NOT_FOUND", "message": "…" } }`; codes listed in `packages/shared/src/errors.ts`.
- Pagination: cursor-based `?cursor=…&limit=…` → `{ items, nextCursor }`.
- Cross-tenant or missing records → 404 (don't reveal existence).
- Idempotency-Key header accepted on `POST /payments/orders` and manual payment creation.

## 6. Security checklist

- Rate limiting on OTP and auth routes (`@fastify/rate-limit`), helmet headers, strict CORS to the web origin.
- Refresh cookie `SameSite=Lax` + CSRF check (Origin header) on `/auth/refresh`.
- R2 objects private; signed URLs ≤ 5 min; progress photo access checks member-or-assigned-trainer.
- No PII in logs or Sentry breadcrumbs (phone numbers masked).
- Secrets only from env; `.env` gitignored; separate Razorpay test/live keys.

## 7. Testing strategy

| Area | Kind | Must cover |
|------|------|-----------|
| Tenant isolation | API integration | every endpoint, read + write |
| Payments / webhooks | API integration | idempotency, signatures, ordering, refunds |
| GST / invoice numbering | unit + integration | rounding table, FY rollover, concurrency |
| PT ledger | integration | balance invariants, concurrency, disputes |
| Membership dates | unit | renewal, freeze, expiry, IST boundaries |
| Critical flows | Playwright e2e | login, buy plan (Razorpay test mode), book PT, check-in |

## 8. Hosting (recommended starting point)

- **Database**: managed Postgres in Mumbai (`ap-south-1`) — e.g. Neon, Supabase or AWS RDS. Keeps latency low and data in India.
- **API**: a container on Railway / Render / Fly.io (Mumbai or Singapore region), or a small VPS (Lightsail / DigitalOcean Bangalore) if you prefer one fixed bill.
- **Web**: Cloudflare Pages (free, global CDN), same parent domain as the API so cookies work (`app.example.in` + `api.example.in`).
- **Storage**: Cloudflare R2. **Errors**: Sentry free tier.

## 9. Rough size

| Phase | Size | Notes |
|-------|------|-------|
| 0 PWA shell | S | needs a static HTTPS host |
| 1 Backend setup | S | |
| 2 Auth + tenancy | M | DLT registration for SMS runs in parallel |
| 3 Members + plans | M | |
| 4 Payments + invoices | L | Razorpay account + KYC needed for live mode |
| 5 PT booking | L | most business rules live here |
| 6 Workout plans | M | |
| 7 Workout tracking | S–M | |
| 8 QR check-in | S–M | |
| 9 Dashboard | M | |
| 10 Notifications | M | Meta template approval runs in parallel |
| 11 PWA polish + production | M | |

## 10. Things to start outside the code now

These have lead times and don't depend on the code:
1. **Meta Business verification + WhatsApp business number** (login codes and reminders). DLT/SMS registration is only needed if SMS is added later as a fallback.
2. **Razorpay account + KYC** for the gym's business.
3. **Meta Business verification** for WhatsApp Cloud API.
4. Confirm with the gym's CA: GST registration status, SAC code, invoice format.
5. Domain name.
6. Privacy notice + terms text (DPDP consent needs a notice to point to).
