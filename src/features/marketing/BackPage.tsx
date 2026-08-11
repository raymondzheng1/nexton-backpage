"use client";
/**
 * The Back Page — the marketing page, styled as a tabloid back page.
 *
 * Newsprint, black ink, one red. The conceit is load-bearing rather than decorative: a back page is
 * where results and player ratings live, which is exactly what this product produces. The "match
 * photo" is a halftone-screened CSS pattern with an inline SVG pitch and a sub-editor's annotation
 * arrow scrawled over it.
 *
 * Everything on this page is honest. The box score is illustrative and labelled as a specimen; there
 * are no testimonials, user counts or logos, invented or otherwise.
 */
import Link from "next/link";
import { useAppStore } from "@/store/appStore";
import { ButtonLink, Wordmark, styles } from "@/ui";
import back from "./backPage.module.css";

/** Specimen box score. Neutral first names, numbers that actually add up to a fair spread. */
const BOX_SCORE = [
  { name: "Ava", mins: "24′", goals: "1" },
  { name: "Sam", mins: "23′", goals: "2" },
  { name: "Leo", mins: "23′", goals: "—" },
  { name: "Maya", mins: "22′", goals: "—" },
];

export function BackPage() {
  const teams = useAppStore((s) => s.teams);
  const hasTeams = teams.length > 0;

  return (
    <main className={back.paper}>
      {/* ── Masthead ── */}
      <div className={back.masthead}>
        <Wordmark large />
        {hasTeams ? (
          <Link href="/teams" className={back.mastheadLink}>
            Open the app →
          </Link>
        ) : (
          <span className={back.edition}>Saturday edition · Free</span>
        )}
      </div>

      {/* ── Dateline ── */}
      <div className={back.dateline}>
        <span>Grassroots desk</span>
        <span>⚽ Football · 🏀 Basketball</span>
      </div>

      {/* ── Headline ── */}
      <div className={back.hedBlock}>
        <h1 className={back.hed}>
          Everyone plays.
          <br />
          <span className={back.hedRed}>No arguments.</span>
        </h1>
        <p className={back.standfirst}>
          <strong>EXCLUSIVE</strong> — the free app tracking every kid&apos;s minutes live, telling
          coaches when to sub and who. Nobody goes home short.
        </p>
        <ButtonLink href="/onboarding" kind="red" style={{ marginTop: 18, height: 52, fontSize: 18 }}>
          Create your team — free
        </ButtonLink>
        <div className={back.trustRow}>
          <span>No account</span>
          <span>·</span>
          <span>Works offline</span>
          <span>·</span>
          <span>Free</span>
        </div>
      </div>

      {/* ── The match photo ── */}
      <div className={back.figureWrap}>
        <figure className={back.figure}>
          <div className={back.halftone}>
            {/* Pitch markings, drawn not photographed. */}
            <svg
              viewBox="0 0 100 60"
              preserveAspectRatio="none"
              className={back.pitchLines}
              fill="none"
              stroke="rgba(20,19,17,.55)"
              strokeWidth="0.5"
              aria-hidden
            >
              <rect x="3" y="3" width="94" height="54" rx="1" />
              <line x1="50" y1="3" x2="50" y2="57" />
              <circle cx="50" cy="30" r="9" />
              <rect x="3" y="16" width="12" height="28" />
              <rect x="85" y="16" width="12" height="28" />
            </svg>

            {/* Leo — flagged for a rest. Outlined in red like a sub-editor's ring. */}
            <div className={back.playerLeo}>
              <div className={back.discOutline}>Leo</div>
              <div className={back.capOff}>21′ ▼ OFF</div>
            </div>

            {/* The annotation: a dashed arrow from the bench up to the player coming off. */}
            <svg viewBox="0 0 360 230" className={back.arrow} fill="none" aria-hidden>
              <path
                d="M300 170 C 250 160, 160 120, 108 86"
                stroke="#d92b21"
                strokeWidth="3"
                strokeDasharray="10 7"
                strokeLinecap="round"
              />
              <path
                d="M116 92 l-12 -7 14 -5"
                stroke="#d92b21"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            {/* Ava — going on. Solid ink. */}
            <div className={back.playerAva}>
              <div className={back.discSolid}>Ava</div>
              <div className={back.capOn}>8′ ▲ ON</div>
            </div>
          </div>
          <figcaption className={back.figCaption}>
            <strong>PICTURED:</strong> the live match view. The app flags Leo for a rest at 21′ and
            sends Ava on — the coach just taps to agree.
          </figcaption>
        </figure>
      </div>

      {/* ── Box score ── */}
      <div className={back.section}>
        <h2 className={back.sectionHead}>Box score — full time</h2>
        <div>
          <div className={`${back.scoreGrid} ${back.scoreHead}`}>
            <span>Player</span>
            <span className={back.right}>Min</span>
            <span className={back.right}>⚽</span>
            <span className={back.right}>Fair</span>
          </div>
          {BOX_SCORE.map((r, i) => (
            <div
              key={r.name}
              className={`${back.scoreGrid} ${back.scoreRow} ${i === BOX_SCORE.length - 1 ? back.scoreRowLast : ""}`}
            >
              <span>{r.name}</span>
              <span className={back.right}>{r.mins}</span>
              <span className={back.right}>{r.goals}</span>
              <span className={`${back.right} ${back.check}`}>✓</span>
            </div>
          ))}
        </div>
        <div className={back.scoreFoot}>
          <span>Fairness spread: 2′</span>
          <span className={back.footRed}>Copied to parents&apos; chat in 1 tap</span>
        </div>
        <p className={back.specimen}>Specimen box score — an example, not a real match.</p>
      </div>

      {/* ── Column: The Fixer ── */}
      <div className={back.column}>
        <h2 className={back.columnHead}>Column: the fixer</h2>
        <p className={back.columnBody}>
          It never subs anyone by itself. A countdown, a name off, a name on —{" "}
          <strong>you confirm, edit, snooze or dismiss.</strong> Three taps a match, the paper
          reckons.
        </p>
      </div>

      {/* ── Classifieds ── */}
      <div className={back.classifieds}>
        <span>Classifieds: pitch 3 has no wifi</span>
        <a href="#offline" className={back.classifiedsLink}>
          Doesn&apos;t need any →
        </a>
      </div>

      {/* ── Footer ── */}
      <div className={back.footer} id="offline">
        <ButtonLink href="/onboarding" kind="ink" style={{ height: 52, fontSize: 18 }}>
          Create your team
        </ButtonLink>
        <div className={back.footTrust}>Free · No accounts · Offline · Installs like an app</div>
        <div className={back.footLetters}>
          Letters to the editor:{" "}
          <Link href="/contact" className={back.footLink}>
            contact the developer →
          </Link>
        </div>
      </div>
    </main>
  );
}

export { styles };
