# Gym Management App — Detailed Plan

This expands on [CLAUDE.md](../CLAUDE.md). CLAUDE.md holds the rules; this file holds the design decisions, the per-phase scope and the open questions. Anything marked **Decision needed** should be settled before the phase that depends on it starts.

---

## 1. Open decisions

Recommended defaults are in bold. Phase 0 only needs #9 (where to host the web app).

| # | Decision | Options | Recommendation | Needed by |
|---|----------|---------|----------------|-----------|
| 1 | API framework | Express / Fastify | **Fastify** — built-in schema hooks, faster, good TS types; Zod via `fastify-type-provider-zod` | Phase 1 |
| 2 | How a user picks their gym at login | Subdomain per gym / gym code / phone-first then pick gym | **Phone-first**: verify OTP, then list the gyms that phone has an account in (auto-select if one). Keeps `gym_id` out of URLs and works for one PWA install | Phase 2 |
| 3 | OTP delivery | MSG91 SMS / Twilio / WhatsApp OTP / Firebase Auth | **Decided: WhatsApp Cloud API** authentication template (copy-code button). No DLT registration needed; free Meta test number during development; same Meta setup is reused for reminders in Phase 8. SMS (MSG91 + DLT) can be added later as a fallback channel | Phase 2 |
| 4 | Are plan prices GST-inclusive? | Inclusive / exclusive | **Inclusive** (what Indian gyms quote). Server back-calculates base and tax | Phase 3 |
| 5 | Is the gym GST-registered? | Yes (tax invoice) / No (bill of supply) | Support both: `gyms.gstin` nullable; if null, issue a bill of supply with zero tax | Phase 4 |
| 6 | Offline payments (cash / UPI at desk) | Support / Razorpay only | **Support** — admin records a manual payment; most Indian gyms still take cash | Phase 4 |
| 7 | Late-cancel policy for PT | Free cancel up to N hours before; later = session used | **12 hours**, configurable per gym in `gyms.settings` | Phase 5 |
| 8 | WhatsApp provider | Meta Cloud API direct / BSP (Interakt, Gupshup, AiSensy) | **Meta Cloud API** if you can verify a Meta Business account; BSP otherwise. Templates need Meta approval | Phase 8 |
| 9 | Hosting | see §8 | Web: **Cloudflare Pages** (or Vercel / Netlify) — HTTPS is required for Home Screen install. Later: Postgres + API in Mumbai region | Web: Phase 0. API: Phase 1 (public URL by Phase 4 for webhooks) |
| 10 | Branding | — | Name is **Onthec Gym**; placeholder logo and lime-on-dark colours in Phase 0 — swap for the real logo when available | Phase 9 |

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
- `pt_session_ledger` — reasons: `purchase`, `session_completed`, `late_cancel`, `no_show`, `dispute_refund`, `admin_adjustment`, `expired`. Unique `(session_id, reason)` so a session can't be deducted twice.
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

**2b — Login screens (next)**
- React Router, TanStack Query, Tailwind. Phone → OTP (SMS autofill) → gym picker if needed → consent → role home placeholder + logout. 360px.

**2c — Deploy the API**
- Render free web service (Singapore), `TRUST_PROXY=true`, Neon in Singapore. Cloudflare Worker routes `/api/*` to Render; everything else stays static assets.

### Phase 3 — Members and plans
- Admin: plans CRUD (deactivate, don't delete), members list with search/filter (active / expiring in 7 days / expired), create member (creates user + member), member detail page, assign membership manually, freeze/unfreeze.
- Member: home screen — current plan, start/end, **days left**, status badge; membership history.
- Trainer: list of assigned members (read-only basics).
- Nightly job: expire memberships, activate `upcoming` ones.
- **Tests**: renewal start-date rule, freeze extension and limits, days-left across IST midnight, status job idempotency, isolation.

### Phase 4 — Payments and invoices
- Member: "Renew / Buy plan" → `POST /payments/orders` (server creates Razorpay order from the plan price, never from client amount) → Razorpay Checkout → `POST /payments/verify` (signature check, shows "processing") → webhook `payment.captured` / `order.paid` marks paid and fulfils.
- Webhook: verify `X-Razorpay-Signature` with webhook secret over the raw body; idempotent via `webhook_events`; handles `payment.failed`, `refund.processed`.
- Admin: record manual payment (cash/UPI), refund (Razorpay API for online, manual record for cash), payment list with filters, export CSV.
- Invoices: number allocated in the same transaction as marking paid; PDF generated by a job (`pdfkit` or `@react-pdf/renderer`), stored in R2, served through short-lived signed URLs.
- Member: payment history with invoice download.
- **Tests**: duplicate webhook delivery, webhook before/after client verify (either order), bad signature rejected, amount mismatch rejected, GST rounding table (many prices), FY rollover on 1 April IST, gap-free numbering under concurrent payments, isolation.

### Phase 5 — PT packages and booking
- Admin: PT packages CRUD; sell a package (online or manual payment → `pt_purchase` + ledger `+N`); assign trainer.
- Trainer: weekly availability editor, time off, day/week schedule, mark complete / no-show with notes.
- Member: balance + expiry per purchase, book from free slots (availability − time off − booked), reschedule/cancel (late-cancel policy), confirm/dispute completed sessions.
- Admin: dispute queue, ledger adjustments with reason.
- Jobs: auto-confirm after 24h, expire unused sessions at `expires_on` (ledger `expired` rows).
- **Tests**: ledger balance invariants, concurrent booking of the last session, trainer double-booking blocked, late cancel deducts, dispute refund, auto-confirm idempotency, slot generation across time off, isolation.

### Phase 6 — QR check-in
- Member: full-screen QR pass that rotates every 30s with a countdown; brightness hint.
- Front desk: scanner screen (`@zxing/browser` or `html5-qrcode`, camera on a tablet/phone) → big green/red result with member photo, name, plan, days left; manual check-in by search.
- Rules: deny if expired/frozen/no membership (red, with reason); dedupe window.
- Member: attendance history + simple monthly count.
- *Offline note*: the member pass needs a signing key on the device to work offline; simplest safe option for MVP is **online-only generation** (pass fetched every 30s). Revisit if gym Wi-Fi is poor.
- **Tests**: token expiry, tampering, cross-gym token rejected, dedupe, frozen membership denied.

### Phase 7 — Admin dashboard
- Cards: active members, expiring this week, expired last 30 days (renewal targets), revenue today / this month (by method), pending dues, PT sessions this week, today's check-ins.
- Leads: list, create, status pipeline (`new → contacted → trial → converted / lost`), follow-up date, convert-to-member.
- All aggregates computed in SQL with IST date boundaries; indexes reviewed with `EXPLAIN`.
- **Tests**: aggregates on a fixed seed, IST boundary cases, isolation (dashboard numbers never include other gyms).

### Phase 8 — Notifications
- Web push: subscribe/unsubscribe, VAPID keys in env, service worker handler, remove dead subscriptions on 404/410.
- WhatsApp: approved templates — `membership_expiry_7d`, `_3d`, `_0d`, `pt_session_reminder` (2h before), `payment_receipt` (with invoice link). Only send if WhatsApp consent recorded.
- Daily scheduler at 09:00 IST; `notifications_log.dedupe_key` prevents double sends; quiet hours.
- Member settings: toggle channels.
- *iOS note*: web push on iPhone only works when the PWA is installed to the Home Screen (iOS 16.4+) — WhatsApp is the reliable channel there.
- **Tests**: scheduler picks the right members on each day offset, dedupe, consent respected, provider failures logged and retried.

### Phase 9 — PWA polish and production
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
| 6 QR check-in | S–M | |
| 7 Dashboard | M | |
| 8 Notifications | M | Meta template approval runs in parallel |
| 9 PWA polish + production | M | |

## 10. Things to start outside the code now

These have lead times and don't depend on the code:
1. **Meta Business verification + WhatsApp business number** (login codes and reminders). DLT/SMS registration is only needed if SMS is added later as a fallback.
2. **Razorpay account + KYC** for the gym's business.
3. **Meta Business verification** for WhatsApp Cloud API.
4. Confirm with the gym's CA: GST registration status, SAC code, invoice format.
5. Domain name.
6. Privacy notice + terms text (DPDP consent needs a notice to point to).
