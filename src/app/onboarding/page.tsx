"use client";
/**
 * First run — two pages of the paper: the club details, then The Roster.
 *
 * The original app opened on a third, purely explanatory step. The Back Page already IS that step —
 * a stranger arriving at `/` reads the whole pitch before they ever tap "create your team" — so
 * repeating it here would be asking a coach to read the same argument twice.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Player } from "@/engine";
import { useAppStore } from "@/store/appStore";
import { sportOf } from "@/features/sports";
import { reportActivityOnce } from "@/store/telemetry";
import { SquadEditor } from "@/features/teams/SquadEditor";
import { DEFAULT_TEAM_COLOUR, TeamForm, type TeamBasics } from "@/features/teams/TeamForm";
import { Button, ButtonLink, Dateline, Masthead, styles } from "@/ui";
import css from "@/features/teams/teams.module.css";

export default function OnboardingPage() {
  const router = useRouter();
  const saveTeam = useAppStore((s) => s.saveTeam);

  const [step, setStep] = useState<0 | 1>(0);
  const [basics, setBasics] = useState<TeamBasics>({
    name: "",
    ageGroup: "",
    sport: "football",
    format: sportOf("football").defaultOnFieldCount,
  });
  const [players, setPlayers] = useState<Player[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cfg = sportOf(basics.sport);
  const named = basics.name.trim().length > 0;

  // Reaching setup is a genuinely new user's first real intent signal (a marketing-page visit
  // isn't). Once per device — a coach adding a second team later won't re-fire it.
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    reportActivityOnce("first_run", `Started setup${tz ? ` · ${tz}` : ""}`);
  }, []);

  async function finish(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const team = await saveTeam({
        name: basics.name.trim(),
        ageGroup: basics.ageGroup.trim() || undefined,
        colour: DEFAULT_TEAM_COLOUR,
        sport: basics.sport,
        defaultOnFieldCount: basics.format,
        roster: players,
      });
      router.push(`/teams/${team.id}`);
    } catch (e) {
      // Loud, never silent (invariant #6): the coach has just typed a squad in and must not be
      // left thinking it saved.
      setSaving(false);
      setError(e instanceof Error ? e.message : "Couldn't save the team. Try again.");
    }
  }

  if (step === 0) {
    return (
      <main className={styles.page}>
        <Masthead slug="New team" back="/" />
        <Dateline left="Grassroots desk" right="Page 1 of 2" />

        <div className={styles.gutter}>
          <h1 className={styles.hed} style={{ marginTop: 20 }}>
            Name the club.
          </h1>
          <p className={styles.standfirst}>
            The team, the game, and how many play at once. None of it is final — you can change any
            of it later, and the format again for a single match.
          </p>

          <TeamForm value={basics} onChange={(patch) => setBasics((b) => ({ ...b, ...patch }))} autoFocusName />

          <div className={css.foot}>
            <Button kind="ink" onClick={() => setStep(1)} disabled={!named}>
              Next — the roster →
            </Button>
            <p className={css.footNote}>Saved on this phone · no account</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <Masthead slug="The roster" back="/" />
      <Dateline
        left={`${basics.name.trim() || "New team"}${basics.ageGroup.trim() ? ` · ${basics.ageGroup.trim()}` : ""}`}
        right={`Squad of ${players.length}`}
      />

      <div className={styles.gutter}>
        <h1 className={styles.hed} style={{ marginTop: 20 }}>
          Name the squad.
        </h1>
        <p className={styles.standfirst}>
          First names are all it needs. Add everyone who might turn up
          {cfg.hasGoalkeeper ? " — keepers included" : ""}.
        </p>

        <SquadEditor value={players} onChange={setPlayers} sport={basics.sport} />

        <div className={css.foot}>
          <Button kind="ink" onClick={() => void finish()} disabled={saving || !named}>
            {saving ? "Saving…" : "Done — to the team sheet →"}
          </Button>
          {error ? <p className={css.error}>{error}</p> : null}
          <div className={css.footRow} style={{ marginTop: 8 }}>
            <ButtonLink href="/" kind="outline" small>
              Cancel
            </ButtonLink>
            <Button kind="outline" small onClick={() => setStep(0)}>
              ← Club details
            </Button>
          </div>
          <p className={css.footNote}>Saved on this phone · no account</p>
        </div>
      </div>
    </main>
  );
}
