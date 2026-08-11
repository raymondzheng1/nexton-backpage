# Handoff: NextOn Marketing Page — "Back Page" direction (4a)

## Overview
A phone-first marketing/home page for **NextOn** (live site: https://nexton-taupe.vercel.app/), a free, offline-first PWA that tracks every youth player's minutes live and suggests substitutions so every kid gets fair game time. This direction styles the page as a **tabloid newspaper back page**: newsprint background, black ink, one red accent, condensed all-caps headlines, a halftone "match photo", and a real box score.

## About the Design Files
`back-page-design.html` in this bundle is a **design reference created in HTML** — a prototype showing intended look, not production code to copy directly. The task is to **recreate this design in the target codebase's existing environment** (the live site is a Next.js/React app on Vercel) using its established patterns. If no environment exists, choose an appropriate framework and implement there.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and copy are final intent — recreate pixel-perfectly at 390px, then adapt responsively (see Responsive behavior).

## Product rules (apply regardless of styling)
- Copy is honest: no invented testimonials, user counts, or logos.
- Players are neutral first names (Ava, Sam, Leo, Maya, Noah, Kit, Zara).
- Status system is always glyph + label + color (never color alone): ▲ needs minutes (blue), ✓ on target (neutral/green), ▼ earned a rest (amber/red per theme).
- All numerals use `font-variant-numeric: tabular-nums`. Minutes use the prime mark (24′).
- Tap targets ≥ 44px; body text ≥ 12px.

## Screen: Marketing page (single scroll, 390px design width)
Sections top to bottom. Page background `#f5f2ea`, ink `#141311`, accent red `#d92b21`.

1. **Masthead** — flex row, space-between, padding 12px 18px, `border-bottom: 3px double #141311`. Left: "NEXTON" in Anton 22px, "ON" in red. Right: "SATURDAY EDITION · FREE", 12px/700, letter-spacing .12em, uppercase.
2. **Dateline strip** — flex space-between, padding 8px 18px, 1px solid bottom border. "GRASSROOTS DESK" | "⚽ FOOTBALL · 🏀 BASKETBALL", 11.5px/700, uppercase, color `#4a453c`.
3. **Headline block** — padding 22px 18px 0. H1 Anton (weight 400 — Anton has one weight), 58px, line-height .96, uppercase: "EVERYONE PLAYS." then "NO ARGUMENTS." in red. Standfirst below a 1px rule: 16.5px/1.55, color `#33302a`, starts with bold "EXCLUSIVE —". CTA: full-width, height 52px, red bg, white text, radius 6px, Anton 18px uppercase "CREATE YOUR TEAM — FREE". Trust row centered beneath: "NO ACCOUNT · WORKS OFFLINE · FREE", 13.5px/700 uppercase `#4a453c`.
4. **Match photo figure** — 1px ink border, 10px padding. Inside: 230px halftone pitch (gray `#c9c4b8` + radial-gradient dot pattern: `radial-gradient(circle, rgba(20,19,17,.22) 1px, transparent 1.4px)`, background-size 5px 5px), pitch lines as SVG strokes `rgba(20,19,17,.55)`. Leo: 54px circle, 3px red border, translucent paper fill, caption "21′ ▼ OFF" red 12.5px/800. Ava: 54px solid-ink circle, white text, caption "8′ ▲ ON". A red dashed annotation arrow (stroke 3, dasharray 10 7) curves from Ava's area toward Leo. Caption below figure: 12.5px, "**PICTURED:** the live match view…".
5. **Box score** — header "BOX SCORE — FULL TIME" Anton 19px uppercase over 3px solid rule. Table = CSS grid `1fr 52px 44px 40px`, gap 6px; header row 11.5px/800 uppercase `#4a453c` under 1px rule; data rows 15px/700, 1px dotted separators `rgba(20,19,17,.35)`. Rows: Ava 24′/1/✓, Sam 23′/2/✓, Leo 23′/—/✓, Maya 22′/—/✓ (✓ in `#0b6b3a`). Footer row over 3px rule: "FAIRNESS SPREAD: 2′" | "COPIED TO PARENTS' CHAT IN 1 TAP" (red), 13px/800 uppercase.
6. **"Column: The Fixer"** — 3px solid ink box, padding 14px 16px. Title Anton 18px uppercase. Body 15px/1.6: consent message — it never subs anyone by itself; confirm/edit/snooze/dismiss.
7. **Classifieds strip** — solid ink bar, white text, padding 12px 16px, flex space-between: "CLASSIFIEDS: PITCH 3 HAS NO WIFI" | "DOESN'T NEED ANY →" in `#f0b429`.
8. **Footer CTA** — above 1px top rule. Ink-black CTA (52px, radius 6, Anton 18 uppercase) "CREATE YOUR TEAM"; trust line 13.5px/700 uppercase; "Letters to the editor: contact the developer →" with red link.

## App screens (same tabloid language)
All in `app-screens-design.html`; shared chrome: masthead bar (Anton "NEXTON", red "ON", 3px double rule) + dateline strip (11.5px/700 uppercase `#4a453c` context info, 1px rule). Section headers are Anton uppercase over 3px solid rules; tables use 1px dotted row separators; all numerals tabular. Buttons: filled ink or red, Anton uppercase, 48–52px tall, radius 6; secondary = 2px ink outline.

1. **The Roster (squad setup)** — H1 "NAME THE SQUAD." Anton 34px; add-row: 48px outlined text input + 76×48px red ADD; player rows (drag handle ≡, name 16px/800, outlined "any position"/"🧤 keeper" tag 12px, 44×44px ✕ remove) with dotted separators; footer ink CTA "DONE — TO THE LINE-UP →" + "SAVED ON THIS PHONE · NO ACCOUNT".
2. **The Line-Up (pre-match plan)** — two 2px-outlined stepper cards (PERIODS "4 × 15′", ON PITCH "5 v 5"; 44×44px −/+ buttons, Anton 22px value); PROJECTED MINUTES table: name + ink bar on 10% track + red 2px fair-share tick at 80% + minutes right-aligned; legend "| = fair share…"; STARTING FIVE (ink rule) vs BENCH FIRST (red rule, "on @ 8′" notes) two-column grid; red CTA "KICK OFF ▶"; footnote "Drag names to swap · nothing is final".
3. **Live Desk (during play)** — inverted ink header: masthead + red-dot "LIVE · P2 OF 4" bug, Anton 46px clock "07:14", 76×44px outlined "⏸ HOLD"; NEXT CHANGE panel (3px ink border on white): Anton title + red Anton 26px countdown, 8px red progress bar at 72%, suggestion rows ("Leo ▼ off → Ava ▲ on · LEFT MID", 1px outline), ink "CONFIRM ALL (2)" 48px + outlined "⏱ SNOOZE 1′", consent footnote "it never subs by itself"; ON THE PITCH table (name, minutes, status: ✓ ON TRK green `#0b6b3a`, ▼ REST red, ⚽ marks scorers); BENCH table under red rule (▲ NEEDS blue `#2f6fbf`); bottom action bar over 3px rule: outlined "⚽ GOAL" + "⇄ SUB NOW" 50px.
4. **Final Edition (full time)** — dateline shows "FULL TIME · 60′ | RIVERSIDE LIONS 3 – 2"; H1 "EVERYONE PLAYED. HERE'S THE PROOF." (second line red); 3-cell stat strip in 3px border (7/7 fair share, 2′ spread red, 6 subs — Anton 26px + 11px uppercase labels); full box score (all 7 players, ⚽ column, green ✓); red CTA "COPY REPORT FOR PARENTS' CHAT" + outlined "SHARE AS IMAGE" / "NEXT MATCH →" pair.

### App-screen behavior
- Roster: add appends row; ✕ removes (confirm if player has recorded minutes); ≡ drag reorders; tag cycles any position/keeper.
- Line-Up: steppers clamp (periods 1–4, on pitch 3–11); bars re-project live as settings change; drag between starting/bench lists rebuilds projections; KICK OFF → Live Desk.
- Live Desk: clock counts up per period; HOLD pauses; countdown → suggestion rows appear (edit by tapping row → player picker); CONFIRM swaps players between tables and logs the change; SNOOZE +1:00; GOAL → tap scorer name; SUB NOW opens manual swap.
- Final Edition: COPY writes the plain-text receipt (team, date, per-player minutes, scorers, spread, "— via NextOn") to clipboard with a "Copied ✓" toast; SHARE AS IMAGE renders the box score card as PNG via canvas.
- Status colors always pair with glyph + word: ✓ ON TRK `#0b6b3a`, ▲ NEEDS `#2f6fbf`, ▼ REST `#d92b21`.

## Favicon
`favicon.svg` — 64×64: ink `#141311` plate (radius 12), double chevron: first stroke paper `#f5f2ea`, second red `#d92b21`, width 7, round caps. Legible at 16px. Reference `<link rel="icon" href="favicon.svg" type="image/svg+xml">`; export 32/16px PNGs + 180px apple-touch-icon from it for older browsers/iOS.

## Interactions & Behavior
- Both CTAs → the app's create-team flow (`/` team creation on the live site). "Contact the developer" → mailto/contact route. "Doesn't need any →" → privacy/offline explainer anchor.
- Hover (desktop): CTAs darken ~8% (e.g. red → `#c1251c`, ink → `#000`); links underline. Active: translateY(1px).
- No carousels/animations required. Optional: fade-in on scroll is acceptable but keep the newspaper static feel.
- Links: default `a` color `#d92b21`, hover `#b01f16`.

## State Management
None — static marketing page. If built in the existing app, reuse the router link for CTA.

## Design Tokens
- Paper `#f5f2ea` · Ink `#141311` · Red `#d92b21` · Muted ink `#4a453c` · Body ink `#33302a` · Halftone gray `#c9c4b8` · Check green `#0b6b3a` · Classifieds yellow `#f0b429`
- Type: **Anton** (Google Fonts, single weight) for display/CTAs, uppercase; system sans (-apple-system/Segoe UI stack) for body; tabular-nums everywhere numbers appear.
- Rules: 3px double (masthead), 3px solid (section headers, boxes), 1px solid, 1px dotted (table rows).
- Radii: 6px (CTAs only — everything else square). Spacing: 18px side gutters; 22–26px between sections.
- Text sizes: 58 / 19 / 18 / 16.5 / 15 / 13.5 / 12.5 / 11.5 (px).

## Responsive behavior
Design is 390px-first. ≥768px: center a single column max-width ~560px and scale H1 to ~76px; or two-column broadsheet (headline+CTA left, figure right) if desired — keep gutters and rules proportional. Never drop below 390px content width scaling.

## Assets
- No raster images. Pitch and arrows are inline SVG; halftone is a CSS radial-gradient pattern.
- Font: Anton via Google Fonts (`https://fonts.googleapis.com/css2?family=Anton&display=swap`).
- Emoji glyphs used as icons: ⚽ 🏀 (dateline), ⚽ (box score column), ▲▼✓ status glyphs (text, not icons).

## Files
- `back-page-design.html` — marketing page design reference; open in a browser at 390–430px width.
- `app-screens-design.html` — Roster, Line-Up, Live Desk, Final Edition screens + favicon sheet, side by side.
- `favicon.svg` — the favicon source.
