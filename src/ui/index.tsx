"use client";
/**
 * Back Page primitives.
 *
 * Deliberately few. The design is rules, ink and one red, so most "components" elsewhere are just a
 * border and a font here. What earns a component is anything that must stay identical across
 * screens: the masthead, the dateline, the section rule, the status word, and the buttons.
 */
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import styles from "./ui.module.css";

export { default as styles } from "./ui.module.css";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** m:ss — the live clock. */
export function clockTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Minutes with the prime mark, as every number in this design is written: 24′ */
export function mins(seconds: number): string {
  return `${Math.round(seconds / 60)}′`;
}

/**
 * NEXT + red ON. The one piece of brand in the whole product.
 *
 * `onInk` is required on any dark surface — the default is ink-coloured, so on the live screen's
 * inverted header it renders black on black and only the red "ON" is visible.
 */
export function Wordmark({ large = false, onInk = false }: { large?: boolean; onInk?: boolean }) {
  return (
    <span className={cx(styles.wordmark, large && styles.wordmarkLarge, onInk && styles.wordmarkOnInk)}>
      NEXT<span className={styles.wordmarkOn}>ON</span>
    </span>
  );
}

interface MastheadProps {
  /** Right-hand slug — "THE ROSTER", "FINAL EDITION". The section of the paper you're in. */
  slug: string;
  /** Renders a back arrow at 44px when given. */
  back?: string;
  large?: boolean;
}

export function Masthead({ slug, back, large }: MastheadProps) {
  return (
    <header className={styles.masthead}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {back && (
          <Link href={back} className={styles.backLink} aria-label="Back">
            ←
          </Link>
        )}
        {back ? (
          <Wordmark large={large} />
        ) : (
          <Link href="/" style={{ textDecoration: "none" }} aria-label="NextOn home">
            <Wordmark large={large} />
          </Link>
        )}
      </span>
      <span className={styles.mastheadSlug}>{slug}</span>
    </header>
  );
}

/** The thin strip under the masthead: where you are, and one fact about it. */
export function Dateline({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className={styles.dateline}>
      <span>{left}</span>
      {right !== undefined && <span>{right}</span>}
    </div>
  );
}

/** Anton, uppercase, on a 3px rule. Red variant for the bench/secondary column. */
export function SectionHead({
  children,
  red = false,
  small = false,
  style,
}: {
  children: ReactNode;
  red?: boolean;
  small?: boolean;
  style?: CSSProperties;
}) {
  return (
    <h2
      className={cx(styles.sectionHead, red && styles.sectionHeadRed, small && styles.sectionHeadSm)}
      style={style}
    >
      {children}
    </h2>
  );
}

type ButtonKind = "ink" | "red" | "outline";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  kind?: ButtonKind;
  small?: boolean;
  auto?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  style?: CSSProperties;
  ariaLabel?: string;
}

export function Button({
  children, onClick, kind = "ink", small, auto, disabled, type = "button", style, ariaLabel,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={style}
      className={cx(
        styles.cta,
        kind === "ink" && styles.ctaInk,
        kind === "red" && styles.ctaRed,
        kind === "outline" && styles.ctaOutline,
        small && styles.ctaSm,
        auto && styles.ctaAuto,
      )}
    >
      {children}
    </button>
  );
}

/** Same shape as Button, but a link. Used for every CTA that navigates. */
export function ButtonLink({
  href, children, kind = "ink", small, auto, style,
}: {
  href: string;
  children: ReactNode;
  kind?: ButtonKind;
  small?: boolean;
  auto?: boolean;
  style?: CSSProperties;
}) {
  return (
    <Link
      href={href}
      style={style}
      className={cx(
        styles.cta,
        kind === "ink" && styles.ctaInk,
        kind === "red" && styles.ctaRed,
        kind === "outline" && styles.ctaOutline,
        small && styles.ctaSm,
        auto && styles.ctaAuto,
      )}
    >
      {children}
    </Link>
  );
}

export type StatusKind = "on" | "under" | "over";

/** Glyph + WORD + colour, always all three — a coach who can't see red still reads "REST". */
const STATUS_TEXT: Record<StatusKind, { glyph: string; word: string; full: string }> = {
  on: { glyph: "✓", word: "ON TRK", full: "on target" },
  under: { glyph: "▲", word: "NEEDS", full: "needs minutes" },
  over: { glyph: "▼", word: "REST", full: "earned a rest" },
};

export function Status({ kind, wordless = false }: { kind: StatusKind; wordless?: boolean }) {
  const s = STATUS_TEXT[kind];
  return (
    <span
      className={cx(
        styles.status,
        kind === "on" && styles.statusOn,
        kind === "under" && styles.statusUnder,
        kind === "over" && styles.statusOver,
      )}
      title={s.full}
    >
      {wordless ? s.glyph : `${s.glyph} ${s.word}`}
      {wordless && <span className={styles.srOnly}> {s.full}</span>}
    </span>
  );
}

/** A 10px track with the ink fill and the red fair-share tick. */
export function FairBar({ pct, fairPct }: { pct: number; fairPct: number }) {
  return (
    <span className={styles.barTrack} aria-hidden>
      <span className={styles.barFill} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      <span className={styles.barTick} style={{ left: `${Math.max(0, Math.min(100, fairPct))}%` }} />
    </span>
  );
}

/** The three-up stat strip inside a 3px border. */
export function StatStrip({ cells }: { cells: { value: string; label: string; red?: boolean }[] }) {
  return (
    <div className={styles.statStrip}>
      {cells.map((c) => (
        <div key={c.label} className={styles.statCell}>
          <div className={styles.statValue} style={c.red ? { color: "var(--red)" } : undefined}>
            {c.value}
          </div>
          <div className={styles.statLabel}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return (
    <div className={styles.toast} role="status">
      {message}
    </div>
  );
}

/** Bottom sheet. Square, ink-ruled — a pasted-in correction slip, not a rounded card. */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
