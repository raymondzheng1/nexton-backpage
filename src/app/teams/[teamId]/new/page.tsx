"use client";
/**
 * "THE LINE-UP" — the pre-match desk.
 *
 * The projection is the point of this screen. Every control re-runs the engine's plan and redraws
 * the bars, so the coach sees what a decision COSTS — a shorter game, one fewer body, a fixed keeper
 * — while making it, instead of finding out at full time. Nothing here is binding: the plan is a
 * forecast, and the live desk still asks before every change.
 *
 * The mockup shows two steppers and the projection, so that is what the page opens as. Everything
 * else the setup screen has always been able to do — who's here, late arrivals, always-on players,
 * keeper policy and per-period keepers, rotation style, opening minutes, fairness tolerance, season
 * fair-play, the rotation dial — lives in the two boxed collapsibles below. Nothing was dropped;
 * the page just doesn't open with all of it shouting at once.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  buildPlan,
  stateAfterWindows,
  subPlanToWindows,
  type GkPolicy,
  type Match,
  type PlannedWindow,
  type Player,
  type RotationStyle,
  type StartingLineup,
} from "@/engine";
import { carryForwardSeeds } from "@/store";
import { useAppStore } from "@/store/appStore";
import type { SavedMatch } from "@/store/schema";
import { slotShortName, sportOf } from "@/features/sports";
import {
  ProjectedMinutes,
  fairShareSeconds,
  projectedRows,
  spreadSeconds,
  type ProjectedRow,
} from "@/features/plan/ProjectedMinutes";
import { Button, ButtonLink, Dateline, Masthead, SectionHead, cx, mins, styles } from "@/ui";

// Clamps. Periods and minutes-per-period are the coach's format; the players-per-side range is the
// span of grassroots formats the pitch layouts are drawn for — the number itself is never assumed
// anywhere downstream (invariant #1: everything derives from match.onFieldCount).
const PERIODS_MIN = 1;
const PERIODS_MAX = 4;
const SIDE_MIN = 3;
const SIDE_MAX = 11;
const PERIOD_LEN_MIN = 5;
const PERIOD_LEN_MAX = 45;
const TOLERANCE_MIN = 1;
const TOLERANCE_MAX = 6;
const FREQUENCY_MIN = 1;
const FREQUENCY_MAX = 5;

/** "Starting five", "starting seven", "starting XI" — the back page never writes a numeral here. */
const SQUAD_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "XI"];

const ROTATIONS: { value: RotationStyle; label: string }[] = [
  { value: "continuous", label: "Continuous" },
  { value: "interval", label: "Interval" },
  { value: "period", label: "Period" },
];
const GK_POLICIES: { value: GkPolicy; label: string }[] = [
  { value: "countAsFieldTime", label: "Counts" },
  { value: "rotateSeparately", label: "Rotate" },
  { value: "fixedGK", label: "Fixed" },
];
const SUB_TIMINGS: { value: "settle" | "even"; label: string }[] = [
  { value: "settle", label: "Settle in" },
  { value: "even", label: "Even from kickoff" },
];
const CARRY_OPTIONS: { value: "on" | "off"; label: string }[] = [
  { value: "on", label: "On (season)" },
  { value: "off", label: "Off (this match)" },
];
/** Rotation-dial level names, index = level − 1. The coach's words, not the algorithm's. */
const FREQUENCY_LABELS = ["Fewest changes", "Fewer changes", "Balanced", "More changes", "Most changes"];

/** Football's default, for a team record that predates the sport field. */
const FALLBACK_SIDE_SIZE = sportOf("football").defaultOnFieldCount;

/** What a plan actually does, in something a coach can picture: how many changes, how far apart. */
function cadenceSummary(windows: PlannedWindow[], totalSeconds: number): string {
  const n = windows.length;
  if (n === 0) return "No changes planned — the same players all the way through.";
  const gap = Math.max(1, Math.round(totalSeconds / (n + 1) / 60));
  return `${n} change${n === 1 ? "" : "s"} · roughly one every ${gap} min`;
}

interface Projection {
  lineup: StartingLineup | null;
  windows: PlannedWindow[];
  rows: ProjectedRow[];
  /** The engine's reason it can't field this squad. Shown to the coach, never swallowed. */
  error: string | null;
}

export default function NewMatchPage() {
  const router = useRouter();
  const params = useParams<{ teamId: string }>();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const ready = useAppStore((s) => s.ready);
  const team = useAppStore((s) => s.teams.find((t) => t.id === teamId));
  const createMatch = useAppStore((s) => s.createMatch);
  const listMatches = useAppStore((s) => s.listMatches);
  const prefs = useAppStore((s) => s.prefs);
  const sport = team?.sport ?? "football";
  const cfg = sportOf(sport);
  const [seasonMatches, setSeasonMatches] = useState<SavedMatch[]>([]);

  const [onFieldCount, setOnFieldCount] = useState(team?.defaultOnFieldCount ?? FALLBACK_SIDE_SIZE);
  const [periods, setPeriods] = useState(2);
  const [periodLength, setPeriodLength] = useState(25);
  const [rotationStyle, setRotationStyle] = useState<RotationStyle>(prefs.rotationStyle);
  // "settle" holds subs out of each period's opening minutes (default); "even" subs from minute 1.
  const [subTiming, setSubTiming] = useState<"settle" | "even">("settle");
  const [gkPolicy, setGkPolicy] = useState<GkPolicy>(prefs.gkPolicy);
  const [tolerance, setTolerance] = useState(prefs.fairnessToleranceMinutes);
  const [subFrequency, setSubFrequency] = useState(prefs.subFrequency);
  const [available, setAvailable] = useState<string[]>(() => team?.roster.map((p) => p.id) ?? []);
  const [lateIds, setLateIds] = useState<string[]>([]);
  // Not part of the rotation (e.g. keeper/captain): guaranteed starter, never planned/suggested off.
  const [alwaysOnIds, setAlwaysOnIds] = useState<string[]>([]);
  // Fixed keeper per period (football default): index 0 = 1st half. Same person every period ⇒ one
  // whole-match keeper; different ⇒ the keeper swaps at each break. Seeded to the first keeper.
  const [gkByPeriodSel, setGkByPeriodSel] = useState<(string | null)[]>([]);
  // Season fair-play: factor each player's season minutes into this match's targets. Defaults to the
  // team setting (absent ⇒ OFF: fair per game); overridable per match here.
  const [carryForward, setCarryForward] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [stamp, setStamp] = useState("");

  // The dateline is a real dateline. Written after mount so the server and the phone can't disagree
  // about what time it is.
  useEffect(() => {
    const now = new Date();
    setStamp(
      `${now.toLocaleDateString(undefined, { weekday: "short" })} ${now.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })}`,
    );
  }, []);

  // The team may load AFTER first render (direct navigation / async store). Seed squad, on-field
  // count, and the coach's default rules once the team arrives, without clobbering later edits.
  useEffect(() => {
    if (team && !seeded) {
      const c = sportOf(team.sport);
      setAvailable(team.roster.map((p) => p.id));
      setOnFieldCount(team.defaultOnFieldCount);
      setPeriods(c.defaultPeriods); // both sports default to 2 periods (30′ football, 18′ basketball)
      setPeriodLength(c.defaultPeriodLengthMinutes);
      setRotationStyle(prefs.rotationStyle);
      // Football defaults to a FIXED keeper (the coach picks one per half); basketball keeps the
      // coach's default policy (it has no keeper anyway).
      setGkPolicy(c.hasGoalkeeper ? "fixedGK" : prefs.gkPolicy);
      const firstKeeper = team.roster.find((p) => p.canPlayGK)?.id ?? null;
      setGkByPeriodSel(Array.from({ length: c.defaultPeriods }, () => firstKeeper));
      setTolerance(prefs.fairnessToleranceMinutes);
      setSubFrequency(prefs.subFrequency);
      setCarryForward(team.seasonCarryForward === true); // team default (absent ⇒ OFF: fair per game)
      setSeeded(true);
    }
  }, [team, seeded, prefs]);

  // Prior matches power the season carry-forward seed applied at kickoff (if the coach has it on).
  useEffect(() => {
    void listMatches(teamId).then(setSeasonMatches);
  }, [teamId, listMatches]);

  const availablePlayers = useMemo(
    () =>
      (team?.roster ?? [])
        .filter((p) => available.includes(p.id))
        .map((p) => ({
          ...p,
          ...(lateIds.includes(p.id)
            ? { availability: "arrives-late" as const, unavailableUntilMinute: periodLength }
            : null),
          ...(alwaysOnIds.includes(p.id) ? { alwaysOn: true } : null),
        })),
    [team, available, lateIds, alwaysOnIds, periodLength],
  );

  const keeperOptions = useMemo(
    () => (team?.roster ?? []).filter((p) => p.canPlayGK && available.includes(p.id)),
    [team, available],
  );
  const firstKeeperId = keeperOptions[0]?.id ?? null;
  // The resolved keeper for each period: the coach's pick if still valid, else the first keeper —
  // always `periods` entries long (so changing the period count just extends with the 1st keeper).
  const resolvedGkByPeriod = useMemo(
    () =>
      Array.from({ length: periods }, (_, i) => {
        const sel = gkByPeriodSel[i];
        return sel !== undefined && sel !== null && keeperOptions.some((k) => k.id === sel) ? sel : firstKeeperId;
      }),
    [periods, gkByPeriodSel, keeperOptions, firstKeeperId],
  );
  const usingFixedGk = gkPolicy === "fixedGK" && firstKeeperId !== null;

  const config = useMemo<Match>(
    () => ({
      sport,
      onFieldCount,
      periods,
      periodLengthMinutes: periodLength,
      rolloverSubsAllowed: true,
      // No keeper in basketball ⇒ everyone's court time counts equally. Otherwise fixedGK only takes
      // effect once a keeper is chosen; else treat as counts-as-field-time.
      gkPolicy: !cfg.hasGoalkeeper
        ? "countAsFieldTime"
        : gkPolicy === "fixedGK" && !usingFixedGk
          ? "countAsFieldTime"
          : gkPolicy,
      // Per-half keepers (football). fixedGkPlayerId mirrors the 1st-half keeper for back-compat.
      fixedGkPlayerId: cfg.hasGoalkeeper && usingFixedGk ? resolvedGkByPeriod[0] ?? undefined : undefined,
      gkByPeriod:
        cfg.hasGoalkeeper && usingFixedGk
          ? resolvedGkByPeriod.filter((id): id is string => id !== null)
          : undefined,
      fairnessToleranceMinutes: tolerance,
      rotationStyle,
      subFrequency,
      availableSquad: availablePlayers.map((p) => p.id),
      // Shortest stint worth playing: 3′ for a normal game, scaled down for SHORT games (quarter of
      // the match, floor 1′) — otherwise a tiny game can only fit one sub window and fairness is
      // structurally impossible (e.g. a 6′ game split 6′-vs-3′).
      minStintMinutes: Math.min(3, Math.max(1, Math.round((periods * periodLength) / 4))),
      stabilityHold: subTiming === "settle",
    }),
    [
      sport,
      cfg.hasGoalkeeper,
      onFieldCount,
      periods,
      periodLength,
      gkPolicy,
      usingFixedGk,
      resolvedGkByPeriod,
      tolerance,
      rotationStyle,
      subTiming,
      subFrequency,
      availablePlayers,
    ],
  );

  const totalSeconds = periods * periodLength * 60;

  // The whole screen in one calculation: pick the XI, forward-simulate the plan, and read off where
  // everyone finishes. Re-runs on every control change — that live re-projection IS the feature.
  const projection = useMemo<Projection>(() => {
    try {
      const { startingLineup, plan } = buildPlan(config, availablePlayers);
      const windows = subPlanToWindows(plan);
      const finalState = stateAfterWindows(
        config,
        availablePlayers,
        startingLineup.assignments,
        windows,
        totalSeconds,
      );
      return {
        lineup: startingLineup,
        windows,
        rows: projectedRows(config, availablePlayers, finalState, totalSeconds),
        error: null,
      };
    } catch (e) {
      // The engine refuses squads it can't field (too few here, nobody in goal). Say so out loud —
      // the coach can fix it from the controls on this page (Harness §7.1: never a silent default).
      return {
        lineup: null,
        windows: [],
        rows: [],
        error: e instanceof Error ? e.message : "Can't pick a lineup from this squad.",
      };
    }
  }, [config, availablePlayers, totalSeconds]);

  const fair = fairShareSeconds(projection.rows);
  const spread = spreadSeconds(projection.rows, fair);

  const benchRows = useMemo(() => {
    const nameOf = new Map(availablePlayers.map((p) => [p.id, p.name]));
    const onAt = new Map<string, number>();
    for (const w of projection.windows) {
      for (const o of w.on) if (!onAt.has(o.playerId)) onAt.set(o.playerId, w.atSeconds);
    }
    return (projection.lineup?.bench ?? [])
      .map((id) => ({
        id,
        name: nameOf.get(id) ?? id,
        atSeconds: onAt.get(id) ?? null,
        late: lateIds.includes(id),
      }))
      .sort((a, b) => (a.atSeconds ?? Infinity) - (b.atSeconds ?? Infinity) || (a.name < b.name ? -1 : 1));
  }, [projection, availablePlayers, lateIds]);

  function toggleAvailable(id: string): void {
    setAvailable((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function create(): Promise<void> {
    const lineup = projection.lineup;
    if (!team || !lineup) return;
    setCreating(true);
    setCreateError(null);
    const stampedName = new Date().toLocaleDateString();
    // Season fair-play (per-match toggle, seeded from the team default): seed each player's debt from
    // how far they are below the squad's season average, capped at one match's fair share so it nudges
    // rather than dominates. Off ⇒ this match is balanced on its own (no season seed).
    let playersForMatch = availablePlayers;
    if (carryForward) {
      const ids = availablePlayers.map((p) => p.id);
      const seeds = carryForwardSeeds(seasonMatches, ids);
      const matchSeconds = config.periods * config.periodLengthMinutes * 60;
      const cap = Math.round((matchSeconds * config.onFieldCount) / Math.max(1, ids.length));
      playersForMatch = availablePlayers.map((p) => ({
        ...p,
        carryForwardSeconds: Math.max(-cap, Math.min(cap, seeds[p.id] ?? 0)),
      }));
    }
    try {
      const created = await createMatch({
        teamId: team.id,
        name: `${team.name} · ${stampedName}`,
        config,
        players: playersForMatch,
        startingLineup: lineup.assignments,
      });
      router.push(`/teams/${team.id}/match/${created.id}`);
    } catch (e) {
      // A failed write must never leave the coach staring at a dead button (Harness §7.1).
      setCreating(false);
      setCreateError(e instanceof Error ? e.message : "Couldn’t save the match. Try again.");
    }
  }

  if (!team) {
    return (
      <main className={styles.page}>
        <Masthead back="/teams" slug="The line-up" />
        <Dateline left={ready ? "No such team" : "Late edition"} />
        <div className={styles.gutter}>
          <p className={styles.empty}>{ready ? "That team isn’t on file." : "Fetching the team sheet…"}</p>
          {ready && <ButtonLink href="/teams">Back to your teams</ButtonLink>}
        </div>
      </main>
    );
  }

  const squadWord = SQUAD_WORDS[onFieldCount] ?? String(onFieldCount);
  const periodNoun = cfg.periodLabel.toLowerCase();
  const frequencyLabel = FREQUENCY_LABELS[subFrequency - 1] ?? "Balanced";
  const lateCount = lateIds.filter((id) => available.includes(id)).length;
  const alwaysOnCount = alwaysOnIds.filter((id) => available.includes(id)).length;

  return (
    <main className={styles.page}>
      <Masthead back={`/teams/${team.id}`} slug="The line-up" />
      <Dateline
        left={stamp === "" ? team.name : `${stamp} · ${team.name}`}
        right={`${availablePlayers.length} here today`}
      />

      <div className={styles.gutter}>
        {/* ── Format: the two steppers the whole projection hangs off ── */}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <StepperCard
            label="Periods"
            noun="periods"
            display={`${periods} × ${periodLength}′`}
            value={periods}
            min={PERIODS_MIN}
            max={PERIODS_MAX}
            onChange={setPeriods}
          />
          <StepperCard
            label={`On ${cfg.surfaceLabel.toLowerCase()}`}
            noun={`players on the ${cfg.surfaceLabel.toLowerCase()}`}
            display={`${onFieldCount} v ${onFieldCount}`}
            value={onFieldCount}
            min={SIDE_MIN}
            max={SIDE_MAX}
            onChange={setOnFieldCount}
          />
        </div>

        {/* ── Who turned up (collapsed: the dateline already says how many) ── */}
        <Fold
          title="Team sheet"
          summary={`${availablePlayers.length} in${lateCount > 0 ? ` · ${lateCount} late` : ""}${
            alwaysOnCount > 0 ? ` · ${alwaysOnCount} always on` : ""
          }`}
        >
          {team.roster.map((p) => {
            const isIn = available.includes(p.id);
            const isLate = lateIds.includes(p.id);
            const isAlwaysOn = alwaysOnIds.includes(p.id);
            return (
              // The NAME is the priority: [In/Out + name] keeps its natural width, and the two flags
              // wrap to a second line rather than crushing it.
              <div
                key={p.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "6px 8px",
                  padding: "8px 0",
                  borderBottom: "1px dotted var(--rule-hair)",
                  opacity: isIn ? 1 : 0.45,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 auto", minWidth: 0 }}>
                  <button
                    type="button"
                    aria-pressed={isIn}
                    aria-label={`${p.name} is ${isIn ? "here" : "not here"} today`}
                    className={cx(styles.tag, isIn && styles.tagOn)}
                    style={{ minWidth: 52, minHeight: 44 }}
                    onClick={() => toggleAvailable(p.id)}
                  >
                    {isIn ? "In" : "Out"}
                  </button>
                  <span
                    title={p.name}
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.canPlayGK ? "🧤 " : ""}
                    {p.name}
                  </span>
                </div>
                {isIn && (
                  <div style={{ display: "flex", gap: 6, flex: "0 0 auto", marginLeft: "auto" }}>
                    <button
                      type="button"
                      aria-pressed={isAlwaysOn}
                      aria-label={`${p.name} always on (not rotated)`}
                      className={cx(styles.tag, isAlwaysOn && styles.tagOn)}
                      style={{ minHeight: 44 }}
                      onClick={() => {
                        // Mutually exclusive with 🕑 Late — a guaranteed starter can't also be
                        // absent at kickoff.
                        setAlwaysOnIds((prev) =>
                          prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                        );
                        setLateIds((prev) => prev.filter((x) => x !== p.id));
                      }}
                    >
                      🔒 Always on
                    </button>
                    <button
                      type="button"
                      aria-pressed={isLate}
                      aria-label={`${p.name} arrives late`}
                      className={cx(styles.tag, isLate && styles.tagOn)}
                      style={{ minHeight: 44 }}
                      onClick={() => {
                        setLateIds((prev) =>
                          prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                        );
                        setAlwaysOnIds((prev) => prev.filter((x) => x !== p.id));
                      }}
                    >
                      🕑 Late
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <p className={cx(styles.note, styles.noteNormal)}>
            <strong>🔒 Always on</strong> = out of the rotation (keeper, captain…): starts, is never
            suggested off, and the rest of the squad shares what's left.{" "}
            <strong>🕑 Late</strong> = arrives at {cfg.breakLabel.toLowerCase()}; the engine targets
            fair time over the window they’re actually here for.
          </p>
        </Fold>

        {/* ── The answer ── */}
        {projection.error !== null ? (
          <div className={styles.box} style={{ marginTop: 20, borderColor: "var(--red)" }}>
            <span className={styles.label} style={{ color: "var(--red)" }}>
              Can’t pick a line-up
            </span>
            <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-body)" }}>
              {`${projection.error}. Mark more players in on the team sheet, take one off the ${cfg.surfaceLabel.toLowerCase()}${
                cfg.hasGoalkeeper ? ", or give someone the gloves in the squad" : ""
              }.`}
            </p>
          </div>
        ) : (
          <ProjectedMinutes
            rows={projection.rows}
            fairSeconds={fair}
            caption={cadenceCaption(projection.windows.length)}
            footnote={`everyone lands within ${mins(spread)} of it`}
          />
        )}

        {/* ── The team talk: who starts, who's first off the bench ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 }}>
          <div>
            <SectionHead small style={{ marginTop: 0 }}>
              Starting {squadWord}
            </SectionHead>
            <ol style={{ margin: 0, padding: 0, listStyle: "none", borderBottom: "1px dotted var(--rule-hair)" }}>
              {(projection.lineup?.assignments ?? []).map((a) => (
                <li
                  key={a.playerId}
                  style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 14.5, fontWeight: 700, lineHeight: 2.1 }}
                >
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.slot === "GK" ? "🧤 " : ""}
                    {nameIn(availablePlayers, a.playerId)}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
                    {slotShortName(a.slot)}
                  </span>
                </li>
              ))}
              {projection.lineup === null && <li className={styles.note}>—</li>}
            </ol>
          </div>
          <div>
            <SectionHead small red style={{ marginTop: 0 }}>
              Bench first
            </SectionHead>
            <ol style={{ margin: 0, padding: 0, listStyle: "none", borderBottom: "1px dotted var(--rule-hair)" }}>
              {benchRows.map((b) => (
                <li
                  key={b.id}
                  style={{ display: "flex", alignItems: "baseline", gap: 5, fontSize: 14.5, fontWeight: 700, lineHeight: 2.1 }}
                >
                  <span
                    title={b.name}
                    style={{ flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {b.name}
                  </span>
                  <span style={{ flex: "none", color: "var(--ink-muted)", fontWeight: 600 }}>
                    {b.late
                      ? `arrives @ ${mins(periodLength * 60)}`
                      : b.atSeconds !== null
                        ? `on @ ${mins(b.atSeconds)}`
                        : "not planned on"}
                  </span>
                </li>
              ))}
              {benchRows.length === 0 && <li className={styles.note}>Nobody spare — everyone starts.</li>}
            </ol>
            <p className={cx(styles.note, styles.noteNormal)}>Late arrival? Mark them in — the plan rebuilds.</p>
          </div>
        </div>

        {/* ── Everything else, folded away ── */}
        <Fold title="More settings" summary={`${frequencyLabel} · ${tolerance}′ tolerance`}>
          <SettingRow label={`Minutes per ${periodNoun}`}>
            <Stepper
              value={periodLength}
              min={PERIOD_LEN_MIN}
              max={PERIOD_LEN_MAX}
              noun={`minutes per ${periodNoun}`}
              onChange={setPeriodLength}
              display={`${periodLength}′`}
            />
          </SettingRow>

          <div style={{ marginTop: 14 }}>
            <div className={styles.spread}>
              <span className={styles.label}>How often to change players</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 16, textTransform: "uppercase" }}>
                {frequencyLabel}
              </span>
            </div>
            <input
              type="range"
              min={FREQUENCY_MIN}
              max={FREQUENCY_MAX}
              step={1}
              value={subFrequency}
              aria-label="How often to change players"
              aria-valuetext={`${frequencyLabel} — ${cadenceSummary(projection.windows, totalSeconds)}`}
              onChange={(e) => setSubFrequency(Number(e.target.value))}
              style={{ accentColor: "var(--red)", padding: "0 8px", marginTop: 4 }}
            />
            <div aria-hidden className={styles.spread} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-muted)" }}>
              <span>Fewer · longer stints</span>
              <span>More · shorter</span>
            </div>
            <p className={cx(styles.note, styles.noteNormal)}>
              {cadenceSummary(projection.windows, totalSeconds)} — the bars above redraw as you move
              it, so you can see what the extra changes buy.
            </p>
          </div>

          <div style={{ marginTop: 14 }}>
            <span className={styles.label}>Rotation style</span>
            <Chips options={ROTATIONS} value={rotationStyle} onChange={setRotationStyle} ariaLabel="Rotation style" />
            <p className={cx(styles.note, styles.noteNormal)}>
              When sub windows happen. <strong>Continuous</strong> — whenever it keeps minutes
              fairest. <strong>Interval</strong> — on a fixed cadence. <strong>Period</strong> — only
              at {periodNoun} breaks.
            </p>
          </div>

          <div style={{ marginTop: 14 }}>
            <span className={styles.label}>Opening minutes</span>
            <Chips options={SUB_TIMINGS} value={subTiming} onChange={setSubTiming} ariaLabel="Opening-minute sub timing" />
            <p className={cx(styles.note, styles.noteNormal)}>
              <strong>Settle in</strong> — no subs in the first 4 min of each {periodNoun}, so the
              shape settles after each restart. <strong>Even from kickoff</strong> — sub at equal
              intervals from the first minute.
              {periodLength <= 10 ? " (Only affects periods longer than 10 min.)" : ""}
            </p>
          </div>

          {cfg.hasGoalkeeper && (
            <div style={{ marginTop: 14 }}>
              <span className={styles.label}>Goalkeeper</span>
              <Chips options={GK_POLICIES} value={gkPolicy} onChange={setGkPolicy} ariaLabel="Goalkeeper policy" />
              {gkPolicy === "fixedGK" &&
                (keeperOptions.length === 0 ? (
                  <p className={cx(styles.note, styles.noteNormal)}>
                    No available keeper — mark a player GK in the squad.
                  </p>
                ) : (
                  <div style={{ marginTop: 10 }}>
                    {Array.from({ length: periods }, (_, i) => (
                      <div key={i} style={{ marginTop: 8 }}>
                        <span className={styles.label}>
                          {periods === 2
                            ? i === 0
                              ? "1st half keeper"
                              : "2nd half keeper"
                            : `${cfg.periodLabel} ${i + 1} keeper`}
                        </span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                          {keeperOptions.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              aria-pressed={resolvedGkByPeriod[i] === p.id}
                              aria-label={`${p.name} keeps ${
                                periods === 2 ? (i === 0 ? "the first half" : "the second half") : `period ${i + 1}`
                              }`}
                              className={cx(styles.tag, resolvedGkByPeriod[i] === p.id && styles.tagOn)}
                              style={{ minHeight: 44 }}
                              onClick={() =>
                                setGkByPeriodSel((prev) => {
                                  const next = Array.from({ length: periods }, (_, k) => prev[k] ?? firstKeeperId);
                                  next[i] = p.id;
                                  return next;
                                })
                              }
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <p className={cx(styles.note, styles.noteNormal)}>
                      Pick a keeper for each half — the same player for both, or a different one. The
                      app puts the right keeper in goal each half and rotates them through outfield
                      the half they aren’t keeping.
                    </p>
                  </div>
                ))}
            </div>
          )}

          <SettingRow label="Fairness tolerance">
            <Stepper
              value={tolerance}
              min={TOLERANCE_MIN}
              max={TOLERANCE_MAX}
              noun="minutes of fairness tolerance"
              onChange={setTolerance}
              display={`${tolerance}′`}
            />
          </SettingRow>

          <div style={{ marginTop: 14 }}>
            <span className={styles.label}>Season fair-play</span>
            <Chips
              options={CARRY_OPTIONS}
              value={carryForward ? "on" : "off"}
              onChange={(v) => setCarryForward(v === "on")}
              ariaLabel="Season fair-play carry-forward"
            />
            <p className={cx(styles.note, styles.noteNormal)}>
              <strong>Off</strong> — balance this match on its own; season minutes are still tracked.{" "}
              <strong>On</strong> — players who’ve had less {cfg.onSurfaceLabel} time across the
              season are owed more today.{" "}
              <strong>This team’s saved default is {team.seasonCarryForward === true ? "On" : "Off"}</strong> —
              change it permanently in Edit team.
            </p>
          </div>
        </Fold>
      </div>

      {/* ── Kick off ── */}
      <div className={styles.gutter} style={{ borderTop: "3px solid var(--ink)", marginTop: 22, paddingTop: 18 }}>
        <Button kind="red" onClick={() => void create()} disabled={creating || projection.lineup === null}>
          {creating ? "Starting…" : `${cfg.startLabel} ▶`}
        </Button>
        {createError !== null && (
          <p className={styles.note} style={{ textAlign: "center", marginTop: 10, color: "var(--red)" }}>
            {createError}
          </p>
        )}
        <p className={styles.note} style={{ textAlign: "center", marginTop: 10, fontSize: 12.5 }}>
          Nothing is final — you confirm every change
        </p>
      </div>
    </main>
  );
}

function nameIn(players: Player[], id: string): string {
  return players.find((p) => p.id === id)?.name ?? id;
}

/** "6 changes planned" — the caption on the projection's rule. */
function cadenceCaption(changes: number): string {
  return changes === 0 ? "no changes planned" : `${changes} change${changes === 1 ? "" : "s"} planned`;
}

// ── local pieces ────────────────────────────────────────────────────────────
// Not in @/ui: none of these is shared with another screen yet, and a primitive earns its place by
// being used twice.

/**
 * A boxed column that folds. `<details>` so it works before hydration and reads to a screen reader
 * as the disclosure it is; the marker is suppressed in favour of a +/− in the design's own type.
 */
function Fold({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <details style={{ border: "3px solid var(--ink)", marginTop: 20 }}>
      <summary
        style={{
          listStyle: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          minHeight: 48,
          padding: "0 12px",
          cursor: "pointer",
        }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontSize: 15, textTransform: "uppercase" }}>{title}</span>
        <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
          {summary}
        </span>
      </summary>
      <div style={{ padding: "4px 12px 14px", borderTop: "1px solid var(--ink)" }}>{children}</div>
    </details>
  );
}

function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.spread} style={{ marginTop: 14 }}>
      <span className={styles.label} style={{ flex: 1 }}>
        {label}
      </span>
      {children}
    </div>
  );
}

interface StepperProps {
  value: number;
  min: number;
  max: number;
  /** What's being counted, for the −/+ aria-labels: "periods", "minutes per half". */
  noun: string;
  display: string;
  onChange: (n: number) => void;
}

function Stepper({ value, min, max, noun, display, onChange }: StepperProps) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        className={styles.iconBtn}
        aria-label={`Fewer ${noun}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 18, minWidth: 40, textAlign: "center" }}>
        {display}
      </span>
      <button
        type="button"
        className={styles.iconBtn}
        aria-label={`More ${noun}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </span>
  );
}

/** The two headline steppers: a 2px-ruled card, label above, −  value  + across the width. */
function StepperCard({ label, value, min, max, noun, display, onChange }: StepperProps & { label: string }) {
  return (
    <div className={styles.boxThin} style={{ flex: 1, minWidth: 0 }}>
      <span className={styles.label}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginTop: 6 }}>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={`Fewer ${noun}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 22, whiteSpace: "nowrap" }}>{display}</span>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={`More ${noun}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function Chips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          className={cx(styles.tag, value === o.value && styles.tagOn)}
          style={{ minHeight: 44, padding: "0 12px" }}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
