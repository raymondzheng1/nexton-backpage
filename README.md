# NextOn — Back Page

**Everyone plays. No arguments.**

A phone-first, offline-first PWA that tracks every youth player's minutes live and tells the coach
when to substitute and who — so playing time comes out fair, and there's a report to prove it.
Football and basketball. No accounts. Free.

This is **NextOn restyled as a tabloid newspaper back page**: newsprint, black ink, one red accent,
condensed all-caps headlines and a real box score. The fairness engine underneath is the original,
copied verbatim and passing all 262 of its tests unchanged.

> The original NextOn lives at [nexton-taupe.vercel.app](https://nexton-taupe.vercel.app) and is
> unaffected by anything in this repository.

---

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. No configuration needed — with no cloud store set up, sync falls back to
an in-memory stub and everything else runs against your browser's local database.

## The gate

```bash
npm run verify
```

`onfield:check` (the on-field-count invariant linter) → `eslint` + `tsc --noEmit` → 262 tests.
Run it before every push.

## Deploying

Vercel, from `main`. Optional environment variables:

| Variable | What it does | Without it |
|---|---|---|
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Cross-device sync via Upstash Redis | `/api/sync` fails closed (503); the app still works locally |
| `RESEND_API_KEY` | Contact form + operator activity emails | Those routes fail closed |
| `RESEND_FROM` | Sender address — **must be a domain verified in Resend** | Falls back to a test sender that only reaches the account owner |
| `CONTACT_TO_EMAIL` | Where enquiries go | Defaults to the developer |
| `CRON_SECRET` | Guards `/api/keepwarm` | The endpoint stays open |

## How it's put together

```
src/engine/     the pure fairness engine — no React, no IO, time injected
src/store/      repository (IndexedDB local + KV sync), live match store, zod schemas
src/server/     email + rate limiting
src/ui/         the Back Page primitives: masthead, dateline, rules, status
src/features/   screens and their view models
src/app/        Next.js App Router routes + API handlers
design/         the design handoff this build follows
tests/          the regression corpus — 262 tests
```

The engine knows nothing about the user interface, which is why the whole product could be
re-skinned without touching a line of it. See `CLAUDE.md` before making changes.

## Licence

Private.
