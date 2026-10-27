# Onthec Gym

Multi-tenant gym management platform (members, trainers, owner/admin) delivered as a PWA.

- Project rules and stack: [CLAUDE.md](CLAUDE.md)
- Detailed plan, phases and open decisions: [docs/PLAN.md](docs/PLAN.md)

## Status

- **Phase 0 — Installable PWA shell:** done. Live at https://gym-app.snitin322.workers.dev
- **Phase 1 — Backend setup:** done. Fastify API, Prisma, Neon Postgres, health check (runs locally; API hosting comes with Phase 2).
- **Phase 2 — Login and tenancy:** done. Phone OTP login, sessions, roles, per-gym data isolation, login screens, and the API hosted on Render (Singapore) behind the Cloudflare Worker — see [docs/DEPLOY.md](docs/DEPLOY.md).
- **Phase 3 — Members and plans:** done. Owners/admins manage plans, members and staff (renew, freeze, cancel); members see their plan and days left.
- **Phase 4 — Payments and invoices:** done. Desk payments and dues, GST invoices with PDF download, and online renewal with Razorpay (webhook-confirmed).
- **Phase 5 — PT packages and booking:** in progress. 5a done: PT packages, selling at the desk with a trainer, session ledger (balance = sum of ledger lines), adjust/extend, member PT card and trainer "My clients". Next: 5b availability and booking.

Login codes are sent on WhatsApp when `OTP_PROVIDER=whatsapp` — set it up with [docs/WHATSAPP_SETUP.md](docs/WHATSAPP_SETUP.md). With `OTP_PROVIDER=console` they appear in the API log (`pnpm dev` terminal) instead.

Online payments use Razorpay — set up test mode with [docs/RAZORPAY_SETUP.md](docs/RAZORPAY_SETUP.md).

If `pnpm db:deploy` fails with "Can't reach database server" on Jio Fiber, the router's DNS is refusing Neon hostnames: set Windows DNS to `1.1.1.1` / `8.8.8.8`.

Features get added one phase at a time.

## Run it

Needs Node 20.19+ and pnpm 10, plus a Postgres database (we use free [Neon](https://neon.tech)).

1. Copy `apps/api/.env.example` to `apps/api/.env` and fill in the Neon connection strings.
2. Install, set up the database and start everything:

```bash
pnpm install
```

```bash
pnpm db:deploy
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

The web app runs on http://localhost:5173 (service worker disabled in dev) and the API on http://localhost:3000. Check the API with http://localhost:3000/api/v1/health.

To test the installable version locally:

```bash
pnpm build
pnpm preview    # http://localhost:4173
```

Installing on a phone needs **HTTPS**, so test Home Screen install from the deployed URL, not from your laptop's IP address.

## Add to Home Screen

- **iPhone / iPad (Safari):** tap Share → **Add to Home Screen** → Add.
- **Android (Chrome):** tap **Install app** on the page, or menu ⋮ → **Add to Home screen**.

## Icons

Icons in `apps/web/public/` are generated from `apps/web/public/logo.svg`. After changing the logo run:

```bash
pnpm icons
```
