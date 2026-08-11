/**
 * Regression: "live clock pauses when I leave the page / background the app" (#3 follow-up).
 *
 * A web page can't tick while it's backgrounded or you've navigated away. The clock's truth is the
 * persisted wall-clock anchor, not the count of interval fires — so on reopen/refocus we must snap
 * elapsed up to REAL time. These pin `wallClockCatchUp`, the pure seam behind both `open()` and the
 * new `resync()` visibility handler.
 */
import { describe, expect, it } from "vitest";
import { applyEvent, buildPlan, initLiveState, type LineupAssignment, type Match, type Player } from "../../src/engine/index";
import {
  elapsedInPeriodSeconds,
  remainingInPeriodSeconds,
  shouldKeepNextChange,
  wallClockCatchUp,
} from "../../src/store/clock";
import type { SavedMatch } from "../../src/store/schema";
import { makeMatch, makeSquad } from "../engine/_fixtures";

const T0 = Date.parse("2026-06-14T00:00:00.000Z");

function runningLive(config: Match, players: Player[], elapsedSeconds: number) {
  const lineup: LineupAssignment[] = buildPlan(config, players).startingLineup.assignments;
  let live = applyEvent(initLiveState(config, players), { type: "MATCH_STARTED", atSeconds: 0, lineup });
  if (elapsedSeconds > 0) {
    live = applyEvent(live, { type: "TICK", atSeconds: elapsedSeconds, deltaSeconds: elapsedSeconds });
  }
  return live;
}

function savedMatch(config: Match, players: Player[], anchor: SavedMatch["clockAnchor"]): SavedMatch {
  return {
    id: "m1",
    ownerId: "local",
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    deletedAt: null,
    teamId: "t1",
    name: "Test match",
    config,
    players,
    status: "live",
    events: [],
    clockAnchor: anchor,
  };
}

describe("wall-clock catch-up — the away-clock keeps running (#3)", () => {
  it("snaps elapsed up to real time when reopened after being away", () => {
    const players = makeSquad(8);
    const config = makeMatch(5, players); // periods 2 × 25min
    const live = runningLive(config, players, 60); // page last persisted 1:00
    const match = savedMatch(config, players, { elapsedSeconds: 0, wallClockISO: new Date(T0).toISOString() });

    // 200s of real time have passed since kickoff while the page was away.
    const { working, delta, crossedPeriod } = wallClockCatchUp(live, match, T0 + 200_000);

    expect(delta).toBe(140); // 200 true − 60 persisted
    expect(working.elapsedSeconds).toBe(200);
    expect(crossedPeriod).toBe(false);
  });

  it("accrued on-field time advances for players still on the pitch", () => {
    const players = makeSquad(8);
    const config = makeMatch(5, players);
    const live = runningLive(config, players, 60);
    const onId = Object.values(live.players).find((p) => p.onField)!.playerId;
    const before = live.players[onId]!.secondsOnField;
    const match = savedMatch(config, players, { elapsedSeconds: 0, wallClockISO: new Date(T0).toISOString() });

    const { working } = wallClockCatchUp(live, match, T0 + 200_000);
    expect(working.players[onId]!.secondsOnField).toBe(before + 140);
  });

  it("does NOT skip half-time: catch-up is capped at a non-final period boundary", () => {
    const players = makeSquad(8);
    const config = makeMatch(5, players); // 2 × 1500s; period 1 ends at 1500s
    const live = runningLive(config, players, 60);
    const match = savedMatch(config, players, { elapsedSeconds: 0, wallClockISO: new Date(T0).toISOString() });

    // away well past half-time (30 min of real time)
    const { working, crossedPeriod } = wallClockCatchUp(live, match, T0 + 1800_000);

    expect(working.elapsedSeconds).toBe(1500); // capped at the period boundary
    expect(crossedPeriod).toBe(true);
  });

  it("rolls past full time in the FINAL period (added time, not auto-ended)", () => {
    const players = makeSquad(8);
    const config = makeMatch(5, players, { periods: 1 }); // total 1500s, period 1 is final
    const live = runningLive(config, players, 60);
    const match = savedMatch(config, players, { elapsedSeconds: 0, wallClockISO: new Date(T0).toISOString() });

    // away 100s past the final whistle → clock keeps rolling, NOT capped at the total
    const { working, crossedPeriod } = wallClockCatchUp(live, match, T0 + 1600_000);

    expect(working.elapsedSeconds).toBe(1600); // rolled into added time
    expect(crossedPeriod).toBe(false);
  });

  it("REGRESSION: an ABANDONED match (app closed for hours mid-final-period) is capped, not credited", () => {
    const players = makeSquad(8);
    const config = makeMatch(5, players, { periods: 1 }); // total 1500s, period 1 is final
    const live = runningLive(config, players, 60);
    const onId = Object.values(live.players).find((p) => p.onField)!.playerId;
    const match = savedMatch(config, players, { elapsedSeconds: 0, wallClockISO: new Date(T0).toISOString() });

    // Coach closed the app and came back 20 HOURS later. Unattended catch-up must stop at
    // total + half a period of added time (1500 + 750), not credit 20h of minutes to the XI
    // (which would poison season totals).
    const { working, crossedPeriod } = wallClockCatchUp(live, match, T0 + 20 * 3600_000);
    expect(working.elapsedSeconds).toBe(2250);
    expect(working.players[onId]!.secondsOnField).toBe(2250);
    expect(crossedPeriod).toBe(false);

    // …and once at the cap, reopening again later adds nothing more.
    const again = wallClockCatchUp(working, match, T0 + 40 * 3600_000);
    expect(again.delta).toBe(0);
    expect(again.working.elapsedSeconds).toBe(2250);
  });

  it("no anchor (paused/frozen) → clock does not advance", () => {
    const players = makeSquad(8);
    const config = makeMatch(5, players);
    const live = runningLive(config, players, 60);
    const match = savedMatch(config, players, null);

    const { working, delta } = wallClockCatchUp(live, match, T0 + 200_000);
    expect(delta).toBe(0);
    expect(working.elapsedSeconds).toBe(60);
    expect(working).toBe(live);
  });

  it("a paused clock is not advanced even if an anchor lingers", () => {
    const players = makeSquad(8);
    const config = makeMatch(5, players);
    const paused = applyEvent(runningLive(config, players, 60), { type: "CLOCK_PAUSED", atSeconds: 60 });
    const match = savedMatch(config, players, { elapsedSeconds: 0, wallClockISO: new Date(T0).toISOString() });

    const { delta, working } = wallClockCatchUp(paused, match, T0 + 200_000);
    expect(delta).toBe(0);
    expect(working.elapsedSeconds).toBe(60);
  });
});

describe("next-change countdown stays pinned across leave/return (#3 follow-up)", () => {
  const target = { atSeconds: 840 }; // a change planned at 14:00

  it("keeps the same target when returning to the same match before it's reached", () => {
    // away → elapsed jumped from 5:00 to 11:00, still before the 14:00 target → KEEP (don't re-plan)
    expect(shouldKeepNextChange(target, "m1", "m1", 660)).toBe(true);
  });

  it("re-pins once the target has been reached", () => {
    expect(shouldKeepNextChange(target, "m1", "m1", 840)).toBe(false); // exactly reached
    expect(shouldKeepNextChange(target, "m1", "m1", 900)).toBe(false); // passed
  });

  it("re-pins when opening a different match", () => {
    expect(shouldKeepNextChange(target, "m1", "m2", 100)).toBe(false);
  });

  it("re-pins when there is no target yet (e.g. fresh reload)", () => {
    expect(shouldKeepNextChange(null, null, "m1", 100)).toBe(false);
  });
});

/**
 * Basketball's game clock counts DOWN inside each period, so the live screen shows time remaining
 * alongside time played. The arithmetic is trivial; the edge cases are not — `elapsedSeconds`
 * accumulates across the whole match, and the final period deliberately runs past its length.
 */
describe("time remaining in the period (basketball's countdown)", () => {
  const players = makeSquad(8);
  // 2 x 18' basketball — the app's default for the sport.
  const config = makeMatch(5, players, { sport: "basketball", periods: 2, periodLengthMinutes: 18 });
  const match = savedMatch(config, players, null);
  const at = (elapsedSeconds: number, period: number) => ({
    ...runningLive(config, players, 0),
    elapsedSeconds,
    period,
  });

  it("counts down from the full period at tip off", () => {
    expect(remainingInPeriodSeconds(match, at(0, 1))).toBe(18 * 60);
  });

  it("counts down within the first period", () => {
    expect(remainingInPeriodSeconds(match, at(5 * 60, 1))).toBe(13 * 60);
  });

  it("resets for the second period instead of counting the whole match", () => {
    // THE ONE THAT MATTERS: elapsedSeconds is cumulative, so 20' elapsed in period 2 is only 2'
    // into that period — 16' left, not the -2' a naive `total - elapsed` would give.
    expect(elapsedInPeriodSeconds(match, at(20 * 60, 2))).toBe(2 * 60);
    expect(remainingInPeriodSeconds(match, at(20 * 60, 2))).toBe(16 * 60);
  });

  it("reads 0:00 at the end of a period, not a negative", () => {
    expect(remainingInPeriodSeconds(match, at(18 * 60, 1))).toBe(0);
  });

  it("stays at 0:00 in added time — the final period runs on until the coach ends it", () => {
    expect(remainingInPeriodSeconds(match, at(38 * 60, 2))).toBe(0);
    expect(remainingInPeriodSeconds(match, at(45 * 60, 2))).toBe(0);
  });

  it("never goes negative if a stored state has a period ahead of the clock", () => {
    // Defensive: a merged or recovered log could pair a high period with a low elapsed.
    expect(elapsedInPeriodSeconds(match, at(60, 2))).toBe(0);
    expect(remainingInPeriodSeconds(match, at(60, 2))).toBe(18 * 60);
  });
});
