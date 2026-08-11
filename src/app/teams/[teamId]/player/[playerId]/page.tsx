"use client";
/**
 * The player file — one footballer's season, match by match.
 *
 * Everything is computed on read from the stored event logs: minutes per match (against that match's
 * own fair share), scores, starts, and where the minutes were earned. Linked from the league table.
 *
 * The chart is hand-drawn SVG rather than a charting library: four ink rectangles and a red rule are
 * cheaper than a dependency, and a newspaper bar chart has no gradients, no rounded caps and no
 * animation to import anyway.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { fairnessReport, rebuildLiveState } from "@/engine";
import { getRepo } from "@/store/clientRepo";
import type { SavedMatch, Team } from "@/store";
import { slotFullName, sportOf } from "@/features/sports";
import { Dateline, Masthead, SectionHead, cx, styles } from "@/ui";

const SEC_PER_MIN = 60;
const minutes = (s: number): number => Math.round(s / SEC_PER_MIN);

interface MatchRow {
  matchId: string;
  dateISO: string;
  playedSeconds: number;
  targetSeconds: number;
  goals: number;
  started: boolean;
  secondsBySlot: Record<string, number>;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export default function PlayerPage() {
  const params = useParams<{ teamId: string; playerId: string }>();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const playerId = typeof params.playerId === "string" ? params.playerId : "";

  const [matches, setMatches] = useState<SavedMatch[]>([]);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const repo = getRepo();
    void Promise.all([repo.listMatches(teamId), repo.getTeam(teamId)]).then(([ms, t]) => {
      if (!alive) return;
      setMatches(ms);
      setTeam(t);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [teamId]);

  const playerName =
    team?.roster.find((p) => p.id === playerId)?.name ??
    matches.flatMap((m) => m.players).find((p) => p.id === playerId)?.name ??
    "Player";

  // The team's sport decides whether the scoring column reads goals or points.
  const sport = sportOf(team?.sport);

  const rows: MatchRow[] = useMemo(() => {
    const out: MatchRow[] = [];
    for (const m of matches) {
      if (m.deletedAt !== null) continue;
      const started = m.events.find((e) => e.type === "MATCH_STARTED");
      if (!started || started.type !== "MATCH_STARTED") continue; // never kicked off
      if (!m.players.some((p) => p.id === playerId)) continue; // not in this match's squad
      const finalState = rebuildLiveState(m.config, m.players, m.events);
      const ls = finalState.players[playerId];
      if (!ls) continue;
      const report = fairnessReport(m.config, m.players, finalState);
      const r = report.rows.find((x) => x.playerId === playerId);
      out.push({
        matchId: m.id,
        dateISO: m.startedAtISO ?? m.createdAt,
        playedSeconds: ls.secondsOnField,
        targetSeconds: r?.targetSeconds ?? 0,
        // Per match, in that match's own sport: football goals, basketball points.
        goals: (m.config.sport ?? "football") === "basketball" ? ls.points : ls.goals,
        started: started.lineup.some((a) => a.playerId === playerId),
        secondsBySlot: Object.fromEntries(
          Object.entries(ls.secondsBySlot).filter(([, sec]) => (sec ?? 0) > 0),
        ),
      });
    }
    return out.sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1)); // oldest → newest
  }, [matches, playerId]);

  const totals = useMemo(() => {
    const bySlot: Record<string, number> = {};
    let played = 0;
    let goals = 0;
    let starts = 0;
    for (const r of rows) {
      played += r.playedSeconds;
      goals += r.goals;
      if (r.started) starts += 1;
      for (const [slot, sec] of Object.entries(r.secondsBySlot)) {
        bySlot[slot] = (bySlot[slot] ?? 0) + sec;
      }
    }
    return { played, goals, starts, bySlot };
  }, [rows]);

  const masthead = <Masthead slug="Player file" back={`/teams/${teamId}/season`} />;

  if (loading) {
    return (
      <main className={styles.page}>
        {masthead}
        <Dateline left="Player history" />
        <div className={styles.gutter}>
          <p className={styles.note} style={{ marginTop: 20 }}>
            Setting the page…
          </p>
        </div>
      </main>
    );
  }

  // ── Minutes-per-match chart. Ink bars; a bar short of its fair share prints red, and the red
  // dashed rule across each bar is that match's fair share. ──
  const chartH = 172;
  const barW = 26;
  const gap = 14;
  const padL = 30;
  const padTop = 26;
  const padBottom = 26;
  const chartW = padL + rows.length * (barW + gap) + 8;
  const maxY = Math.max(1, ...rows.map((r) => Math.max(r.playedSeconds, r.targetSeconds)));
  const y = (sec: number): number => padTop + (chartH - padTop - padBottom) * (1 - sec / maxY);

  const positionTotals = Object.entries(totals.bySlot)
    .filter(([, sec]) => minutes(sec) > 0)
    .sort((a, b) => b[1] - a[1]);
  const maxSlot = Math.max(1, ...positionTotals.map(([, sec]) => sec));

  const tiles = [
    { v: `${minutes(totals.played)}′`, l: "Minutes" },
    { v: String(rows.length), l: "Matches" },
    { v: String(totals.starts), l: "Starts" },
    { v: String(totals.goals), l: sport.scoreTotalLabel },
  ];

  return (
    <main className={styles.page}>
      {masthead}
      <Dateline
        left={team ? team.name : "Player history"}
        right={`${rows.length} match${rows.length === 1 ? "" : "es"}`}
      />

      <div className={styles.gutter}>
        <h1 style={{ fontSize: 34, marginTop: 20 }}>{playerName}</h1>

        {rows.length === 0 ? (
          <div className={styles.empty}>
            <h2 style={{ fontSize: 22 }}>No matches yet</h2>
            <p className={cx(styles.note, styles.noteNormal)} style={{ marginTop: 8 }}>
              Once this player takes part in a match, their history builds here.
            </p>
          </div>
        ) : (
          <>
            {/* Summary — the same strip as the Final Edition, four columns wide. */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                border: "3px solid var(--ink)",
                marginTop: 16,
              }}
            >
              {tiles.map((t, i) => (
                <div
                  key={t.l}
                  style={{
                    padding: "12px 4px",
                    textAlign: "center",
                    borderRight: i === tiles.length - 1 ? "none" : "1px solid var(--ink)",
                  }}
                >
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 24 }}>{t.v}</div>
                  <div className={styles.statLabel}>{t.l}</div>
                </div>
              ))}
            </div>

            {/* ── Minutes per match ── */}
            <SectionHead>Minutes per match</SectionHead>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <svg
                width={chartW}
                height={chartH}
                role="img"
                aria-label={`Minutes per match for ${playerName}, against each match's fair share`}
              >
                <text x={padL - 6} y={y(0) + 4} textAnchor="end" fontSize="12" fill="var(--ink-muted)">
                  0
                </text>
                <text x={padL - 6} y={y(maxY) + 4} textAnchor="end" fontSize="12" fill="var(--ink-muted)">
                  {minutes(maxY)}′
                </text>
                <line x1={padL} y1={y(0)} x2={chartW - 4} y2={y(0)} stroke="var(--ink)" strokeWidth="1" />
                {rows.map((r, i) => {
                  const x = padL + i * (barW + gap) + gap / 2;
                  const met = r.playedSeconds >= r.targetSeconds * 0.9;
                  return (
                    <g key={r.matchId}>
                      <rect
                        x={x}
                        y={y(r.playedSeconds)}
                        width={barW}
                        height={Math.max(1, y(0) - y(r.playedSeconds))}
                        fill={met ? "var(--ink)" : "var(--red)"}
                      />
                      {/* that match's fair share */}
                      <line
                        x1={x - 3}
                        y1={y(r.targetSeconds)}
                        x2={x + barW + 3}
                        y2={y(r.targetSeconds)}
                        stroke="var(--red)"
                        strokeDasharray="4 3"
                        strokeWidth="2"
                      />
                      {r.goals > 0 && (
                        <text
                          x={x + barW / 2}
                          y={y(Math.max(r.playedSeconds, r.targetSeconds)) - 8}
                          textAnchor="middle"
                          fontSize="12"
                        >
                          {sport.scoreIcon}
                          {r.goals > 1 ? r.goals : ""}
                        </text>
                      )}
                      <text
                        x={x + barW / 2}
                        y={chartH - 7}
                        textAnchor="middle"
                        fontSize="12"
                        fill="var(--ink-muted)"
                      >
                        {shortDate(r.dateISO)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <p className={cx(styles.note, styles.noteNormal)}>
              The dashed red rule is that match&apos;s fair share. A red bar came up short of it.
            </p>

            {/* ── Positions played (full names, for the people reading at home) ── */}
            {positionTotals.length > 0 && (
              <>
                <SectionHead>Positions played</SectionHead>
                <div style={{ marginTop: 10 }}>
                  {positionTotals.map(([slot, sec], i) => (
                    <div
                      key={slot}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 2px",
                        fontSize: 13.5,
                        borderBottom:
                          i === positionTotals.length - 1 ? "none" : "1px dotted var(--rule-hair)",
                      }}
                    >
                      <span style={{ width: 108, fontWeight: 800 }}>{slotFullName(slot)}</span>
                      <span className={styles.barTrack} aria-hidden>
                        <span className={styles.barFill} style={{ width: `${(sec / maxSlot) * 100}%` }} />
                      </span>
                      <span style={{ width: 44, textAlign: "right", fontWeight: 800 }}>
                        {minutes(sec)}′
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── Match by match, newest first ── */}
            <SectionHead>Match by match</SectionHead>
            <div>
              {[...rows].reverse().map((r, i) => (
                <div
                  key={r.matchId}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    padding: "10px 2px",
                    fontSize: 13,
                    borderBottom: i === rows.length - 1 ? "none" : "1px dotted var(--rule-hair)",
                  }}
                >
                  <span style={{ width: 42, fontWeight: 800, color: "var(--ink-muted)" }}>
                    {shortDate(r.dateISO)}
                  </span>
                  <span style={{ width: 40, textAlign: "right", fontWeight: 800 }}>
                    {minutes(r.playedSeconds)}′
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      color: "var(--ink-body)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {Object.entries(r.secondsBySlot)
                      .sort((a, b) => b[1] - a[1])
                      .map(([slot, sec]) => `${slotFullName(slot)} ${minutes(sec)}′`)
                      .join(" · ")}
                    {r.started ? " · started" : ""}
                    {r.goals > 0 ? ` · ${sport.scoreIcon} ${r.goals}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
