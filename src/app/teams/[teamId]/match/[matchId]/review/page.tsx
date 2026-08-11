"use client";
/**
 * Full time — "The Final Edition".
 *
 * The receipt a coach hands the parents' chat: who played, for how long, who scored, and whether it
 * came out fair. Everything here is computed on read from the append-only event log, so it is the
 * record of what happened rather than the plan it was built on.
 *
 * The headline tells the truth. "Everyone played. Here's the proof." is only printed when everyone
 * actually did and the squad landed inside the fairness band; otherwise the page says what really
 * happened. A back page that flatters the manager is worth nothing to the parents reading it.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { fairnessReport, rebuildLiveState } from "@/engine";
import { getRepo } from "@/store/clientRepo";
import type { SavedMatch } from "@/store/schema";
import {
  buildMatchFeed,
  countActualSubs,
  feedLineText,
  wallClockLabel,
  type FeedLabels,
} from "@/features/live/matchFeed";
import { statusFor, statusTolFor } from "@/features/live/status";
import { slotShortName, sportOf } from "@/features/sports";
import {
  Button,
  ButtonLink,
  Dateline,
  Masthead,
  SectionHead,
  StatStrip,
  Status,
  Toast,
  clockTime,
  cx,
  styles,
} from "@/ui";

const SEC_PER_MIN = 60;
/** PLAYER · MIN · ⚽ · FAIR — the box-score column widths, shared by the head and every row. */
const BOX_COLUMNS = "1fr 52px 44px 40px";

function minutes(seconds: number): number {
  return Math.round(seconds / SEC_PER_MIN);
}

export default function ReviewPage() {
  const params = useParams<{ teamId: string; matchId: string }>();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const matchId = typeof params.matchId === "string" ? params.matchId : "";

  const [match, setMatch] = useState<SavedMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void getRepo()
      .getMatch(matchId)
      .then((m) => {
        if (!alive) return;
        setMatch(m);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [matchId]);

  const cfg = sportOf(match?.config.sport);
  const isBasketball = cfg.id === "basketball";

  const view = useMemo(() => {
    if (!match) return null;
    const basketball = (match.config.sport ?? "football") === "basketball";
    const finalState = rebuildLiveState(match.config, match.players, match.events);
    const report = fairnessReport(match.config, match.players, finalState);
    const startEvent = match.events.find((e) => e.type === "MATCH_STARTED");
    const starterIds = new Set(
      startEvent && startEvent.type === "MATCH_STARTED"
        ? startEvent.lineup.map((a) => a.playerId)
        : [],
    );
    const rowBy = new Map(report.rows.map((r) => [r.playerId, r]));
    const nameOf = new Map(match.players.map((p) => [p.id, p.name]));

    const lines = match.players
      .map((p) => {
        const ls = finalState.players[p.id];
        const r = rowBy.get(p.id);
        return {
          playerId: p.id,
          name: nameOf.get(p.id) ?? p.id,
          playedSeconds: ls?.secondsOnField ?? r?.playedSeconds ?? 0,
          targetSeconds: r?.targetSeconds ?? 0,
          debtSeconds: r?.debtSeconds ?? 0,
          started: starterIds.has(p.id),
          gkSeconds: ls?.secondsAsGk ?? 0,
          // Football shows goals, basketball shows points — a three-pointer counts as 3.
          goals: basketball ? (ls?.points ?? 0) : (ls?.goals ?? 0),
        };
      })
      .sort(
        (a, b) =>
          b.playedSeconds - a.playedSeconds ||
          (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0),
      );

    const scorers = lines
      .filter((l) => l.goals > 0)
      .sort((a, b) => b.goals - a.goals || (a.name < b.name ? -1 : 1));
    const totalGoals = scorers.reduce((s, l) => s + l.goals, 0);
    // The match log — every substitution, score and period change, as it actually happened.
    const feed = buildMatchFeed(match.events);
    return { lines, report, scorers, totalGoals, feed, subsMade: countActualSubs(feed) };
  }, [match]);

  function summaryText(): string {
    if (!match || !view) return "";
    const header = `${match.name}`;
    const body = view.lines.map((l) => `${l.name}: ${minutes(l.playedSeconds)}′`).join("\n");
    const spread = minutes(view.report.spreadSeconds);
    const maxOff = minutes(view.report.maxAbsDebtSeconds);
    const scorers = view.scorers.length
      ? `\n\n${cfg.scoreIcon} ${cfg.scorersLabel} (${view.totalGoals}): ${view.scorers
          .map((l) => `${l.name}${l.goals > 1 ? ` ${isBasketball ? `${l.goals}pts` : `×${l.goals}`}` : ""}`)
          .join(", ")}`
      : "";
    return `${header}\n\n${body}${scorers}\n\nFairness spread: ${spread}′ · Max off-target: ${maxOff}′\n— via NextOn`;
  }

  async function onCopy(): Promise<void> {
    const text = summaryText();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } catch {
        // Clipboard blocked (no permission / no gesture) — the download stays available; benign.
      }
    }
  }

  function onDownload(): void {
    const blob = new Blob([summaryText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = (match?.name ?? "match").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.download = `nexton-${safe}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const feedLabels: FeedLabels = {
    nameOf: (id) => match?.players.find((p) => p.id === id)?.name ?? id,
    slotLabel: slotShortName,
    startLabel: cfg.startLabel,
    periodLabel: cfg.periodLabel,
    breakLabel: cfg.breakLabel,
    endLabel: cfg.endLabel,
    scoreIcon: cfg.scoreIcon,
    showScoreValue: isBasketball,
  };

  if (loading) {
    return (
      <main className={styles.page}>
        <Masthead slug="Final edition" back={`/teams/${teamId}`} />
        <Dateline left="Full time" />
        <div className={styles.gutter}>
          <p className={styles.note} style={{ marginTop: 20 }}>
            Setting the page…
          </p>
        </div>
      </main>
    );
  }

  if (!match || !view) {
    return (
      <main className={styles.page}>
        <Masthead slug="Final edition" back={`/teams/${teamId}`} />
        <Dateline left="Full time" right="Story pulled" />
        <div className={styles.gutter}>
          <h1 style={{ fontSize: 34, marginTop: 20 }}>No such match.</h1>
          <p className={cx(styles.note, styles.noteNormal)}>
            It may have been deleted on this device or on another one.
          </p>
          <ButtonLink href={`/teams/${teamId}`} kind="ink" style={{ marginTop: 16 }}>
            Back to the team
          </ButtonLink>
        </div>
      </main>
    );
  }

  const spreadMin = minutes(view.report.spreadSeconds);
  // Status band scales with the match length — a fixed 4′ band would call ANY split in a short
  // game "fair" (a 6′ game with 6′-vs-3′ players showed 100% before this).
  const statusTol = statusTolFor(match.config.periods * match.config.periodLengthMinutes * 60);
  const onTargetCount = view.lines.filter((l) => statusFor(l.debtSeconds, statusTol) === "on").length;
  const squadPlayed = view.lines.filter((l) => l.playedSeconds > 0).length;
  const unplayed = view.lines.length - squadPlayed;
  const scheduledMinutes = match.config.periods * match.config.periodLengthMinutes;

  // The headline is derived, never assumed: it can only say "everyone" when everyone actually got on,
  // and can only promise "proof" when every player finished inside the fairness band.
  const hedTop =
    unplayed === 0 ? "Everyone played." : unplayed === 1 ? "All but one played." : `${unplayed} never got on.`;
  const hedBottom =
    unplayed === 0 && onTargetCount === view.lines.length ? "Here's the proof." : "Here are the numbers.";

  return (
    <main className={styles.page}>
      <Masthead slug="Final edition" back={`/teams/${teamId}`} />
      <Dateline
        left={`${cfg.endLabel} · ${scheduledMinutes}′`}
        right={`${match.name} · ${cfg.scoreIcon} ${view.totalGoals}`}
      />

      <div className={styles.gutter}>
        <h1 style={{ fontSize: 38, lineHeight: 0.98, marginTop: 20 }}>
          {hedTop}
          <br />
          <span className={styles.hedRed}>{hedBottom}</span>
        </h1>

        <StatStrip
          cells={[
            { value: `${onTargetCount}/${view.lines.length}`, label: "Played fair share" },
            { value: `${spreadMin}′`, label: "Minutes spread", red: true },
            { value: String(view.subsMade), label: "Subs made" },
          ]}
        />

        {/* ── Box score ── */}
        <SectionHead>Box score</SectionHead>
        <div>
          <div className={styles.tableHead} style={{ gridTemplateColumns: BOX_COLUMNS }}>
            <span>Player</span>
            <span className={styles.num}>Min</span>
            <span className={styles.num} title={cfg.scoreTotalLabel}>
              {cfg.scoreIcon}
            </span>
            <span className={styles.num}>Fair</span>
          </div>
          {view.lines.map((l, i) => (
            <div
              key={l.playerId}
              className={styles.rowGrid}
              style={{
                gridTemplateColumns: BOX_COLUMNS,
                borderBottom: i === view.lines.length - 1 ? "none" : undefined,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.gkSeconds > 0 ? "🧤 " : ""}
                {l.name}
              </span>
              <span className={styles.num}>{minutes(l.playedSeconds)}′</span>
              <span className={styles.num}>{l.goals > 0 ? l.goals : "—"}</span>
              <Status kind={statusFor(l.debtSeconds, statusTol)} wordless />
            </div>
          ))}
        </div>
        <div className={styles.tableFoot}>
          <span>Fairness spread: {spreadMin}′</span>
          <span>Max off target: {minutes(view.report.maxAbsDebtSeconds)}′</span>
        </div>
        <p className={cx(styles.note, styles.noteNormal)}>
          ✓ on target · ▲ short of a fair share · ▼ played more than a fair share. Season totals build
          on the Season page, and seed the next match when Season fair-play is on.
        </p>

        {/* ── Who scored ── */}
        {view.scorers.length > 0 && (
          <div className={styles.inkBar} style={{ marginTop: 16, flexWrap: "wrap" }}>
            <span>
              {cfg.scoreIcon} {cfg.scorersLabel} · {view.totalGoals}
            </span>
            <span style={{ fontWeight: 700, letterSpacing: "0.04em" }}>
              {view.scorers
                .map((l) => `${l.name}${l.goals > 1 ? (isBasketball ? ` ${l.goals}pts` : ` ×${l.goals}`) : ""}`)
                .join(" · ")}
            </span>
          </div>
        )}

        {/* ── The match report: what actually happened, in order ── */}
        {view.feed.length > 0 && (
          <details>
            <summary className={styles.sectionHead} style={{ cursor: "pointer" }}>
              Match report · {view.feed.length} entries
            </summary>
            <div style={{ marginTop: 4 }}>
              {view.feed.map((e, i) => {
                const clock = wallClockLabel(e.wallClockISO);
                return (
                  <div
                    key={e.key}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "baseline",
                      padding: "9px 2px",
                      fontSize: 13,
                      borderBottom: i === view.feed.length - 1 ? "none" : "1px dotted var(--rule-hair)",
                    }}
                  >
                    <span style={{ minWidth: 48, fontWeight: 800 }}>{clockTime(e.atSeconds)}</span>
                    <span style={{ flex: 1, minWidth: 0, color: "var(--ink-body)" }}>
                      {feedLineText(e, feedLabels)}
                    </span>
                    {clock && (
                      <span style={{ color: "var(--ink-muted)", fontWeight: 700, fontSize: 12 }}>{clock}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </div>

      {/* ── The wire: send it to the parents ── */}
      <div style={{ marginTop: 22, borderTop: "3px solid var(--ink)", paddingTop: 18 }}>
        <div className={styles.gutter}>
          <Button kind="red" onClick={() => void onCopy()}>
            Copy report for parents&apos; chat
          </Button>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Button kind="outline" small onClick={onDownload}>
              Download .txt
            </Button>
            <ButtonLink href={`/teams/${teamId}/new`} kind="outline" small>
              Next match →
            </ButtonLink>
          </div>
        </div>
      </div>

      {copied && <Toast message="Copied ✓" />}
    </main>
  );
}
