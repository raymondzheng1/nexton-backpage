/**
 * Wall-clock seam for the STORE layer (PRD §12.2; Harness §4.4 "injectable clock").
 *
 * Unlike the pure engine (which never reads a clock), the store legitimately stamps records with
 * the real time. Routing "now" through one seam keeps record timestamps deterministic in tests
 * (`__setNowForTests`) — important because `updatedAt` drives sync's last-writer-wins merge.
 */
import { applyEvent, type LiveState } from "@/engine";
import type { SavedMatch } from "./schema";

let nowFn: () => string = () => new Date().toISOString();

/** Current time as an ISO-8601 string. */
export function now(): string {
  return nowFn();
}

/** Test-only: pin the clock (pass null to restore the real clock). */
export function __setNowForTests(fn: (() => string) | null): void {
  nowFn = fn ?? (() => new Date().toISOString());
}

export function periodLengthSeconds(match: SavedMatch): number {
  return match.config.periodLengthMinutes * 60;
}

export function totalSeconds(match: SavedMatch): number {
  return match.config.periods * periodLengthSeconds(match);
}

/**
 * Seconds played so far IN THE CURRENT PERIOD. `elapsedSeconds` accumulates across the whole match,
 * so the current quarter/half is what's left after subtracting the periods already finished.
 */
export function elapsedInPeriodSeconds(match: SavedMatch, live: LiveState): number {
  const periodLen = periodLengthSeconds(match);
  return Math.max(0, live.elapsedSeconds - (live.period - 1) * periodLen);
}

/**
 * Seconds LEFT in the current period — the number a basketball scoreboard shows, and the one
 * everyone on the court is watching.
 *
 * Floored at zero on purpose: the final period deliberately runs past its length into added time
 * (the coach decides when to end it), and "−1:12 left" is nonsense. Once the period is used up it
 * reads 0:00 and stays there.
 */
export function remainingInPeriodSeconds(match: SavedMatch, live: LiveState): number {
  return Math.max(0, periodLengthSeconds(match) - elapsedInPeriodSeconds(match, live));
}

export interface ClockCatchUp {
  /** Live state advanced to real wall time (unchanged if there's nothing to add). */
  working: LiveState;
  /** Whole seconds added (0 if already current, paused, or no anchor). */
  delta: number;
  /** Real time crossed a NON-final period boundary while away — caller should break for half-time. */
  crossedPeriod: boolean;
}

/**
 * Wall-clock catch-up for the live match clock (#3). A web page can't tick while it's backgrounded
 * or you've navigated away, so elapsed time is the truth held by the persisted anchor
 * (`{ elapsedSeconds, wallClockISO }`), NOT the count of interval fires. Advance `live` to the real
 * elapsed time implied by that anchor at `nowMs`, capped at the current period boundary / full time
 * so we never skip half-time or overrun. Only runs while the clock is running with an anchor;
 * otherwise it's a no-op (delta 0). Pure (time injected) so it's deterministic + unit-testable.
 */
/**
 * Should the pinned "next suggested change" countdown target be kept (vs. re-derived from the plan)?
 * Keep it only when it belongs to THIS match and is still in the future — so the countdown stays
 * stable across a navigate-away→return instead of jumping (the continuous planner re-derives its
 * window grid from the current time on every recalc). Re-pin once it's reached or the match changes.
 */
export function shouldKeepNextChange(
  current: { atSeconds: number } | null,
  targetMatchId: string | null,
  matchId: string,
  elapsedSeconds: number,
): boolean {
  return targetMatchId === matchId && current !== null && current.atSeconds > elapsedSeconds;
}

export function wallClockCatchUp(live: LiveState, match: SavedMatch, nowMs: number): ClockCatchUp {
  let working = live;
  let delta = 0;
  let crossedPeriod = false;
  if (live.status === "running" && match.clockAnchor) {
    const anchorMs = Date.parse(match.clockAnchor.wallClockISO);
    if (!Number.isNaN(anchorMs)) {
      const trueElapsed = match.clockAnchor.elapsedSeconds + (nowMs - anchorMs) / 1000;
      const periodEnd = live.period * periodLengthSeconds(match);
      const isFinalPeriod = live.period >= match.config.periods;
      // Earlier periods auto-pause at their boundary (half-time). The FINAL period rolls on PAST full
      // time into added time (the coach ends it manually, item 6) — but UNATTENDED catch-up is capped
      // at total + half a period of added time: a match left running and reopened hours/days later
      // must not credit every on-field player with the whole gap (it would poison season totals).
      // While the app is open and ticking (coach present), added time still rolls uncapped.
      const addedTimeCap = totalSeconds(match) + periodLengthSeconds(match) / 2;
      const target = isFinalPeriod ? Math.min(trueElapsed, addedTimeCap) : Math.min(trueElapsed, periodEnd);
      delta = Math.floor(target - live.elapsedSeconds);
      if (delta > 0) {
        working = applyEvent(live, { type: "TICK", atSeconds: live.elapsedSeconds + delta, deltaSeconds: delta });
      }
      crossedPeriod = !isFinalPeriod && trueElapsed >= periodEnd;
    }
  }
  return { working, delta, crossedPeriod };
}
