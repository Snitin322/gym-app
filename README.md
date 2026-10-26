# Onthec Gym

Multi-tenant gym management platform (members, trainers, owner/admin) delivered as a PWA.

- Project rules and stack: [CLAUDE.md](CLAUDE.md)
- Detailed plan, phases and open decisions: [docs/PLAN.md](docs/PLAN.md)

## Status

**Phase 0 — Installable PWA shell.** A single "Welcome to Onthec Gym" screen that can be added to the Home Screen on iPhone and Android. Features get added one phase at a time.

## Run it

Needs Node 20.19+ and pnpm 10.

```bash
pnpm install
pnpm dev        # http://localhost:5173 (service worker disabled in dev)
```

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
