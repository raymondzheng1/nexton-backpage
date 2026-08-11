"use client";
/**
 * PITCH FIGURE — the match photo, drawn rather than photographed.
 *
 * The Back Page prints a squad as a newspaper table, and the first cut of the live screen printed
 * ONLY tables. That lost the thing the product actually is: seeing your players standing where
 * they're standing with their minutes hung on them. This puts the picture back in the paper's own
 * language — the same halftone block, inked markings and player discs as the match photo on the
 * marketing back page — and leaves the tables underneath to carry the detail. The figure is the
 * glance; the table is the record.
 *
 * It is a real control, not an illustration: tapping a disc does exactly what tapping that player's
 * table row does, so tap-two-to-swap works between the picture and the tables interchangeably.
 *
 * Geometry is NOT reinvented here. `surfaceLayout` — shared verbatim with the original app and
 * covered by tests/features/surfaceLayout.test.ts — places every slot, so nothing in this file
 * knows or cares how many players are on the field (invariant #1).
 */
import type { ReactNode } from "react";
import { cx, mins } from "@/ui";
import { slotFullName } from "@/features/sports";
import { STATUS_META, type TokenStatus } from "./status";
import { courtLayout, pitchLayout, type SurfacePoint } from "./surfaceLayout";
import fig from "./pitchFigure.module.css";

/** One player in the picture. Presentation only — the caller decides what each field means. */
export interface FigurePlayer {
  id: string;
  /** First name, as everywhere in this product. */
  name: string;
  /** Their slot ("DC", "PG", "GK"); null when unplaced — they stand in the middle. */
  slot: string | null;
  /** Keep-on: a hard constraint the coach set, so it shows in the picture and not only the table. */
  locked: boolean;
  secondsOnField: number;
  /** Fairness read, or null before kick-off when nobody has played a minute. */
  status: TokenStatus | null;
  /** The engine is suggesting this one comes off — the sub-editor's red ring. */
  flagged: boolean;
  /** Printed under the disc INSTEAD of minutes: the team sheet prints the position. */
  note?: string;
}

interface PitchFigureProps {
  /** Football pitch or basketball half-court — `sportOf(match.config.sport).surface`. */
  surface: "pitch" | "court";
  players: FigurePlayer[];
  /** The words under the picture. Every newspaper photo has them. */
  caption: ReactNode;
  /** Omit to print a static figure (the pre-match team sheet has nothing to select). */
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  /** Just came on / just scored — one beat of emphasis. */
  flashIds?: readonly string[];
  /** Full time: the picture becomes a record rather than a control. */
  frozen?: boolean;
}

/** Caption ink, one class per fairness state. Colour is never the only signal — the word rides along. */
const CAPTION_TONE: Record<TokenStatus, string> = {
  on: fig.capOn ?? "",
  under: fig.capUnder ?? "",
  over: fig.capOver ?? "",
};

/**
 * The line under the disc: minutes, then the glyph and the word — "21′ ▼ REST". Deliberately the
 * SHORT status label (STATUS_META.short, which exists for exactly this): the plate has to stay
 * narrow enough not to crowd the player standing next to them in a busy line.
 */
function captionOf(p: FigurePlayer): { text: string; tone: string } {
  if (p.note !== undefined) return { text: p.note, tone: fig.capNote ?? "" };
  const played = mins(p.secondsOnField);
  if (p.status === null) return { text: played, tone: "" };
  const meta = STATUS_META[p.status];
  return { text: `${played} ${meta.glyph} ${meta.short.toUpperCase()}`, tone: CAPTION_TONE[p.status] };
}

/** What a screen reader hears instead of a disc: everything the picture says, in words. */
function describe(p: FigurePlayer): string {
  const parts: string[] = [p.name];
  if (p.slot !== null) parts.push(slotFullName(p.slot));
  if (p.note === undefined) {
    const played = Math.round(p.secondsOnField / 60);
    parts.push(`${played} minute${played === 1 ? "" : "s"} played`);
  }
  if (p.locked) parts.push("kept on");
  if (p.status !== null) parts.push(STATUS_META[p.status].label.toLowerCase());
  return parts.join(", ");
}

/**
 * How close two players on the same line have to stand, as a share of the picture's width, before
 * their caption plates would print over one another. A caption is wider than a disc — "21′ ▲ NEEDS"
 * runs to about a fifth of a phone's picture — so twin centre-backs or a double pivot collide.
 * Shrinking the words below the design's floor, or dropping the word for the glyph alone, are both
 * out (invariant #9: glyph + word + colour, always all three), so the second of any tight pair hangs
 * its caption ABOVE the disc instead — the way a formation diagram staggers its key. Above rather
 * than below because below is where the next line back stands.
 */
const TIGHT_GAP_PERCENT = 25;

/**
 * Ids whose caption goes above the disc. Walks each line left→right, keeping a player on the
 * default row only when they clear the last one that stayed there — so a fanned line of any size
 * alternates cleanly, and a roomy line is left alone.
 */
function raisedCaptions(placed: { p: FigurePlayer; at: SurfacePoint }[]): Set<string> {
  const lines = new Map<number, { id: string; x: number }[]>();
  for (const { p, at } of placed) {
    const key = Math.round(at.y);
    lines.set(key, [...(lines.get(key) ?? []), { id: p.id, x: at.x }]);
  }
  const raised = new Set<string>();
  for (const line of lines.values()) {
    let lastOnRow: number | null = null;
    for (const t of [...line].sort((a, b) => a.x - b.x)) {
      if (lastOnRow !== null && t.x - lastOnRow < TIGHT_GAP_PERCENT) raised.add(t.id);
      else lastOnRow = t.x;
    }
  }
  return raised;
}

/**
 * A long first name has to break rather than burst the circle, but it should not shrink below the
 * design's 11px micro-label floor — so past that it wraps to a second line instead.
 */
function nameSize(name: string): number {
  return name.length <= 4 ? 14 : name.length <= 6 ? 12.5 : 11;
}

/** Chalk lines, attacking up: our goal at the bottom. Box, halfway line, centre circle, both areas. */
function PitchLines() {
  return (
    <g>
      <rect x="3" y="3" width="94" height="126" />
      <line x1="3" y1="66" x2="97" y2="66" />
      <circle cx="50" cy="66" r="13" />
      <circle cx="50" cy="66" r="0.9" fill="rgba(20,19,17,.55)" stroke="none" />
      {/* attacking end */}
      <rect x="26" y="3" width="48" height="16" />
      <rect x="39" y="3" width="22" height="6" />
      {/* our end */}
      <rect x="26" y="113" width="48" height="16" />
      <rect x="39" y="123" width="22" height="6" />
    </g>
  );
}

/** The standard half-court coaching diagram: key, free-throw circle, three-point line, rim. */
function CourtLines() {
  return (
    <g>
      <rect x="3" y="3" width="94" height="126" />
      {/* half of the centre circle, on the half-court line */}
      <path d="M 38 3 A 12 12 0 0 0 62 3" />
      {/* three-point line: corner straights into the arc */}
      <path d="M 10 129 L 10 103 C 10 56, 90 56, 90 103 L 90 129" />
      {/* the key */}
      <rect x="33" y="91" width="34" height="38" />
      {/* free-throw circle: solid towards the basket, dashed behind it */}
      <path d="M 38 91 A 12 12 0 0 1 62 91" />
      <path d="M 38 91 A 12 12 0 0 0 62 91" strokeDasharray="3 2.6" />
      {/* backboard, rim, restricted area */}
      <line x1="43" y1="123" x2="57" y2="123" strokeWidth="1" />
      <circle cx="50" cy="119.4" r="2.4" />
      <path d="M 42 123 C 42 113, 58 113, 58 123" />
    </g>
  );
}

export function PitchFigure({
  surface,
  players,
  caption,
  onSelect,
  selectedId = null,
  flashIds,
  frozen = false,
}: PitchFigureProps) {
  const isCourt = surface === "court";
  const layout = (isCourt ? courtLayout : pitchLayout)(
    players.map((p) => ({ id: p.id, slot: p.slot })),
  );
  const fallback: SurfacePoint = isCourt ? { x: 50, y: 55 } : { x: 50, y: 42 };
  const flashed = new Set(flashIds ?? []);

  // Paint back→front, then left→right: the order a team sheet is read, so the keyboard walks the
  // picture the way a coach does — and where two caption plates must overlap in a crowded line, the
  // right-hand one consistently sits over the left rather than flickering between renders.
  const placed = players
    .map((p) => ({ p, at: layout.get(p.id) ?? fallback }))
    .sort((a, b) => b.at.y - a.at.y || a.at.x - b.at.x || (a.p.id < b.p.id ? -1 : 1));
  const raised = raisedCaptions(placed);

  const body = (p: FigurePlayer): ReactNode => {
    const cap = captionOf(p);
    return (
      <>
        <span
          className={cx(
            fig.disc,
            p.flagged ? fig.discOutline : fig.discSolid,
            flashed.has(p.id) && fig.discFlash,
          )}
          style={{ fontSize: nameSize(p.name) }}
        >
          {p.slot === "GK" && (
            <span className={fig.glove} aria-hidden>
              🧤
            </span>
          )}
          {p.name}
        </span>
        {p.locked && (
          <span className={fig.lock} aria-hidden>
            🔒
          </span>
        )}
        <span className={cx(fig.cap, raised.has(p.id) && fig.capUp, cap.tone)}>{cap.text}</span>
      </>
    );
  };

  return (
    <figure className={fig.figure}>
      <div className={fig.halftone}>
        <svg
          viewBox="0 0 100 132"
          preserveAspectRatio="none"
          className={fig.lines}
          fill="none"
          stroke="rgba(20,19,17,.55)"
          strokeWidth="0.5"
          aria-hidden
        >
          {isCourt ? <CourtLines /> : <PitchLines />}
        </svg>

        {placed.map(({ p, at }) => {
          const style = { left: `${at.x}%`, top: `${at.y}%` };
          return onSelect ? (
            <button
              key={p.id}
              type="button"
              style={style}
              disabled={frozen}
              className={cx(fig.token, fig.tokenBtn, selectedId === p.id && fig.tokenSel)}
              aria-pressed={selectedId === p.id}
              aria-label={describe(p)}
              onClick={() => onSelect(p.id)}
            >
              {body(p)}
            </button>
          ) : (
            <div key={p.id} style={style} className={fig.token}>
              {body(p)}
            </div>
          );
        })}
      </div>
      <figcaption className={fig.figCaption}>{caption}</figcaption>
    </figure>
  );
}
