# CLAUDE.md — Gym Management App

## What we're building

A gym management platform with three user roles: **members**, **trainers** and **owner/admin**.
Phase 1 runs at one gym ("Onthec Gym"), but the system must be **multi-tenant from day one** so other gyms can be onboarded later as paying customers (SaaS).

The member and trainer experience ships as a **PWA** (installable web app). The admin panel is the same web app, with desktop-optimised routes. Native store apps (React Native / Capacitor) may come later, so keep business logic in the API and shared packages, not in UI components.

## Tech stack

* **Language:** TypeScript everywhere (strict mode)
* **Frontend:** React + Vite, `vite-plugin-pwa`, React Router, TanStack Query, Tailwind CSS
* **Backend:** Node.js + Express (or Fastify), REST API, Zod for validation
* **Database:** PostgreSQL with Prisma ORM and migrations
* **Payments:** Razorpay (orders + webhooks)
* **Notifications:** Web Push (`web-push` library, VAPID keys) + WhatsApp Cloud API (or BSP) for reminders
* **Storage:** S3-compatible (Cloudflare R2) for progress photos and invoice PDFs
* **Error tracking:** Sentry
* **Package manager:** pnpm workspaces

## Repo structure

```
/apps/web        React PWA (member, trainer, admin routes)
/apps/api        Node API
/packages/shared Shared types, Zod schemas, constants
/prisma          Schema and migrations
```

## Non-negotiable rules

### Multi-tenancy

* Every tenant-owned table has a `gym\_id` column (FK to `gyms`), indexed.
* `gym\_id` is **always** taken from the authenticated user's session, **never** from the request body, query or URL.
* Every query on tenant data must filter by `gym\_id`. Use a shared helper / Prisma middleware that enforces this; do not write raw tenant queries without it.
* Write a test for every new endpoint proving a user from gym A cannot read or modify gym B's data.

### Money

* Store all amounts as **integers in paise** (`amount\_paise`). Never use floats for money.
* GST is calculated server-side; store base amount, tax amount and total separately on invoices.

### Time

* Store all timestamps in UTC. Display in `Asia/Kolkata`.
* Membership start/end are dates (no time component).

### Payments

* Create Razorpay orders on the server only.
* Verify the payment signature server-side.
* The Razorpay **webhook is the source of truth** for marking payments as paid. Webhook handlers must be idempotent (store and check the Razorpay event/payment ID).
* Never store card or bank details.

### PT session balance

* Session usage is recorded in a **ledger table** (`pt\_session\_ledger`), never by directly editing a counter.
* A session is deducted when the trainer marks it complete. The member gets a confirm/dispute option; if no action in 24 hours, it auto-confirms.
* Balance changes happen inside a DB transaction.

### Security and privacy (DPDP Act)

* Auth via phone OTP. JWT access token (short-lived) + refresh token in an httpOnly secure cookie.
* Role-based access: `member`, `trainer`, `admin`, `owner`. Check role on every protected route.
* Secrets live in `.env` only. Never commit `.env`. Keep `.env.example` updated.
* Record member consent at signup. Members can request account deletion; implement a proper delete/anonymise flow.
* Progress photos and body measurements are private to the member and their assigned trainer only.

## Core data model (starting point)

* `gyms` — name, address, GSTIN, branding (logo, colours), settings JSON
* `users` — phone, name, role, gym\_id
* `members` — user\_id, gym\_id, join date, emergency contact, notes
* `trainers` — user\_id, gym\_id, specialisation, commission settings
* `membership\_plans` — gym\_id, name, duration\_days, price\_paise, active
* `memberships` — member\_id, plan\_id, start\_date, end\_date, status (active, expired, frozen, cancelled)
* `membership\_freezes` — membership\_id, from, to, reason
* `pt\_packages` — gym\_id, name, session\_count, validity\_days, price\_paise
* `pt\_purchases` — member\_id, trainer\_id, package\_id, sessions\_total, expires\_on
* `pt\_sessions` — purchase\_id, trainer\_id, member\_id, scheduled\_at, status (booked, completed, cancelled, no\_show), trainer\_notes
* `pt\_session\_ledger` — purchase\_id, session\_id, change (+/-), reason, created\_at
* `trainer\_availability` — trainer\_id, weekday, start\_time, end\_time; plus leave/blocked dates
* `attendance` — member\_id, gym\_id, checked\_in\_at, method (qr, manual)
* `payments` — gym\_id, member\_id, amount\_paise, purpose, razorpay\_order\_id, razorpay\_payment\_id, status
* `invoices` — payment\_id, invoice\_number (per-gym sequence), base, gst, total, pdf\_url
* `leads` — gym\_id, name, phone, source, status, follow\_up\_date
* `push\_subscriptions` — user\_id, endpoint, keys
* `notifications\_log` — user\_id, channel, template, status, sent\_at

## Build phases (MVP)

Work one phase at a time, adding features one by one. At the end of each phase: tests pass, lint passes, commit.

0. **Installable PWA shell** — pnpm monorepo with `apps/web` only; "Welcome to Onthec Gym" screen; manifest, icons, service worker, iOS meta tags; install button (Android) + "Add to Home Screen" guide (iPhone); lint, test, CI; deployed over HTTPS so it can be added to the Home Screen on iOS and Android. **No backend, no payments.**
1. **Backend setup** — `apps/api`, `packages/shared`, Prisma, Postgres (Docker for local), env handling
2. **Auth and tenancy** — gyms, users, phone OTP login, roles, tenant middleware + isolation tests
3. **Members and plans** — admin creates plans and members; member sees plan, expiry, days left
4. **Payments and invoices** — Razorpay renew/buy flow, webhook, GST invoice PDF, payment history
5. **PT packages and booking** — trainer availability, booking/reschedule/cancel, session ledger, trainer marks complete, member confirm/dispute
6. **QR check-in** — member QR pass (signed, rotating token), front-desk scanner screen, attendance history
7. **Admin dashboard** — active/expiring/expired members, renewals due this week, revenue, pending dues, leads
8. **Notifications** — web push + WhatsApp reminders: expiry (7/3/0 days), PT session reminder, payment receipt
9. **PWA polish and production** — offline app shell for data screens, update prompt, branding, production hardening (backups, Sentry, live keys)

## Out of scope for MVP (do not build yet)

Workout logging, diet plans, challenges/leaderboards, loyalty points, in-app store, biometric integration, multi-branch UI, SaaS billing for gyms. Keep the schema flexible enough to add these later.

## Coding conventions

* Validate all API input with Zod schemas from `/packages/shared`.
* Consistent API error shape: `{ error: { code, message } }`.
* Keep route handlers thin; business logic goes in service files.
* Mobile-first UI. Every member and trainer screen must work well at 360px width.
* Write tests for: tenant isolation, payments/webhooks, PT ledger, membership expiry logic.
* Prefer small, focused commits with clear messages.
* Before starting any large feature, write a short plan and wait for approval.

## Commands

```
pnpm install
pnpm dev          # run the web app (Vite dev server, PWA disabled)
pnpm build        # typecheck + production build (generates the service worker)
pnpm preview      # serve the production build, to test install/offline
pnpm test
pnpm lint
pnpm typecheck
pnpm icons        # regenerate PWA icons from apps/web/public/logo.svg
```

Planned (from Phase 1): `pnpm db:migrate`, `pnpm db:seed`.

(Update this section as scripts are added.)

