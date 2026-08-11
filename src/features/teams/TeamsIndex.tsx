"use client";
/**
 * The teams index — the returning coach's front page.
 *
 * A back page lists clubs, not cards: each team is an entry under a dotted rule with its facts in
 * the dateline voice and its two live actions beneath. The original app's coloured team initials
 * disc has no equivalent here — the Back Page is paper, ink and one red — so the team's name carries
 * itself at masthead size instead.
 */
import { useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/store/appStore";
import { sportOf } from "@/features/sports";
import { ButtonLink, Dateline, Masthead, SectionHead, cx, styles } from "@/ui";
import css from "./teams.module.css";

const SHARE_TEXT =
  "NextOn — fair playing time for every player. Free, no accounts, works offline at the pitch.";

export function TeamsIndex() {
  const ready = useAppStore((s) => s.ready);
  const teams = useAppStore((s) => s.teams);
  const [shareNote, setShareNote] = useState("");

  /** Native share sheet on a phone, clipboard on a desktop, a visible link if both are blocked. */
  async function share(): Promise<void> {
    const url = window.location.origin;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "NextOn", text: SHARE_TEXT, url });
        return;
      } catch (e) {
        // Closing the share sheet is a choice, not an error; anything else falls back to copy.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareNote("Link copied — paste it to another coach.");
    } catch {
      setShareNote(`Copy this link: ${url}`);
    }
  }

  return (
    <main className={styles.page}>
      <Masthead slug="My teams" />
      <Dateline
        left="Grassroots desk"
        right={ready ? `${teams.length} ${teams.length === 1 ? "team" : "teams"} on file` : "Loading"}
      />

      <div className={styles.gutter}>
        {!ready ? (
          <p className={styles.empty}>Fetching the team sheets…</p>
        ) : teams.length === 0 ? (
          <>
            <h1 className={styles.hed} style={{ marginTop: 22 }}>
              No teams on file.
            </h1>
            <p className={styles.standfirst}>
              Name a squad and NextOn does the rest — minutes tracked live, subs suggested, nobody
              goes home short.
            </p>
            <div className={css.foot}>
              <ButtonLink href="/onboarding" kind="red">
                Create your team →
              </ButtonLink>
              <p className={css.footNote}>Saved on this phone · no account</p>
            </div>
          </>
        ) : (
          <>
            <SectionHead>The clubs</SectionHead>
            {teams.map((team, i) => {
              const cfg = sportOf(team.sport);
              return (
                <div key={team.id} className={cx(css.entry, i === teams.length - 1 && css.entryLast)}>
                  <Link href={`/teams/${team.id}`} className={css.entryLink}>
                    <span className={css.entryName}>{team.name}</span>
                    <span className={css.chev} aria-hidden>
                      ›
                    </span>
                  </Link>
                  <p className={css.entryMeta}>
                    {team.ageGroup ? `${team.ageGroup} · ` : ""}
                    {cfg.label} · {team.defaultOnFieldCount}
                    {cfg.formatSuffix} · {team.roster.length}{" "}
                    {team.roster.length === 1 ? "player" : "players"}
                  </p>
                  <div className={css.entryActions}>
                    <ButtonLink href={`/teams/${team.id}/new`} kind="red" small>
                      Start a match ▶
                    </ButtonLink>
                    <ButtonLink href={`/teams/${team.id}/season`} kind="outline" small>
                      Season
                    </ButtonLink>
                  </div>
                </div>
              );
            })}

            <div className={css.foot}>
              <ButtonLink href="/onboarding" kind="outline">
                ＋ Add another team
              </ButtonLink>
            </div>

            <p className={css.deadline}>
              <button type="button" className={css.linkBtn} onClick={() => void share()}>
                Share NextOn
              </button>
              {" · "}
              <Link href="/settings">Settings</Link>
              {" · "}
              <Link href="/contact">Letters to the editor</Link>
            </p>
            {shareNote ? (
              <p className={css.footNote} role="status">
                {shareNote}
              </p>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
