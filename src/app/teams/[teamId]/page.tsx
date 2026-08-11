"use client";
/**
 * The team sheet — one club's squad and its fixture list.
 *
 * Matches read like results in a paper: date, name, what happened, and the score where there is one.
 * The score shown is this team's own — NextOn logs who scored for us and nothing about the
 * opposition, so printing "3" and not "3–2" is the honest version.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/store/appStore";
import { sportOf } from "@/features/sports";
import type { MatchStatus, SavedMatch } from "@/store/schema";
import { ButtonLink, Dateline, Masthead, SectionHead, StatStrip, cx, styles } from "@/ui";
import css from "@/features/teams/teams.module.css";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Fixed format, not a locale one: the list is client-rendered from IndexedDB and must not drift. */
function dateline(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${DAYS[d.getDay()] ?? ""} ${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()] ?? ""}`;
}

/** Our points on the day, from the log. Football goals are worth 1; basketball scores carry theirs. */
function pointsOf(m: SavedMatch): number {
  let total = 0;
  for (const e of m.events) if (e.type === "GOAL_SCORED") total += e.points ?? 1;
  return total;
}

const STATUS_WORD: Record<MatchStatus, string> = {
  setup: "To come",
  live: "● Live",
  completed: "Full time",
};

export default function TeamPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const ready = useAppStore((s) => s.ready);
  const team = useAppStore((s) => s.teams.find((t) => t.id === teamId));
  const listMatches = useAppStore((s) => s.listMatches);
  const deleteMatch = useAppStore((s) => s.deleteMatch);
  // Re-fetch whenever match data changes (create/delete/kickoff/end) so the fixture list is never
  // stale after the router restores this screen from its cache.
  const matchRev = useAppStore((s) => s.matchRev);
  const [matches, setMatches] = useState<SavedMatch[]>([]);

  useEffect(() => {
    if (teamId) void listMatches(teamId).then(setMatches);
  }, [teamId, listMatches, team, matchRev]);

  async function removeMatch(m: SavedMatch): Promise<void> {
    if (typeof window !== "undefined" && !window.confirm(`Delete ${m.name}? This can't be undone.`)) return;
    await deleteMatch(m.id);
    setMatches(await listMatches(teamId));
  }

  if (!ready) {
    return (
      <main className={styles.page}>
        <Masthead slug="Team sheet" back="/teams" />
        <Dateline left="Grassroots desk" right="Loading" />
        <div className={styles.gutter}>
          <p className={styles.empty}>Fetching the team sheet…</p>
        </div>
      </main>
    );
  }

  if (!team) {
    return (
      <main className={styles.page}>
        <Masthead slug="Team sheet" back="/teams" />
        <Dateline left="Grassroots desk" right="Not found" />
        <div className={styles.gutter}>
          <h1 className={styles.hed} style={{ marginTop: 22 }}>
            No such team.
          </h1>
          <p className={styles.standfirst}>
            It may have been deleted on this device, or the link is for a squad that lives under a
            different sync code.
          </p>
          <div className={css.foot}>
            <ButtonLink href="/teams" kind="ink">
              Back to the teams
            </ButtonLink>
          </div>
        </div>
      </main>
    );
  }

  const cfg = sportOf(team.sport);
  const keepers = team.roster.filter((p) => p.canPlayGK).length;
  const fixtures = matches.slice().reverse(); // newest first, as a results column reads

  return (
    <main className={styles.page}>
      <Masthead slug="Team sheet" back="/teams" />
      <Dateline
        left={`${cfg.label} · ${team.defaultOnFieldCount}${cfg.formatSuffix}`}
        right={`Squad of ${team.roster.length}`}
      />

      <div className={styles.gutter}>
        <h1 className={styles.hed} style={{ marginTop: 20 }}>
          {team.name}
        </h1>
        <p className={styles.standfirst}>
          {team.ageGroup ? `${team.ageGroup} · ` : ""}
          {team.roster.length} {team.roster.length === 1 ? "player" : "players"}
          {cfg.hasGoalkeeper ? ` · ${keepers} keeper${keepers === 1 ? "" : "s"}` : ""}
          {team.seasonCarryForward ? " · season fair play on" : ""}
        </p>

        <StatStrip
          cells={[
            { value: String(team.roster.length), label: "Squad" },
            { value: String(team.defaultOnFieldCount), label: cfg.onSurfaceLabel },
            { value: String(matches.length), label: "Matches", red: true },
          ]}
        />

        <div style={{ marginTop: 16 }}>
          <ButtonLink href={`/teams/${team.id}/new`} kind="red">
            Start a match ▶
          </ButtonLink>
          <div className={css.footRow} style={{ marginTop: 8 }}>
            <ButtonLink href={`/teams/${team.id}/season`} kind="outline" small>
              Season minutes
            </ButtonLink>
            <ButtonLink href={`/teams/${team.id}/edit`} kind="outline" small>
              Edit team
            </ButtonLink>
          </div>
        </div>

        <SectionHead>The squad</SectionHead>
        {team.roster.length === 0 ? (
          <p className={cx(styles.note, styles.noteNormal)} style={{ padding: "14px 0" }}>
            No names on the sheet yet. Edit the team to add your squad.
          </p>
        ) : (
          team.roster.map((p, i) => (
            <div
              key={p.id}
              className={cx(css.squadRow, i === team.roster.length - 1 && css.squadRowLast)}
            >
              <span className={css.squadName}>{p.name}</span>
              <span className={css.squadTag}>
                {cfg.hasGoalkeeper && p.canPlayGK ? "🧤 Keeper" : ""}
              </span>
            </div>
          ))
        )}

        <SectionHead>Matches</SectionHead>
        {fixtures.length === 0 ? (
          <div className={css.emptyBlock}>
            <div className={css.emptyHed}>No matches on file.</div>
            <p className={cx(styles.note, styles.noteNormal)}>
              Set one up and you get a recommended line-up, a sub plan, and a fair-minutes report at
              full time.
            </p>
          </div>
        ) : (
          fixtures.map((m, i) => {
            const points = pointsOf(m);
            const when = dateline(m.startedAtISO ?? m.createdAt);
            return (
              <div key={m.id} className={cx(css.matchRow, i === fixtures.length - 1 && css.matchRowLast)}>
                <Link
                  href={
                    m.status === "completed"
                      ? `/teams/${team.id}/match/${m.id}/review`
                      : `/teams/${team.id}/match/${m.id}`
                  }
                  className={css.matchLink}
                >
                  <span className={css.matchMain}>
                    <span className={css.matchName}>{m.name}</span>
                    <span className={css.matchSub}>
                      {when}
                      {m.status === "setup" ? "" : ` · ${points} ${cfg.scoreIcon}`}
                    </span>
                  </span>
                  <span
                    className={cx(
                      css.badge,
                      m.status === "live" && css.badgeLive,
                      m.status === "completed" && css.badgeDone,
                      m.status === "setup" && css.badgeSetup,
                    )}
                  >
                    {STATUS_WORD[m.status]}
                  </span>
                </Link>
                <button
                  type="button"
                  className={cx(styles.iconBtn, styles.iconBtnBare)}
                  aria-label={`Delete ${m.name}`}
                  onClick={() => void removeMatch(m)}
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
