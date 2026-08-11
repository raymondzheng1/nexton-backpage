# CLAUDE.md — NextOn Back Page (operating manual)

> Read this before changing anything.
> Design intent lives in `design/README.md` + the two HTML reference files beside it.

---

## What this is

**NextOn Back Page** is the NextOn substitution-fairness app **restyled as a tabloid newspaper back
page**. It is a *lift and shift*: the product's behaviour is unchanged, the entire presentation layer
is new.

It is a **separate app** from the original NextOn (`../`, deployed at nexton-taupe.vercel.app).
That app stays exactly as it is. This one has its own repo:
`https://github.com/raymondzheng1/nexton-backpage`.

Same product: a phone-first installable PWA that tracks every youth player's minutes live and tells
a volunteer coach when to substitute and who, so playing time comes out fair. Football and
basketball. No accounts, works offline.

---

## The one rule that matters

**`src/engine/`, `src/store/`, `src/server/`, `src/app/api/` and the pure feature modules were
copied VERBATIM from the original app, and all 262 tests pass unchanged. Do not restyle them. Do not
refactor them. They are the product's correctness.**

That transplant is only possible because the engine is pure — no React, no Next, no IO, no clock
reads, no `Math.random`. Keep it that way. If a UI need ever seems to require touching the engine,
it almost certainly doesn't.

Copied verbatim and off-limits to styling work:

```
src/engine/**                          pure fairness engine, 100% reusable
src/store/**                           repository, sync, live store, schema
src/server/**                          Resend notify + rate limiting
src/app/api/**                         sync · contact · activity · keepwarm
src/features/sports.ts                 sport config
src/features/live/matchFeed.ts         match log derivation
src/features/live/status.ts            fairness status thresholds
src/features/live/surfaceLayout.ts     pitch/court geometry
src/features/plan/subbingGrid.ts       subbing sheet grid
src/features/lineup/lineup.ts          drag/drop lineup logic
tests/**                               the whole regression corpus
```

Two modules from the original were deliberately NOT lifted, because they were presentation for the
old design and have no counterpart here: `features/live/{Pitch,PlayerToken,BenchRail,MiniPitch}` and
`features/plan/planSquad.ts` (a view model that mapped a plan onto that pitch). The Back Page renders
squads as newspaper tables. `features/live/index.ts` is therefore a smaller barrel than the original —
logic only.

---

## The design: "Back Page"

A tabloid back page. Newsprint, black ink, one red. The conceit is load-bearing, not decorative — a
back page is where results and player ratings live, which is exactly what this product produces.

**Tokens** (`src/app/globals.css` — the single source of truth, don't hard-code these):

| | |
|---|---|
| Paper | `#f5f2ea` |
| Ink | `#141311` · body `#33302a` · muted `#4a453c` |
| Red | `#d92b21` (hover `#b01f16`, press `#c1251c`) |
| Halftone grey | `#c9c4b8` |
| Status | ✓ on `#0b6b3a` · ▲ needs `#2f6fbf` · ▼ rest `#d92b21` |
| Classifieds yellow | `#f0b429` |

**Type** — Anton (single weight, self-hosted via `next/font`) for all display and buttons, always
uppercase. System sans for body. Every numeral tabular; minutes take the prime mark (`24′`).

**Rules carry the hierarchy** — 3px double for the masthead and nothing else · 3px solid for section
headers and boxed columns · 1px solid for datelines and table heads · 1px dotted for table rows.

**Square everything.** The only radius in the design is 6px, on CTAs.

**No dark mode.** The original app had light and dark; a newspaper is a newspaper, and "dark
newsprint" is a contradiction. `color-scheme: light` is set deliberately. This is the one place the
lift-and-shift dropped a capability — revisit only if the owner asks.

---

## Non-negotiable invariants (unchanged from the original)

1. **No hard-coded `onFieldCount`.** Players-per-side is arbitrary (3–11+). Everything derives from
   `match.onFieldCount`. Enforced by `scripts/onfield-count-check.mjs`.
2. **Advisory only.** The app never auto-subs. Every suggestion is confirm/edit/snooze/dismiss. This
   is also the marketing page's central promise — "Column: The Fixer" says so in print.
3. **Keep-on is a hard constraint.** A locked player is never suggested off.
4. **Multi-substitution is first-class.** Confirm-all with per-line edit and remove.
5. **Determinism.** No `Math.random`, no wall-clock reads inside the engine. Time is injected.
6. **Loud failures.** No empty `catch`. Sync and email failures log; they never vanish.
7. **Pure engine.** `src/engine/**` imports nothing from Next, React, the store, or any IO.
8. **Offline-first.** Every core flow works against IndexedDB with no network.
9. **Colour is never the only signal.** Status is glyph + word + colour, always all three.
10. **≥44px tap targets. Body text ≥12px.** The floor is on BODY COPY. Uppercase micro-labels —
    datelines, table column heads, stat captions — sit at 11–11.5px, which the design specifies
    explicitly and which is how a newspaper sets a standfirst rule. Don't "fix" those to 12px; do
    hold the line on anything a coach actually reads as a sentence.

---

## The gate

```
npm run verify   # onfield:check → eslint + tsc --noEmit → vitest (262 tests)
```

Run it before every push. It also runs in CI on push and PR — see `.github/workflows/verify.yml`
once that is added.

---

## Environment

- **Local:** `npm run dev`. With no KV configured, `/api/sync` uses an in-memory store so everything
  works offline.
- **Production (Vercel):** needs `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or the `UPSTASH_*` pair)
  or `/api/sync` fails closed with 503. Optional: `RESEND_API_KEY` (+ `RESEND_FROM`,
  `CONTACT_TO_EMAIL`) for the contact form and activity pings, and `CRON_SECRET` to guard
  `/api/keepwarm`.
- **`RESEND_FROM` must be an address on a domain verified in Resend.** The sandbox sender
  `onboarding@resend.dev` only delivers to the Resend account owner and is not production-safe.

---

## Do / Don't

**Do** — derive everything on-field from `match.onFieldCount` · keep the engine pure · use the
tokens and the `src/ui` primitives rather than inventing colours · keep status as glyph + word +
colour · land a regression test named after the symptom with every bug fix.

**Don't** — restyle or refactor the copied core · hard-code a players-per-side number · auto-apply a
suggestion · use `any` or non-null assertions · add a radius to anything that isn't a CTA · add a
second display typeface.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
