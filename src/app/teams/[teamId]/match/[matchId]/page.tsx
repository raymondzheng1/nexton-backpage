"use client";
/**
 * LIVE DESK — the match screen. One route, three states, because a match is one continuous thing:
 * the team sheet before kick-off, the desk during play, the final edition after the whistle.
 *
 * The engine only ever ADVISES here. Nothing on this screen substitutes anyone: every suggestion is
 * a row the coach taps, edits, snoozes or ignores, and every confirmation goes through the store's
 * serialised commit queue so two fast taps can never double-book a slot.
 *
 * Restyled from the original live screen; the behaviour is a straight port. The old design's pitch
 * graphic is replaced by the newspaper squad tables — a back page prints a team sheet, not a
 * formation diagram — so tap-two-to-swap now happens between table rows rather than pitch tokens.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  applyEvent,
  buildPlan,
  DEFAULT_SUB_FREQUENCY,
  fairnessReport,
  groupOf,
  isRetiredAt,
  planFromLineup,
  projectFromLive,
  recommendationFromWindow,
  recommendSwaps,
  replanAfter,
  sanitizePlan,
  stateAfterWindows,
  SUB_FREQUENCY_LEVELS,
  suggestWindowAt,
  type LineupAssignment,
  type LiveState,
  type PlannedWindow,
  type Player,
  type PlayerLiveState,
  type PositionGroup,
  type PositionSlot,
  type Recommendation,
} from "@/engine";
import { useAppStore } from "@/store/appStore";
import { useLiveStore } from "@/store/liveStore";
import { newId } from "@/store/ids";
import { remainingInPeriodSeconds, totalSeconds } from "@/store/clock";
import { slotFullName, slotShortName, sportOf } from "@/features/sports";
import {
  buildMatchFeed,
  countActualSubs,
  feedLineText,
  statusFor,
  statusTolFor,
  wallClockLabel,
  type FeedLabels,
  type TokenStatus,
} from "@/features/live";
import { ProjectedMinutes, projectedRows } from "@/features/plan/ProjectedMinutes";
import {
  Button,
  ButtonLink,
  clockTime,
  cx,
  Dateline,
  Masthead,
  mins,
  SectionHead,
  Sheet,
  Status,
  styles,
  Toast,
  Wordmark,
} from "@/ui";
import desk from "@/features/live/liveDesk.module.css";

/* ── small pure helpers ─────────────────────────────────────────────────── */

/** m:ss, unpadded — how a countdown is written on a scoreboard ("3:50", not "03:50"). */
function countdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Outfield lines back→front, per sport (GK is implicit and printed separately). */
const PITCH_LINES: PositionGroup[] = ["DEF", "MID", "FWD"];
const COURT_LINES: PositionGroup[] = ["G", "F", "C"];

/** Rotation-dial level names, index = level − 1. The coach's words, not the algorithm's. */
const LEVEL_LABELS = ["Fewest changes", "Fewer changes", "Balanced", "More changes", "Most changes"];
const MAX_LEVEL = SUB_FREQUENCY_LEVELS.length;

function levelLabel(level: number): string {
  return LEVEL_LABELS[Math.round(level) - 1] ?? "Balanced";
}

/**
 * What a plan actually does, in a sentence. The average GAP is what a coach reasons in — "a change
 * every eight minutes" is something you can picture; "six windows" is not.
 */
function cadenceSummary(windowSeconds: number[], total: number): string {
  const n = windowSeconds.length;
  if (n === 0) return "No changes planned — the same players all the way through.";
  const gapMinutes = Math.max(1, Math.round(total / (n + 1) / 60));
  return `${n} change${n === 1 ? "" : "s"} · roughly one every ${gapMinutes} min`;
}

/* ── the alert cue ───────────────────────────────────────────────────────── */

// One reused AudioContext (browsers cap how many you can create over a session).
let sharedAudioCtx: AudioContext | null = null;
const ALERT_SECONDS = 5;

/** A loud, ~5-second pulsing two-tone alarm so the coach can't miss a due change. */
function playAlarm(): void {
  try {
    sharedAudioCtx = sharedAudioCtx ?? new AudioContext();
    const ctx = sharedAudioCtx;
    void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square"; // harsher = more audible outdoors
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime;
    const pulse = 0.6;
    gain.gain.setValueAtTime(0.0001, t0);
    for (let i = 0; i * pulse < ALERT_SECONDS; i++) {
      const t = t0 + i * pulse;
      osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 988, t);
      gain.gain.setValueAtTime(0.22, t + 0.0005); // on
      gain.gain.setValueAtTime(0.0001, t + 0.38); // off (gap before the next pulse)
    }
    osc.start(t0);
    osc.stop(t0 + ALERT_SECONDS);
  } catch {
    // Audio blocked (no user gesture yet) — the visual cue still fires; benign.
  }
}

function alertCue(sound: boolean, vibrate: boolean): void {
  if (vibrate && typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([600, 150, 600, 150, 600, 150, 600, 150, 600, 150, 600]); // ~5s
  }
  if (sound) playAlarm();
}

/**
 * Keep the screen awake while the clock runs. On the web the in-app countdown IS the alert — there
 * are no reliable backgrounded notifications — so the page has to stay alive. Re-acquires on return
 * to the foreground; no-ops where unsupported (iOS < 16.4).
 */
function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;

    const acquire = async (): Promise<void> => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Unsupported or denied (e.g. low battery) — benign; the in-app timers still run.
      }
    };
    void acquire();

    const onVisibility = (): void => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release();
    };
  }, [active]);
}

/* ── the screen ──────────────────────────────────────────────────────────── */

export default function LiveMatchPage() {
  const params = useParams<{ teamId: string; matchId: string }>();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const matchId = typeof params.matchId === "string" ? params.matchId : "";

  const { match, live, nextChange, loading, error } = useLiveStore();
  const open = useLiveStore((s) => s.open);
  const close = useLiveStore((s) => s.close);
  const tick = useLiveStore((s) => s.tick);
  const autosave = useLiveStore((s) => s.autosave);
  const resync = useLiveStore((s) => s.resync);
  const store = useLiveStore;

  const prefs = useAppStore((s) => s.prefs);
  const teams = useAppStore((s) => s.teams);
  const saveTeam = useAppStore((s) => s.saveTeam);

  const [selected, setSelected] = useState<string | null>(null);
  // Row handlers can be invoked from a render or two ago, so the CURRENT selection is read from this
  // ref (and live state straight from the store) — reading the closed-over value gave a second tap a
  // stale null and re-selected instead of swapping.
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  const [sheet, setSheet] = useState<Recommendation | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [flashIds, setFlashIds] = useState<string[]>([]);
  const [confirmKind, setConfirmKind] = useState<"end" | "restart" | "fulltime" | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [goalOpen, setGoalOpen] = useState(false);
  // Retiring an ON-FIELD player runs through the normal sub-off flow first, so the side is never
  // left short. This remembers who to retire once that replacement is confirmed; cleared on back-out.
  const retireAfterRef = useRef<string | null>(null);
  const [shortHandedRetire, setShortHandedRetire] = useState<string | null>(null);
  const promptedRef = useRef<number | null>(null);
  const fullTimePromptedRef = useRef(false);
  const timers = useRef<number[]>([]);
  // Pre-match substitution plan (coach-editable; persisted as the live guide).
  const [planWindows, setPlanWindows] = useState<PlannedWindow[] | null>(null);
  const planSeeded = useRef(false);

  useWakeLock(live?.status === "running");

  useEffect(() => {
    void open(matchId);
    return () => {
      void autosave();
      close();
    };
  }, [matchId, open, close, autosave]);

  // 1s clock tick + ~10s autosave checkpoint while running.
  useEffect(() => {
    const t = setInterval(() => tick(), 1000);
    const a = setInterval(() => void autosave(), 10_000);
    return () => {
      clearInterval(t);
      clearInterval(a);
    };
  }, [tick, autosave]);

  // Clear any pending flash/toast timers on unmount.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => clearTimeout(id));
  }, []);

  // Back in the foreground (tab re-shown, app re-focused, BFCache restore): snap the clock to real
  // wall time at once rather than waiting for the throttled interval, which reads as a stall.
  useEffect(() => {
    const onVisible = (): void => {
      if (typeof document === "undefined" || document.visibilityState === "visible") resync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [resync]);

  const rows = useMemo(
    () => (match && live ? fairnessReport(match.config, match.players, live).rows : []),
    [match, live],
  );
  const debtById = useMemo(() => new Map(rows.map((r) => [r.playerId, r.debtSeconds])), [rows]);

  // The match log: what actually happened, newest first, straight off the event log.
  const feed = useMemo(() => (match ? buildMatchFeed(match.events) : []), [match]);
  const subsMade = useMemo(() => countActualSubs(feed), [feed]);

  /** Where everyone finishes if the rest of the plan runs: minutes on the clock now + what's ahead. */
  const liveProjection = useMemo(() => {
    if (!match || !live || live.status === "pre-match") return [];
    const totalSec = totalSeconds(match);
    const finalState = projectFromLive(match.config, match.players, live, match.subPlan ?? [], totalSec);
    return projectedRows(match.config, match.players, finalState, totalSec);
  }, [match, live]);

  // Starting lineup the plan is based on: the coach's confirmed XI, else the engine's auto-pick.
  const startingLineup = useMemo<LineupAssignment[]>(() => {
    if (!match) return [];
    const confirmed = match.startingLineup;
    return confirmed && confirmed.length === match.config.onFieldCount
      ? confirmed
      : buildPlan(match.config, match.players).startingLineup.assignments;
  }, [match]);

  // Seed the editable plan once at pre-match: the saved plan if any, else build + persist a default
  // so the live guide always exists. Edits flow back through `updatePlan` (auto-saved).
  useEffect(() => {
    if (!match || !live || live.status !== "pre-match" || planSeeded.current || startingLineup.length === 0) return;
    planSeeded.current = true;
    if (match.subPlan != null) {
      setPlanWindows(match.subPlan);
      return;
    }
    const seeded = planFromLineup(match.config, match.players, startingLineup);
    setPlanWindows(seeded);
    void store.getState().approvePlan(seeded);
  }, [match, live, startingLineup, store]);

  const updatePlan = useCallback(
    (windows: PlannedWindow[]) => {
      setPlanWindows(windows);
      void store.getState().approvePlan(windows);
    },
    [store],
  );

  // Lineup state before each planned window — the option lists in the pre-match editor are built
  // from it, and the projection below reads the state the whole plan produces.
  const planStates = useMemo<LiveState[]>(() => {
    if (!match || live?.status !== "pre-match" || !planWindows || startingLineup.length === 0) return [];
    const out: LiveState[] = [];
    for (let k = 0; k <= planWindows.length; k++) {
      out.push(stateAfterWindows(match.config, match.players, startingLineup, planWindows.slice(0, k)));
    }
    return out;
  }, [match, live?.status, planWindows, startingLineup]);

  const planProjection = useMemo(() => {
    if (!match || live?.status !== "pre-match" || !planWindows || startingLineup.length === 0) return [];
    const totalSec = totalSeconds(match);
    const final = stateAfterWindows(match.config, match.players, startingLineup, planWindows, totalSec);
    return projectedRows(match.config, match.players, final, totalSec);
  }, [match, live?.status, planWindows, startingLineup]);

  const nameOf = useCallback(
    (id: string): string => match?.players.find((p) => p.id === id)?.name ?? id,
    [match],
  );

  /**
   * The change to offer right now, from fresh state.
   *
   * Follow the approved plan first: if the pinned target matches a planned window, suggest exactly
   * that change. The window is sanitised against the LIVE state (a keep-on player is never suggested
   * off — invariant #3), so it can collapse to nothing; then — as when there's no plan, it's
   * exhausted, or the coach deviated — fall back to the live engine (also lock-aware).
   */
  const deriveSuggestion = useCallback((): Recommendation | null => {
    const { match: m, live: l, nextChange: nc } = store.getState();
    if (!m || !l) return null;
    const planned = nc ? m.subPlan?.find((w) => w.atSeconds === nc.atSeconds) : undefined;
    if (planned && planned.on.length > 0) {
      const fromPlan = recommendationFromWindow(m.config, m.players, l, planned);
      if (fromPlan.primary.length > 0) return fromPlan;
    }
    const rec = recommendSwaps(m.config, m.players, l);
    return rec.primary.length > 0 ? rec : recommendSwaps(m.config, m.players, l, { forceImmediate: true });
  }, [store]);

  const openSuggestion = useCallback(() => {
    const rec = deriveSuggestion();
    if (rec) setSheet(rec); // an empty `primary` is a real answer — the sheet says "all balanced"
  }, [deriveSuggestion]);

  // Window-due prompt: when the clock reaches the pinned target, cue + open the sheet once.
  const nextChangeAt = nextChange?.atSeconds ?? null;
  useEffect(() => {
    if (!live || live.status !== "running" || nextChangeAt === null) return;
    if (live.elapsedSeconds >= nextChangeAt && promptedRef.current !== nextChangeAt) {
      promptedRef.current = nextChangeAt;
      alertCue(prefs.sound, prefs.vibrate);
      openSuggestion();
    }
  }, [live, nextChangeAt, openSuggestion, prefs.sound, prefs.vibrate]);

  // Full time reached: don't auto-freeze — alert + ask once whether to end or play on (added time).
  useEffect(() => {
    if (!match || !live || live.status !== "running") return;
    if (live.elapsedSeconds < totalSeconds(match)) {
      fullTimePromptedRef.current = false; // re-arm (e.g. after a restart)
      return;
    }
    if (!fullTimePromptedRef.current) {
      fullTimePromptedRef.current = true;
      alertCue(prefs.sound, prefs.vibrate);
      setConfirmKind((k) => k ?? "fulltime");
    }
  }, [match, live, prefs.sound, prefs.vibrate]);

  /**
   * The change the panel prints while the clock runs.
   *
   * Recomputed on a COARSE cadence rather than every tick. When the answer comes from the engine it
   * is re-ranked by live debt, and rows that renamed themselves every second would be unreadable —
   * and untrustworthy, since the coach is asked to confirm exactly what they just read. A new pinned
   * target, a new event in the log, or fifteen seconds of play are the things that can genuinely
   * change who should come off.
   */
  const cadence =
    match && live && live.status === "running"
      ? `${nextChangeAt ?? "-"}|${match.events.length}|${Math.floor(live.elapsedSeconds / 15)}`
      : null;
  const panelRec = useMemo<Recommendation | null>(() => {
    const rec = cadence === null ? null : deriveSuggestion();
    return rec && rec.primary.length > 0 ? rec : null;
  }, [cadence, deriveSuggestion]);

  /**
   * The lineup AFTER the open suggestion's swaps (pure apply, never persisted), so the coach can see
   * what "Confirm all" leaves on the pitch before committing. Recomputes when they skip a row.
   */
  const previewState = useMemo<LiveState | null>(() => {
    if (!live || !sheet || sheet.primary.length === 0) return null;
    const off = sheet.primary.map((s) => s.playerOff).filter((id): id is string => id !== null);
    const on = sheet.primary.map((s) => ({ playerId: s.playerOn, slot: s.toSlot }));
    try {
      return applyEvent(live, {
        type: "SUB_APPLIED",
        atSeconds: live.elapsedSeconds,
        off,
        on,
        positionChanges: sheet.positionChanges,
      });
    } catch {
      return null; // invalid combo (shouldn't happen for a valid suggestion) — just skip the preview
    }
  }, [live, sheet]);

  /** Dismiss the suggestion sheet — and drop any retirement that was waiting on it. */
  const closeSheet = useCallback(() => {
    retireAfterRef.current = null;
    setSheet(null);
  }, []);

  const flash = useCallback((ids: string[]) => {
    setFlashIds(ids);
    timers.current.push(window.setTimeout(() => setFlashIds([]), 1400));
  }, []);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    timers.current.push(window.setTimeout(() => setToast(null), 2600));
  }, []);

  if (loading) {
    return (
      <main className={styles.page}>
        <Masthead slug="Live desk" back={`/teams/${teamId}`} />
        <Dateline left="Grassroots desk" right="Loading" />
        <div className={styles.gutter}>
          <p className={styles.empty}>Loading…</p>
        </div>
      </main>
    );
  }

  if (error || !match || !live) {
    return (
      <main className={styles.page}>
        <Masthead slug="Live desk" back={`/teams/${teamId}`} />
        <Dateline left="Grassroots desk" right="Story pulled" />
        <div className={styles.gutter}>
          <SectionHead red>{error ?? "Match unavailable"}</SectionHead>
          <p className={desk.body}>That match isn&apos;t on file any more.</p>
          <div style={{ marginTop: 16 }}>
            <ButtonLink href={`/teams/${teamId}`} kind="ink">
              Back to the team
            </ButtonLink>
          </div>
        </div>
      </main>
    );
  }

  /* ── derived view state ────────────────────────────────────────────────── */

  const cfg = sportOf(match.config.sport);
  const isBasketball = cfg.id === "basketball";
  const onField = Object.values(live.players).filter((p) => p.onField);
  // Players retired for the rest of the match sit in their own "Out" list, not the bench — the bench
  // is who you can bring on, and they aren't.
  const retiredPlayers = match.players.filter((p) => isRetiredAt(p, live.elapsedSeconds));
  const retiredIds = new Set(retiredPlayers.map((p) => p.id));
  const benchPlayers = match.players
    .filter((p) => !live.players[p.id]?.onField)
    .filter((p) => p.availability !== "unavailable")
    .filter((p) => !retiredIds.has(p.id));

  const total = totalSeconds(match);
  // Status band scales with match length (a fixed 4′ band would mark everything "on target" in a
  // short game).
  const statusTol = statusTolFor(total);
  const squadById = new Map(match.players.map((p) => [p.id, p]));
  const statusOf = (id: string): TokenStatus => statusFor(debtById.get(id) ?? 0, statusTol);
  const scoreOf = (lp: PlayerLiveState | undefined): number =>
    isBasketball ? (lp?.points ?? 0) : (lp?.goals ?? 0);
  const teamScore = Object.values(live.players).reduce((sum, p) => sum + scoreOf(p), 0);

  /** 🕑 late player who hasn't arrived (or played) yet. */
  const lateWaiting = (id: string): boolean => {
    const rec = squadById.get(id);
    const lp = live.players[id];
    return (
      rec?.availability === "arrives-late" &&
      (lp?.secondsOnField ?? 0) === 0 &&
      !(lp?.onField ?? false) &&
      (rec.unavailableUntilMinute ?? 0) * 60 > live.elapsedSeconds
    );
  };

  const formationLabel = (cfg.hasGoalkeeper ? PITCH_LINES : COURT_LINES)
    .map(
      (group) =>
        onField.filter((p) => p.currentSlot && p.currentSlot !== "GK" && groupOf(p.currentSlot) === group).length,
    )
    .filter((n) => n > 0)
    .join("-");

  const running = live.status === "running";
  const inExtraTime = running && live.elapsedSeconds >= total;
  const periodRemaining = remainingInPeriodSeconds(match, live);
  const pulseId = sheet?.primary[0]?.playerOff ?? panelRec?.primary[0]?.playerOff ?? null;
  // Only the windows still AHEAD — past ones are history and belong in the match report, where what
  // really happened is recorded rather than what was planned.
  const upcomingWindows = (match.subPlan ?? []).filter((w) => w.atSeconds > live.elapsedSeconds);
  const subFrequency = match.config.subFrequency ?? DEFAULT_SUB_FREQUENCY;
  const feedLabels: FeedLabels = {
    nameOf,
    slotLabel: slotShortName,
    startLabel: cfg.startLabel,
    periodLabel: cfg.periodLabel,
    breakLabel: cfg.breakLabel,
    endLabel: cfg.endLabel,
    scoreIcon: cfg.scoreIcon,
    showScoreValue: cfg.scoreOptions.length > 1,
  };
  // Snooze in progress: the countdown is pinned to the snooze end, so it reads as a snooze timeline.
  const snoozed = live.snoozedUntilSeconds != null && live.snoozedUntilSeconds > live.elapsedSeconds;

  // Countdown to the next planned change — driven by the stable pinned target (see liveStore), so it
  // counts down smoothly and doesn't jump when you leave and return.
  const remaining = nextChange !== null ? Math.max(0, nextChange.atSeconds - live.elapsedSeconds) : 0;
  const cdTotal = nextChange !== null ? Math.max(60, nextChange.atSeconds - nextChange.fromSeconds) : 60;
  const cdPct = Math.max(0, Math.min(1, remaining / cdTotal));
  const due = running && nextChange !== null && remaining <= 0;

  const selectedPlayer = selected ? live.players[selected] : null;
  // A 🕑 late player on the bench who hasn't played can be marked "arrived" at any time — before OR
  // after their estimated minute — re-anchoring their fair-share window to the real arrival.
  const selectedLate =
    selectedPlayer !== null &&
    selectedPlayer !== undefined &&
    !selectedPlayer.onField &&
    selectedPlayer.secondsOnField === 0 &&
    squadById.get(selectedPlayer.playerId)?.availability === "arrives-late";

  const team = teams.find((t) => t.id === teamId) ?? null;
  const rosterNotInSquad = (team?.roster ?? []).filter((p) => !squadById.has(p.id));

  /* ── actions ───────────────────────────────────────────────────────────── */

  async function addExistingPlayer(p: Player): Promise<void> {
    setAddOpen(false);
    await store.getState().addPlayerToMatch(p);
    showToast(`${p.name} joined the squad`);
  }

  async function addNewPlayer(): Promise<void> {
    const name = newName.trim();
    if (name.length === 0) return;
    const player: Player = {
      id: newId(),
      name,
      eligiblePositions: isBasketball ? ["G", "F", "C"] : ["DEF", "MID", "FWD"],
      preferredPositions: [],
      canPlayGK: false,
      minutesWeight: 1,
    };
    setAddOpen(false);
    setNewName("");
    await store.getState().addPlayerToMatch(player);
    // Save to the team roster too, so they're pickable in future matches.
    if (team) await saveTeam({ ...team, roster: [...team.roster, player] });
    showToast(`${name} joined the squad`);
  }

  /**
   * Move the rotation dial and rebuild the plan around it. Pre-match the timeline lives in component
   * state (seeded once), so the regenerated plan is pulled back in — otherwise the coach would move
   * the dial and still see the old windows.
   */
  async function changeSubFrequency(level: number): Promise<void> {
    await store.getState().setSubFrequency(level);
    const next = store.getState().match?.subPlan;
    if (next) setPlanWindows(next);
  }

  function logScore(playerId: string, points: number): void {
    void store.getState().logGoal(playerId, points);
    flash([playerId]);
    showToast(
      cfg.scoreOptions.length > 1
        ? `${cfg.scoreIcon} ${points} pt · ${nameOf(playerId)}`
        : `${cfg.scoreIcon} ${cfg.scoreLabel} · ${nameOf(playerId)}`,
    );
    setSelected(null);
    setGoalOpen(false);
  }

  /**
   * Retire a player for the rest of the match. Off the bench it's immediate. On the pitch it can't
   * be — the side would silently drop below its on-field count — so it runs through the normal
   * replacement flow first and the retirement lands once that sub is confirmed. With an empty bench
   * there IS no replacement, which is a real touchline situation (an injury with no subs left), so
   * the coach is asked to confirm playing a player short rather than being blocked.
   */
  function startRetire(playerId: string): void {
    setSelected(null);
    // Fresh state only — this can run from a stale row closure (see handleSelect).
    const { match: matchNow, live: liveNow } = store.getState();
    if (!matchNow || !liveNow) return;
    if (!liveNow.players[playerId]?.onField) {
      void store.getState().retirePlayer(playerId);
      showToast(`${nameOf(playerId)} is out for the rest of the match`);
      return;
    }
    const rec = recommendSwaps(matchNow.config, matchNow.players, liveNow, { forceOff: [playerId] });
    if (rec.primary.length === 0) {
      setShortHandedRetire(playerId); // no one to bring on — confirm playing a player down
      return;
    }
    retireAfterRef.current = playerId;
    setSheet(rec);
  }

  /** Take the player off with no replacement and retire them — the team plays one short. */
  async function retireShortHanded(playerId: string): Promise<void> {
    setShortHandedRetire(null);
    await store.getState().manualSwap([playerId], []);
    await store.getState().retirePlayer(playerId);
    showToast(`${nameOf(playerId)} is out — you're a player short`);
  }

  /** Tap one player to select, a second to swap them (pitch↔pitch = positions, bench↔pitch = a sub). */
  function handleSelect(id: string): void {
    const liveNow = store.getState().live;
    const sel = selectedRef.current;
    if (!liveNow) return;
    if (sel === null) {
      setSelected(id);
      return;
    }
    if (sel === id) {
      setSelected(null);
      return;
    }
    const a = liveNow.players[sel];
    const b = liveNow.players[id];
    setSelected(null);
    if (!a || !b) return;
    const aSlot = a.currentSlot;
    const bSlot = b.currentSlot;
    if (a.onField && b.onField && aSlot && bSlot) {
      void store.getState().confirmSwaps(
        [],
        [
          { playerId: a.playerId, fromSlot: aSlot, toSlot: bSlot },
          { playerId: b.playerId, fromSlot: bSlot, toSlot: aSlot },
        ],
      );
    } else if (a.onField && !b.onField && aSlot) {
      void store.getState().manualSwap([a.playerId], [{ playerId: b.playerId, slot: aSlot }]);
      flash([b.playerId]);
      showToast(`Sub made · ${nameOf(b.playerId)} on`);
    } else if (b.onField && !a.onField && bSlot) {
      void store.getState().manualSwap([b.playerId], [{ playerId: a.playerId, slot: bSlot }]);
      flash([a.playerId]);
      showToast(`Sub made · ${nameOf(a.playerId)} on`);
    }
  }

  /**
   * Move the selected on-field player to a specific slot — no swap partner needed, the formation
   * simply reshapes. Complements tap-two swapping for the "move someone elsewhere" case.
   */
  function moveSelectedTo(toSlot: PositionSlot): void {
    const liveNow = store.getState().live;
    const sel = selectedRef.current;
    if (!liveNow || !sel) return;
    const p = liveNow.players[sel];
    if (!p || !p.onField || !p.currentSlot || p.currentSlot === toSlot) return;
    setSelected(null);
    void store.getState().confirmSwaps([], [{ playerId: p.playerId, fromSlot: p.currentSlot, toSlot }]);
    flash([p.playerId]);
    showToast(`${nameOf(p.playerId)} → ${slotShortName(toSlot)}`);
  }

  /**
   * Apply a suggestion ONE SWAP AT A TIME, ~1.5s apart, so the coach watches each change land rather
   * than the whole squad rearranging at once. Subs are like-for-like, so each swap stands alone.
   */
  async function confirmSheet(rec: Recommendation): Promise<void> {
    const swaps = rec.primary;
    setSheet(null);
    // A retirement waiting on this sub is applied AFTER the swaps land. The live store serialises
    // commits, so awaiting the loop guarantees the player is off the field before they're retired —
    // the store then refuses any retirement of an on-field player as a second line of defence.
    const retiring = retireAfterRef.current;
    retireAfterRef.current = null;
    if (swaps.length === 0) return;
    for (let i = 0; i < swaps.length; i++) {
      const s = swaps[i];
      if (!s) continue;
      // Position changes (only ever GK-policy ones) ride with the first swap.
      await store.getState().confirmSwaps([s], i === 0 ? rec.positionChanges : []);
      flash([s.playerOn]);
      showToast(`${nameOf(s.playerOn)} on${s.playerOff ? ` · ${nameOf(s.playerOff)} off` : ""}`);
      if (i < swaps.length - 1) {
        await new Promise<void>((resolve) => {
          timers.current.push(window.setTimeout(resolve, 1500));
        });
      }
    }
    if (swaps.length > 1) showToast(`✓ ${swaps.length} subs made`);
    if (retiring) {
      await store.getState().retirePlayer(retiring);
      showToast(`${nameOf(retiring)} is out for the rest of the match`);
    }
  }

  /* ── pre-match plan edits (each keeps the prefix; the engine re-plans the rest) ──
     Arrow consts, not declarations: a hoisted `function` loses the `match`/`live` narrowing above. */

  const retime = (i: number, deltaSec: number): void => {
    const windows = planWindows;
    const w = windows?.[i];
    if (!windows || !w) return;
    const prev = windows[i - 1];
    const nextW = windows[i + 1];
    const lo = (prev ? prev.atSeconds : 0) + 60;
    const hi = (nextW ? nextW.atSeconds : total) - 60;
    const at = Math.max(lo, Math.min(hi, w.atSeconds + deltaSec));
    if (at === w.atSeconds) return;
    const edited = [...windows];
    edited[i] = { ...w, atSeconds: at };
    updatePlan(replanAfter(match.config, match.players, startingLineup, edited, i + 1));
  };

  const removeWindow = (i: number): void => {
    // A literal delete (re-planning would just have the engine re-add an equivalent change);
    // sanitizePlan rewrites what's left so it stays valid.
    if (!planWindows) return;
    updatePlan(
      sanitizePlan(match.config, match.players, startingLineup, planWindows.filter((_, k) => k !== i)),
    );
  };

  const addWindow = (): void => {
    const windows = planWindows ?? [];
    const marks = [0, ...windows.map((w) => w.atSeconds), total];
    let gapIdx = 0;
    let gapLen = -1;
    for (let i = 0; i < marks.length - 1; i++) {
      const a = marks[i];
      const b = marks[i + 1];
      if (a === undefined || b === undefined) continue;
      if (b - a > gapLen) {
        gapLen = b - a;
        gapIdx = i;
      }
    }
    const a = marks[gapIdx];
    const b = marks[gapIdx + 1];
    if (a === undefined || b === undefined) return;
    const at = Math.round((a + b) / 2);
    const before = windows.filter((w) => w.atSeconds < at);
    const nw = suggestWindowAt(match.config, match.players, startingLineup, before, at);
    if (!nw) return;
    const merged = [...windows, nw].sort((x, y) => x.atSeconds - y.atSeconds);
    updatePlan(replanAfter(match.config, match.players, startingLineup, merged, merged.indexOf(nw) + 1));
  };

  const changeSwap = (i: number, swapIdx: number, field: "off" | "on", playerId: string): void => {
    const windows = planWindows;
    const w = windows?.[i];
    const before = planStates[i];
    if (!windows || !w || !before) return;
    const off = [...w.off];
    const on = w.on.map((o) => ({ ...o }));
    const cur = on[swapIdx];
    if (field === "off") {
      off[swapIdx] = playerId;
      const slot = before.players[playerId]?.currentSlot ?? cur?.slot;
      if (cur && slot) on[swapIdx] = { ...cur, slot };
    } else if (cur) {
      on[swapIdx] = { ...cur, playerId };
    }
    const edited = [...windows];
    edited[i] = { ...w, off, on, positionChanges: [] }; // manual edit → a straight swap, no chained moves
    updatePlan(replanAfter(match.config, match.players, startingLineup, edited, i + 1));
  };

  /* ── row renderers ─────────────────────────────────────────────────────── */

  const squadRow = (id: string, opts: { pitch: boolean; last: boolean }) => {
    const lp = live.players[id];
    const score = scoreOf(lp);
    const slot = lp?.currentSlot ?? null;
    const locked = lp?.locked ?? false;
    const frozen = live.status === "full-time";
    return (
      <button
        key={id}
        type="button"
        disabled={frozen}
        onClick={() => handleSelect(id)}
        aria-pressed={selected === id}
        className={cx(
          desk.squadRow,
          opts.last && desk.squadRowLast,
          selected === id && desk.squadRowSel,
          flashIds.includes(id) && desk.squadRowFlash,
          pulseId === id && desk.squadRowPulse,
        )}
      >
        <span className={desk.rowName}>
          {opts.pitch && slot === "GK" ? "🧤 " : ""}
          {!opts.pitch && lateWaiting(id) ? "🕑 " : ""}
          {nameOf(id)}
          {locked ? " 🔒" : ""}{" "}
          {opts.pitch && slot && slot !== "GK" && <span className={desk.rowSlot}>{slotShortName(slot)}</span>}{" "}
          {score > 0 && (
            <span className={desk.rowScore}>
              {cfg.scoreIcon}
              {score > 1 ? ` ${score}` : ""}
            </span>
          )}
        </span>
        <span className={desk.rowMins}>{mins(lp?.secondsOnField ?? 0)}</span>
        <span className={desk.rowStatus}>
          <Status kind={statusOf(id)} />
        </span>
      </button>
    );
  };

  /** One line of the panel's suggestion: who goes off, who comes on, into which position. */
  const swapLine = (offId: string | null, onId: string, slot: PositionSlot, onTap: () => void) => (
    <button key={onId} type="button" className={desk.swapRow} onClick={onTap}>
      {offId && <span className={desk.swapOff}>{nameOf(offId)} ▼ off</span>}
      {offId && <span className={desk.swapArrow}>→</span>}
      <span>{nameOf(onId)} ▲ on</span>
      <span className={desk.swapPos}>{slotFullName(slot)}</span>
    </button>
  );

  /** The rotation dial — how much rotation the coach wants to run to buy fairness. */
  const rotationDial = (summary: string, note: string) => {
    return (
      <div className={desk.dialWrap}>
        <div className={desk.dialHead}>
          <span className={styles.label}>How often to change players</span>
          <span className={desk.dialLevel}>{levelLabel(subFrequency)}</span>
        </div>
        <input
          type="range"
          className={desk.dial}
          min={1}
          max={MAX_LEVEL}
          step={1}
          value={Math.min(MAX_LEVEL, Math.max(1, Math.round(subFrequency)))}
          aria-label="How often to change players"
          aria-valuetext={`${levelLabel(subFrequency)} — ${summary}`}
          onChange={(e) => void changeSubFrequency(Number(e.target.value))}
        />
        <div className={desk.dialEnds} aria-hidden>
          <span>Fewer · longer stints</span>
          <span>More · shorter stints</span>
        </div>
        <p className={desk.caption}>{summary}</p>
        <p className={desk.body}>{note}</p>
      </div>
    );
  };

  /* ── PRE-MATCH — the team sheet ────────────────────────────────────────── */

  if (live.status === "pre-match") {
    const windows = planWindows ?? [];
    const benchFirst = match.players.filter(
      (p) => !startingLineup.some((a) => a.playerId === p.id) && p.availability !== "unavailable",
    );
    return (
      <main className={styles.page} style={{ display: "flex", flexDirection: "column", paddingBottom: 0 }}>
        <Masthead slug="Team sheet" back={`/teams/${teamId}`} />
        <Dateline
          left={`${match.config.onFieldCount}${cfg.formatSuffix} · ${match.config.periods}×${match.config.periodLengthMinutes}′`}
          right={`${match.players.length} named`}
        />

        <div className={cx(styles.gutter, desk.grow)}>
          <SectionHead>{match.name}</SectionHead>
          <p className={desk.body}>
            Review the planned changes — retime them, swap who&apos;s involved, or add and remove one.
            The projected minutes below update as you edit. Tap <strong>{cfg.startLabel}</strong> when
            you&apos;re happy; the match follows this as a guide, and you can change any of it live.
          </p>

          <SectionHead small>Rotation</SectionHead>
          {rotationDial(
            cadenceSummary(windows.map((w) => w.atSeconds), total),
            "The whole plan below rebuilds as you move this — check the projected minutes to see what it costs.",
          )}

          {/* Renders its own section head — the plan and the live screen must show one card. */}
          <ProjectedMinutes
            rows={planProjection}
            caption="if the plan runs"
            footnote="retime or edit the changes below to shift it"
          />

          <SectionHead>The changes</SectionHead>
          {windows.length === 0 ? (
            <p className={desk.empty}>No changes planned — everyone plays the whole match.</p>
          ) : (
            <div className={desk.winList}>
              {windows.map((w, i) => {
                const before = planStates[i];
                if (!before) return null;
                const onFieldBefore = Object.values(before.players).filter(
                  (p) => p.onField && p.currentSlot !== "GK",
                );
                const benchIdsBefore = match.players
                  .map((p) => p.id)
                  .filter(
                    (id) =>
                      !before.players[id]?.onField && squadById.get(id)?.availability !== "unavailable",
                  );
                return (
                  <div key={`${w.atSeconds}-${i}`} className={cx(styles.box, styles.boxThin)}>
                    <div className={desk.winHead}>
                      <button
                        type="button"
                        className={desk.winStep}
                        aria-label={`Change ${i + 1} two minutes earlier`}
                        onClick={() => retime(i, -120)}
                      >
                        −
                      </button>
                      <span className={desk.winTime}>
                        {countdown(w.atSeconds)} · {cfg.periodLabel.charAt(0)}
                        {Math.min(match.config.periods, Math.floor(w.atSeconds / (match.config.periodLengthMinutes * 60)) + 1)}
                      </span>
                      <button
                        type="button"
                        className={desk.winStep}
                        aria-label={`Change ${i + 1} two minutes later`}
                        onClick={() => retime(i, 120)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className={desk.winStep}
                        aria-label={`Remove change ${i + 1}`}
                        onClick={() => removeWindow(i)}
                      >
                        ✕
                      </button>
                    </div>
                    {w.on.map((onEntry, si) => {
                      const offId = w.off[si];
                      return (
                        <div key={si}>
                          <div className={desk.winSwap}>
                            <span className={desk.winLabel}>Off</span>
                            <select
                              aria-label={`Player off in change ${i + 1}`}
                              value={offId ?? ""}
                              onChange={(e) => changeSwap(i, si, "off", e.target.value)}
                            >
                              {offId && !onFieldBefore.some((p) => p.playerId === offId) && (
                                <option value={offId}>{nameOf(offId)}</option>
                              )}
                              {onFieldBefore.map((p) => (
                                <option key={p.playerId} value={p.playerId}>
                                  {nameOf(p.playerId)}
                                  {p.currentSlot ? ` (${slotShortName(p.currentSlot)})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className={desk.winSwap}>
                            <span className={desk.winLabel}>On</span>
                            <select
                              aria-label={`Player on in change ${i + 1}`}
                              value={onEntry.playerId}
                              onChange={(e) => changeSwap(i, si, "on", e.target.value)}
                            >
                              {!benchIdsBefore.includes(onEntry.playerId) && (
                                <option value={onEntry.playerId}>{nameOf(onEntry.playerId)}</option>
                              )}
                              {benchIdsBefore.map((id) => (
                                <option key={id} value={id}>
                                  {nameOf(id)}
                                </option>
                              ))}
                            </select>
                            <span className={desk.winSlot}>{slotFullName(onEntry.slot)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <Button kind="outline" small auto onClick={addWindow}>
              + Add a change
            </Button>
          </div>

          <SectionHead>Starting {match.config.onFieldCount}</SectionHead>
          <div>
            {startingLineup.map((a, i) => (
              <div
                key={a.playerId}
                className={cx(desk.squadRow, i === startingLineup.length - 1 && desk.squadRowLast)}
              >
                <span className={desk.rowName}>
                  {a.slot === "GK" ? "🧤 " : ""}
                  {nameOf(a.playerId)}
                </span>
                <span className={desk.rowSlot}>{slotFullName(a.slot)}</span>
              </div>
            ))}
          </div>

          <SectionHead red>Bench</SectionHead>
          {benchFirst.length === 0 ? (
            <p className={desk.empty}>No substitutes — everyone starts.</p>
          ) : (
            <div>
              {benchFirst.map((p, i) => {
                const on = windows.find((w) => w.on.some((o) => o.playerId === p.id));
                return (
                  <div
                    key={p.id}
                    className={cx(desk.squadRow, i === benchFirst.length - 1 && desk.squadRowLast)}
                  >
                    <span className={desk.rowName}>
                      {p.availability === "arrives-late" ? "🕑 " : ""}
                      {p.name}
                    </span>
                    <span className={desk.rowSlot}>
                      {on ? `on @ ${Math.round(on.atSeconds / 60)}′` : "not planned in"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <p className={desk.footnote}>Late arrival? Mark them in — the plan rebuilds.</p>
        </div>

        <div className={cx(styles.actionBar, desk.barCol)}>
          <Button kind="red" onClick={() => void store.getState().kickOff()}>
            {cfg.startLabel} ▶
          </Button>
          <p className={cx(desk.footnote, desk.footnoteBar)}>Nothing is final · change any of it live</p>
        </div>
      </main>
    );
  }

  /* ── LIVE / FULL TIME ──────────────────────────────────────────────────── */

  const bugText = (() => {
    const period = `${cfg.periodLabel.charAt(0)}${live.period} of ${match.config.periods}`;
    if (live.status === "full-time") return cfg.endLabel;
    if (live.status === "period-break") return cfg.breakLabel;
    if (inExtraTime) return `Added time · ${period}`;
    return `${running ? "Live" : "Paused"} · ${period}`;
  })();

  const clockAction = running
    ? { label: "Pause the clock", text: "⏸ Hold", run: () => void store.getState().pause() }
    : live.status === "paused"
      ? { label: "Resume the clock", text: "▶ Play", run: () => void store.getState().resume() }
      : null;

  return (
    <main className={styles.page} style={{ display: "flex", flexDirection: "column", paddingBottom: 0 }}>
      <header className={styles.liveHeader}>
        <div className={desk.liveTop}>
          <span className={desk.liveBrand}>
            <Link href={`/teams/${teamId}`} className={desk.liveBack} aria-label="Back to the team">
              ←
            </Link>
            <Wordmark />
          </span>
          <span className={styles.liveBug}>
            <span className={cx(styles.liveDot, !running && desk.liveDotOff)} aria-hidden />
            {bugText}
          </span>
        </div>
        <div className={desk.clockRow}>
          <span
            className={styles.clock}
            aria-label={`${Math.floor(live.elapsedSeconds / 60)} minutes played`}
          >
            {clockTime(live.elapsedSeconds)}
          </span>
          {/* Basketball's period clock runs DOWN, and that's the number everyone is watching —
              but elapsed still leads, because minutes PLAYED is what this app is about. */}
          {cfg.clockCountsDown && (
            <span
              className={desk.clockAside}
              aria-label={`${Math.floor(periodRemaining / 60)} minutes left in ${cfg.periodLabel.toLowerCase()} ${live.period}`}
            >
              <span className={desk.clockAsideValue}>{clockTime(periodRemaining)}</span>
              <span className={desk.clockAsideLabel}>left in {cfg.periodLabel}</span>
            </span>
          )}
          <span className={desk.spacer} />
          {clockAction && (
            <button
              type="button"
              className={cx(styles.holdBtn, desk.holdCaps)}
              onClick={clockAction.run}
              aria-label={clockAction.label}
            >
              {clockAction.text}
            </button>
          )}
        </div>
      </header>

      <Dateline
        left={`${match.name} · ${match.config.onFieldCount}${cfg.formatSuffix}${formationLabel ? ` · ${formationLabel}` : ""}`}
        right={teamScore > 0 ? `${cfg.scoreIcon} ${teamScore}` : `${subsMade} sub${subsMade === 1 ? "" : "s"}`}
      />

      <div className={cx(styles.gutter, desk.grow)}>
        {/* NEXT CHANGE — the pinned countdown and, when the plan names one, the change itself. */}
        {running && nextChange !== null && (
          <div className={cx(styles.box, styles.boxWhite, desk.panel)}>
            <div className={desk.panelHead}>
              <span className={desk.panelTitle}>
                {snoozed ? "Snoozed — back in" : due ? "Change due now" : "Next change"}
              </span>
              <span className={desk.panelCount}>{due ? "NOW" : countdown(remaining)}</span>
            </div>
            <div className={desk.progress}>
              <div className={desk.progressFill} style={{ width: `${due ? 100 : cdPct * 100}%` }} />
            </div>

            {panelRec ? (
              <>
                <div className={desk.swaps}>
                  {panelRec.primary.map((s) => swapLine(s.playerOff, s.playerOn, s.toSlot, openSuggestion))}
                </div>
                <div className={desk.panelBtns}>
                  <Button kind="ink" small onClick={() => void confirmSheet(panelRec)}>
                    {panelRec.primary.length > 1
                      ? `Confirm all (${panelRec.primary.length})`
                      : "Confirm change"}
                  </Button>
                  <button
                    type="button"
                    className={desk.snoozeBtn}
                    onClick={() => void store.getState().snooze(1)}
                  >
                    ⏱ Snooze 1′
                  </button>
                </div>
                {panelRec.note && <p className={desk.body}>{panelRec.note}</p>}
                <p className={desk.footnote}>Tap a row to edit · it never subs by itself</p>
              </>
            ) : (
              <>
                <div className={desk.panelBtns}>
                  <Button kind="ink" small onClick={openSuggestion}>
                    ⇄ See the suggestion
                  </Button>
                  <button
                    type="button"
                    className={desk.snoozeBtn}
                    onClick={() => void store.getState().snooze(1)}
                  >
                    ⏱ Snooze 1′
                  </button>
                </div>
                <p className={desk.footnote}>Nothing is applied until you confirm it</p>
              </>
            )}
          </div>
        )}

        {/* Half time / period break */}
        {live.status === "period-break" && (
          <div className={cx(styles.box, desk.panel)}>
            <span className={desk.panelTitle}>{cfg.breakLabel}</span>
            <p className={desk.body}>
              Behind on minutes:{" "}
              {rows
                .filter((r) => r.eligible && r.debtSeconds > 60)
                .sort((x, y) => y.debtSeconds - x.debtSeconds)
                .slice(0, 3)
                .map((r) => nameOf(r.playerId))
                .join(", ") || "everyone's even"}
            </p>
            <div style={{ marginTop: 12 }}>
              <Button kind="red" small onClick={() => void store.getState().startNextPeriod()}>
                Start {cfg.periodLabel} {live.period + 1}
              </Button>
            </div>
          </div>
        )}

        {/* Full time */}
        {live.status === "full-time" && (
          <div className={cx(styles.box, desk.panel)}>
            <span className={desk.panelTitle}>{cfg.endLabel}</span>
            <p className={desk.body}>
              Every minute is on the record. The final edition has the box score, the fairness spread
              and each player&apos;s report.
            </p>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <ButtonLink href={`/teams/${teamId}/match/${matchId}/review`} kind="red" small>
                Read the final edition →
              </ButtonLink>
              <Button kind="outline" small onClick={() => setConfirmKind("restart")}>
                Restart match
              </Button>
            </div>
          </div>
        )}

        <SectionHead>On the {cfg.surfaceLabel.toLowerCase()}</SectionHead>
        <div>
          {onField.map((p, i) => squadRow(p.playerId, { pitch: true, last: i === onField.length - 1 }))}
        </div>

        <SectionHead red>Bench</SectionHead>
        {benchPlayers.length === 0 ? (
          <p className={desk.empty}>Nobody on the bench.</p>
        ) : (
          <div>
            {benchPlayers.map((p, i) =>
              squadRow(p.id, { pitch: false, last: i === benchPlayers.length - 1 }),
            )}
          </div>
        )}

        {/* Out for the match — visible, not hidden away, so the coach can see who they've lost and
            put anyone back if they're fit again. */}
        {retiredPlayers.length > 0 && (
          <>
            <SectionHead red small>
              🚑 Out for the match
            </SectionHead>
            <div className={desk.outList}>
              {retiredPlayers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={desk.outBtn}
                  aria-label={`Bring ${p.name} back into the rotation`}
                  disabled={live.status === "full-time"}
                  onClick={() => {
                    void store.getState().unretirePlayer(p.id);
                    showToast(`${p.name} is back in the rotation`);
                  }}
                >
                  ↩ {p.name}{" "}
                  <span className={desk.outMins}>· {mins(live.players[p.id]?.secondsOnField ?? 0)}</span>
                </button>
              ))}
            </div>
            <p className={desk.footnote}>
              Their minutes are shared out among everyone still playing · tap to bring one back
            </p>
          </>
        )}

        {live.status !== "full-time" && (
          <div style={{ marginTop: 14 }}>
            <Button kind="outline" small auto onClick={() => setAddOpen(true)}>
              + Add player
            </Button>
          </div>
        )}

        {/* What ACTUALLY happened. Open by default and above the plan: mid-match this is the question
            the coach is asking — the plan is a forecast, this is the record. */}
        {feed.length > 0 && (
          <details className={desk.details} open>
            <summary className={desk.detailsHead}>
              <span>Match report</span>
              <span className={desk.detailsMark}>
                <span className={desk.detailsMarkOpen}>▾</span>
                <span className={desk.detailsMarkClosed}>▸</span>
              </span>
            </summary>
            <p className={desk.caption}>
              {subsMade} sub{subsMade === 1 ? "" : "s"} made
            </p>
            <div>
              {feed.map((e, i) => {
                const wall = wallClockLabel(e.wallClockISO);
                return (
                  <div key={e.key} className={cx(desk.logRow, i === feed.length - 1 && desk.logRowLast)}>
                    <span className={desk.logTime}>{clockTime(e.atSeconds)}</span>
                    <span className={desk.logText}>{feedLineText(e, feedLabels)}</span>
                    {wall && <span className={desk.logClock}>{wall}</span>}
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {/* The plan from here on — only what's still ahead, so it can never be mistaken for a record
            of what was done. Plus the rotation dial, which re-plans these windows live. */}
        {live.status !== "full-time" && (
          <details className={desk.details}>
            <summary className={desk.detailsHead}>
              <span>Still to come</span>
              <span className={desk.detailsMark}>
                <span className={desk.detailsMarkOpen}>▾</span>
                <span className={desk.detailsMarkClosed}>▸</span>
              </span>
            </summary>
            <p className={desk.caption}>
              {upcomingWindows.length} change{upcomingWindows.length === 1 ? "" : "s"} still to come
            </p>
            {upcomingWindows.length === 0 ? (
              <p className={desk.empty}>Nothing more scheduled — ask for a change whenever you want one.</p>
            ) : (
              <div>
                {upcomingWindows.map((w, i) => (
                  <div
                    key={w.atSeconds}
                    className={cx(desk.planRow, i === upcomingWindows.length - 1 && desk.planRowLast)}
                  >
                    <span className={cx(desk.planTime, nextChange?.atSeconds === w.atSeconds && desk.planNext)}>
                      {clockTime(w.atSeconds)}
                    </span>
                    <span className={desk.planText}>
                      {w.on.map((o, k) => `${nameOf(w.off[k] ?? "")} → ${nameOf(o.playerId)}`).join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {rotationDial(
              cadenceSummary(upcomingWindows.map((w) => w.atSeconds), total),
              "Changes already made stay as they are — only what's ahead is re-planned.",
            )}
            {/* Where everyone LANDS: minutes played plus what the remaining plan adds. Same card as
                before kick-off, so moving the dial mid-match shows its cost the same way. */}
            <ProjectedMinutes
              rows={liveProjection}
              caption="played + still planned"
              footnote="move the dial above, or make a change yourself"
            />
          </details>
        )}

        {/* End / restart live under the tables rather than in the sticky bar: they're the two things
            you must never hit by accident. */}
        {live.status !== "full-time" && (
          <>
            <SectionHead small>Match control</SectionHead>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Button kind="outline" small onClick={() => setConfirmKind("restart")}>
                Restart
              </Button>
              <Button kind="red" small onClick={() => setConfirmKind("end")}>
                End match
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Sticky actions. With a player selected this becomes their action desk, so tap-two-to-swap
          still works — the selection survives, because nothing here is a modal. */}
      {live.status !== "full-time" && (
        <div className={cx(styles.actionBar, desk.barCol)}>
          {selectedPlayer ? (
            <>
              <div className={desk.selHead}>
                <span>{nameOf(selectedPlayer.playerId)}</span>
                <span className={desk.selSlot}>
                  {selectedPlayer.onField
                    ? selectedPlayer.currentSlot
                      ? slotFullName(selectedPlayer.currentSlot)
                      : "on"
                    : "bench"}
                </span>
              </div>

              {/* Basketball: a score is worth 1, 2 or 3, so the coach has to say which. */}
              {selectedPlayer.onField && cfg.scoreOptions.length > 1 && (
                <div className={desk.chipRow}>
                  <span className={styles.label}>{cfg.scoreLabel}</span>
                  {cfg.scoreOptions.map((pts) => (
                    <button
                      key={pts}
                      type="button"
                      className={desk.chip}
                      aria-label={`${nameOf(selectedPlayer.playerId)} scored ${pts} point${pts === 1 ? "" : "s"}`}
                      onClick={() => logScore(selectedPlayer.playerId, pts)}
                    >
                      {cfg.scoreIcon} {pts} pt
                    </button>
                  ))}
                </div>
              )}

              {/* Move to any position — one tap, no swap partner needed. */}
              {selectedPlayer.onField && selectedPlayer.currentSlot && (
                <div className={desk.chipRow}>
                  <span className={styles.label}>Move to</span>
                  {cfg.moveTargets.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      className={cx(desk.chip, selectedPlayer.currentSlot === slot && desk.chipOn)}
                      disabled={selectedPlayer.currentSlot === slot}
                      aria-label={`Move ${nameOf(selectedPlayer.playerId)} to ${slotFullName(slot)}`}
                      onClick={() => moveSelectedTo(slot)}
                    >
                      {slotShortName(slot)}
                    </button>
                  ))}
                </div>
              )}

              <div className={desk.actionGrid}>
                {selectedLate && (
                  <button
                    type="button"
                    className={cx(desk.miniBtn, desk.miniBtnInk)}
                    onClick={() => {
                      const id = selectedPlayer.playerId;
                      void store.getState().markArrived(id);
                      showToast(`🕑 ${nameOf(id)} is here — in the rotation now`);
                      setSelected(null);
                    }}
                  >
                    🕑 Arrived
                  </button>
                )}
                {selectedPlayer.onField && (
                  <button
                    type="button"
                    className={desk.miniBtn}
                    onClick={() => {
                      void store.getState().toggleLock(selectedPlayer.playerId);
                      setSelected(null);
                    }}
                  >
                    {selectedPlayer.locked ? "🔓 Release" : "🔒 Keep on"}
                  </button>
                )}
                {/* One-value sports log a score in a single tap; 1/2/3 sports get the row above. */}
                {selectedPlayer.onField && cfg.scoreOptions.length === 1 && (
                  <button
                    type="button"
                    className={desk.miniBtn}
                    onClick={() => logScore(selectedPlayer.playerId, cfg.scoreOptions[0] ?? 1)}
                  >
                    {cfg.scoreIcon} {cfg.scoreLabel}
                  </button>
                )}
                {selectedPlayer.onField && (
                  <button
                    type="button"
                    className={cx(desk.miniBtn, desk.miniBtnInk)}
                    onClick={() => {
                      setSheet(
                        recommendSwaps(match.config, match.players, live, {
                          forceOff: [selectedPlayer.playerId],
                        }),
                      );
                      setSelected(null);
                    }}
                  >
                    Sub off →
                  </button>
                )}
                <button
                  type="button"
                  className={cx(desk.miniBtn, desk.miniBtnRed)}
                  onClick={() => startRetire(selectedPlayer.playerId)}
                >
                  🚑 Out
                </button>
                <button type="button" className={desk.miniBtn} onClick={() => setSelected(null)}>
                  Cancel
                </button>
              </div>
              <p className={cx(desk.footnote, desk.footnoteBar)}>
                {selectedPlayer.onField
                  ? "Tap another player to swap · tap a bench player to sub them on"
                  : "Now tap a player on the pitch to bring this one on in their place"}
              </p>
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <Button kind="outline" small onClick={() => setGoalOpen(true)}>
                  {cfg.scoreIcon} {cfg.scoreLabel}
                </Button>
                <Button kind="outline" small onClick={openSuggestion}>
                  ⇄ Sub now
                </Button>
              </div>
              <p className={cx(desk.footnote, desk.footnoteBar)}>
                Tap a player for their actions · tap two to swap
              </p>
            </>
          )}
        </div>
      )}

      {toast && <Toast message={toast} />}

      {/* Suggested change — editable, skippable, never automatic. */}
      {sheet && (
        <Sheet onClose={closeSheet}>
          {sheet.primary.length === 0 ? (
            <>
              <h2 className={desk.sheetTitle}>All balanced</h2>
              <p className={desk.body}>Squad&apos;s even on minutes — no change needed right now.</p>
            </>
          ) : (
            <>
              <h2 className={desk.sheetTitle}>
                {sheet.primary.length > 1 ? `${sheet.primary.length} suggested changes` : "Suggested change"}
              </h2>
              <p className={desk.body}>Keeps minutes fair. You&apos;re in control — edit or skip any.</p>

              <div className={desk.swaps}>
                {sheet.primary.map((s, i) => (
                  <div key={s.playerOn} className={desk.swapRow}>
                    {s.playerOff && <span className={desk.swapOff}>{nameOf(s.playerOff)} ▼ off</span>}
                    {s.playerOff && <span className={desk.swapArrow}>→</span>}
                    <span>{nameOf(s.playerOn)} ▲ on</span>
                    <span className={desk.swapPos}>{slotFullName(s.toSlot)}</span>
                    {sheet.primary.length > 1 && (
                      <button
                        type="button"
                        className={desk.skipBtn}
                        aria-label={`Skip subbing ${nameOf(s.playerOn)}`}
                        onClick={() =>
                          setSheet({ ...sheet, primary: sheet.primary.filter((_, j) => j !== i) })
                        }
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* What confirming leaves on the pitch — the effect before the commit. */}
              {previewState && (
                <>
                  <SectionHead small>After the change</SectionHead>
                  <div>
                    {Object.values(previewState.players)
                      .filter((p) => p.onField)
                      .map((p) => {
                        const incoming = sheet.primary.some((s) => s.playerOn === p.playerId);
                        return (
                          <div key={p.playerId} className={desk.previewRow}>
                            <span className={incoming ? desk.previewIn : undefined}>
                              {p.currentSlot === "GK" ? "🧤 " : ""}
                              {nameOf(p.playerId)}
                            </span>
                            <span className={desk.previewTag}>
                              {incoming ? "▲ coming on · " : ""}
                              {p.currentSlot ? slotFullName(p.currentSlot) : ""}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}

              {sheet.note && <p className={desk.body}>{sheet.note}</p>}
              <div className={desk.sheetStack}>
                <Button kind="ink" onClick={() => void confirmSheet(sheet)}>
                  {sheet.primary.length > 1 ? `Confirm all (${sheet.primary.length})` : "Confirm sub"}
                </Button>
              </div>
            </>
          )}
          <div className={desk.sheetRow}>
            <Button
              kind="outline"
              small
              onClick={() => {
                void store.getState().snooze(1);
                closeSheet();
              }}
            >
              ⏱ Snooze 1′
            </Button>
            <Button kind="outline" small onClick={closeSheet}>
              Dismiss
            </Button>
          </div>
        </Sheet>
      )}

      {/* Who scored — logging never touches minutes, fairness or the countdown. */}
      {goalOpen && (
        <Sheet onClose={() => setGoalOpen(false)}>
          <h2 className={desk.sheetTitle}>Who scored?</h2>
          <p className={desk.body}>
            It goes on the record and into their season report. Minutes and the plan are untouched.
          </p>
          <div style={{ marginTop: 12 }}>
            {onField.map((p, i) => (
              <div
                key={p.playerId}
                className={cx(desk.squadRow, i === onField.length - 1 && desk.squadRowLast)}
              >
                <span className={desk.rowName}>
                  {p.currentSlot === "GK" ? "🧤 " : ""}
                  {nameOf(p.playerId)}
                </span>
                {cfg.scoreOptions.length > 1 ? (
                  cfg.scoreOptions.map((pts) => (
                    <button
                      key={pts}
                      type="button"
                      className={desk.chip}
                      aria-label={`${nameOf(p.playerId)} scored ${pts} point${pts === 1 ? "" : "s"}`}
                      onClick={() => logScore(p.playerId, pts)}
                    >
                      {pts}
                    </button>
                  ))
                ) : (
                  <button
                    type="button"
                    className={desk.chip}
                    aria-label={`${nameOf(p.playerId)} scored`}
                    onClick={() => logScore(p.playerId, cfg.scoreOptions[0] ?? 1)}
                  >
                    {cfg.scoreIcon} {cfg.scoreLabel}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className={desk.sheetStack}>
            <Button kind="outline" onClick={() => setGoalOpen(false)}>
              Cancel
            </Button>
          </div>
        </Sheet>
      )}

      {/* A surprise arrival joins mid-match: a roster pick, or a brand-new name (also saved to the
          team roster). They join the bench with a fair share pro-rated from this minute. */}
      {addOpen && (
        <Sheet onClose={() => setAddOpen(false)}>
          <h2 className={desk.sheetTitle}>Add a player</h2>
          <p className={desk.body}>
            They join the bench and the rotation from now — minutes already played stay as they are,
            and their fair share counts from this minute.
          </p>
          {rosterNotInSquad.length > 0 && (
            <>
              <SectionHead small>From the team</SectionHead>
              <div className={desk.outList}>
                {rosterNotInSquad.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={desk.outBtn}
                    onClick={() => void addExistingPlayer(p)}
                  >
                    + {p.name}
                  </button>
                ))}
              </div>
            </>
          )}
          <SectionHead small>Someone new</SectionHead>
          <div className={desk.addRow}>
            <input
              placeholder="First name"
              aria-label="New player's first name"
              value={newName}
              maxLength={40}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button kind="ink" small auto onClick={() => void addNewPlayer()} disabled={newName.trim().length === 0}>
              Add
            </Button>
          </div>
          <p className={desk.footnote}>New names are saved to the team roster for next time</p>
          <div className={desk.sheetStack}>
            <Button kind="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
          </div>
        </Sheet>
      )}

      {/* Retiring an on-field player with an empty bench is a real situation (injury, no subs left),
          so it's a confirmation rather than a block — but the cost is stated plainly first. */}
      {shortHandedRetire && (
        <Sheet onClose={() => setShortHandedRetire(null)}>
          <h2 className={desk.sheetTitle}>No one left on the bench</h2>
          <p className={desk.body}>
            {nameOf(shortHandedRetire)} will come off with no replacement, so you&apos;ll finish with{" "}
            {match.config.onFieldCount - 1} {cfg.onSurfaceLabel}. Everyone still playing picks up the
            extra minutes.
          </p>
          <div className={desk.sheetStack}>
            <Button kind="red" onClick={() => void retireShortHanded(shortHandedRetire)}>
              Take them off anyway
            </Button>
            <Button kind="outline" onClick={() => setShortHandedRetire(null)}>
              Cancel
            </Button>
          </div>
        </Sheet>
      )}

      {/* End / restart / full-time */}
      {confirmKind && (
        <Sheet onClose={() => setConfirmKind(null)}>
          <h2 className={desk.sheetTitle}>
            {confirmKind === "fulltime"
              ? cfg.endLabel
              : confirmKind === "restart"
                ? "Restart the match?"
                : "End the match?"}
          </h2>
          <p className={desk.body}>
            {confirmKind === "fulltime"
              ? "Regulation time is up. End the match, or play on into added time?"
              : confirmKind === "restart"
                ? "This wipes the clock and every change and returns to your starting lineup. It can't be undone."
                : "You'll go to the final edition and these minutes carry into the season. It can't be undone."}
          </p>
          <div className={desk.sheetStack}>
            {confirmKind === "restart" ? (
              <Button
                kind="red"
                onClick={() => {
                  void store.getState().restart();
                  setConfirmKind(null);
                }}
              >
                Restart match
              </Button>
            ) : (
              <Button
                kind="red"
                onClick={() => {
                  void store.getState().endMatch();
                  setConfirmKind(null);
                }}
              >
                End match
              </Button>
            )}
            <Button kind="outline" onClick={() => setConfirmKind(null)}>
              {confirmKind === "fulltime" ? "Play on (added time)" : "Cancel"}
            </Button>
          </div>
        </Sheet>
      )}
    </main>
  );
}
