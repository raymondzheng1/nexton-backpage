"use client";
/**
 * Settings — the house rules.
 *
 * Coach-level defaults (rotation, keeper policy, tolerance, how often to change players), the alert
 * cues, the cross-device sync code, backup and the share link. All device-local except the sync
 * code, which is the app's entire identity system: no accounts, no login, one short bearer code.
 *
 * Because that code IS the credential, it is masked until the coach asks to see it. A settings screen
 * gets handed to another parent, mirrored to a TV, or screenshotted for a bug report — none of which
 * should leak a code that opens the whole season.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { SUB_FREQUENCY_LEVELS, type GkPolicy, type RotationStyle } from "@/engine";
import { useAppStore } from "@/store/appStore";
import { generateCapabilityCode } from "@/store/ids";
import { Button, Dateline, Masthead, SectionHead, cx, styles } from "@/ui";

const ROTATIONS: { label: string; value: RotationStyle }[] = [
  { label: "Continuous", value: "continuous" },
  { label: "Interval", value: "interval" },
  { label: "Period", value: "period" },
];
const GK_POLICIES: { label: string; value: GkPolicy }[] = [
  { label: "Counts", value: "countAsFieldTime" },
  { label: "Rotate", value: "rotateSeparately" },
  { label: "Fixed", value: "fixedGK" },
];

/** Rotation-dial level names, index = level − 1. The coach's words, not the algorithm's. */
const LEVEL_LABELS = ["Fewest changes", "Fewer changes", "Balanced", "More changes", "Most changes"];
const MAX_LEVEL = SUB_FREQUENCY_LEVELS.length;

const SHARE_TEXT =
  "NextOn — fair playing time for every player. Free, no accounts, works offline at the pitch.";

/** Filled = chosen, outlined = not. `aria-pressed` carries the state that the fill only shows. */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <span className={styles.label}>{label}</span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${options.length}, 1fr)`,
          gap: 6,
          marginTop: 6,
        }}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cx(styles.cta, styles.ctaSm, value === o.value ? styles.ctaInk : styles.ctaOutline)}
            style={{ fontSize: 13, letterSpacing: "0.03em", padding: "0 6px" }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stepper({
  value,
  onChange,
  min,
  max,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  ariaLabel: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        className={styles.iconBtn}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`${ariaLabel}: one less`}
      >
        −
      </button>
      <span
        style={{ fontFamily: "var(--font-display)", fontSize: 22, minWidth: 32, textAlign: "center" }}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        className={styles.iconBtn}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`${ariaLabel}: one more`}
      >
        +
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const code = useAppStore((s) => s.code);
  const syncStatus = useAppStore((s) => s.syncStatus);
  const setCode = useAppStore((s) => s.setCode);
  const clearCode = useAppStore((s) => s.clearCode);
  const syncCloud = useAppStore((s) => s.syncCloud);
  const exportData = useAppStore((s) => s.exportData);
  const importData = useAppStore((s) => s.importData);
  const prefs = useAppStore((s) => s.prefs);
  const setPrefs = useAppStore((s) => s.setPrefs);

  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  /** `created` = we just minted this code here; otherwise the coach typed an existing one (a second
   *  device linking in). The two are different operator signals. */
  async function activate(value: string, created = false): Promise<void> {
    setError("");
    try {
      await setCode(value, { created });
      setCodeInput("");
      setRevealed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't activate that code.");
    }
  }

  async function onExport(): Promise<void> {
    const json = await exportData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexton-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImportFile(file: File): Promise<void> {
    setError("");
    try {
      await importData(await file.text());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    }
  }

  /** Native share sheet on a phone, clipboard on a desktop, visible link if both are blocked. */
  async function onShare(): Promise<void> {
    const url = `${window.location.origin}/welcome`;
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

  const level = Math.min(MAX_LEVEL, Math.max(1, Math.round(prefs.subFrequency)));

  return (
    <main className={styles.page}>
      <Masthead slug="Settings" back="/" />
      <Dateline left="House rules" right="No account · this phone" />

      <div className={styles.gutter}>
        {/* ── Sync ── */}
        <SectionHead>Sync across devices</SectionHead>
        <p className={cx(styles.note, styles.noteNormal)}>
          No account needed. Use one code on every device — phone, tablet — to carry your teams and
          history between them. Anyone who has the code can read your data, so keep it off group chats.
        </p>

        {code ? (
          <div style={{ marginTop: 12 }}>
            <div className={cx(styles.box, styles.boxThin)}>
              <span className={styles.label}>Your code</span>
              <div className={styles.spread} style={{ marginTop: 6 }}>
                <strong style={{ fontSize: 20, letterSpacing: "0.14em", fontWeight: 800 }}>
                  {revealed ? code : "•••-•••"}
                </strong>
                <button
                  type="button"
                  className={cx(styles.cta, styles.ctaSm, styles.ctaOutline, styles.ctaAuto)}
                  aria-pressed={revealed}
                  onClick={() => setRevealed((r) => !r)}
                  style={{ fontSize: 13 }}
                >
                  {revealed ? "Hide" : "Reveal"}
                </button>
              </div>
            </div>
            <p className={styles.note} style={{ marginTop: 8 }}>
              Status: {syncStatus}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Button kind="outline" small onClick={() => void syncCloud()}>
                Sync now
              </Button>
              <Button kind="outline" small onClick={() => void clearCode()}>
                Stop on this device
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder="ABC-DEF"
                aria-label="Capability code"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                style={{ flex: 1, letterSpacing: "0.1em", fontWeight: 700 }}
              />
              <Button
                kind="ink"
                small
                auto
                onClick={() => void activate(codeInput)}
                disabled={codeInput.trim().length === 0}
              >
                Use code
              </Button>
            </div>
            <Button
              kind="outline"
              small
              onClick={() => void activate(generateCapabilityCode(), true)}
              style={{ marginTop: 8 }}
            >
              Create a new code
            </Button>
          </div>
        )}

        {/* ── Match defaults ── */}
        <SectionHead>Match defaults</SectionHead>
        <p className={cx(styles.note, styles.noteNormal)}>
          Every new match starts here. You can still change any of it per match.
        </p>

        <Segmented
          label="Rotation style"
          options={ROTATIONS}
          value={prefs.rotationStyle}
          onChange={(v) => setPrefs({ rotationStyle: v })}
        />
        <Segmented
          label="Goalkeeper"
          options={GK_POLICIES}
          value={prefs.gkPolicy}
          onChange={(v) => setPrefs({ gkPolicy: v })}
        />

        <div className={styles.spread} style={{ marginTop: 16 }}>
          <span className={styles.label} style={{ flex: 1 }}>
            Fairness tolerance (min)
          </span>
          <Stepper
            value={prefs.fairnessToleranceMinutes}
            onChange={(v) => setPrefs({ fairnessToleranceMinutes: v })}
            min={1}
            max={6}
            ariaLabel="Default fairness tolerance"
          />
        </div>

        {/* The rotation dial. Fairness can be bought with a few long stints or many short ones; the
            engine prices it either way, and this is where the coach says which they want. */}
        <div style={{ marginTop: 18 }}>
          <div className={styles.spread}>
            <span className={styles.label}>How often to change players</span>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 17,
                textTransform: "uppercase",
                color: "var(--red)",
              }}
            >
              {LEVEL_LABELS[level - 1] ?? "Balanced"}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={MAX_LEVEL}
            step={1}
            value={level}
            aria-label="How often to change players"
            aria-valuetext={LEVEL_LABELS[level - 1] ?? "Balanced"}
            onChange={(e) => setPrefs({ subFrequency: Number(e.target.value) })}
            style={{
              width: "100%",
              // The element's own box is the touch target; the native track renders thinner inside it.
              height: 44,
              minHeight: 44,
              margin: 0,
              padding: 0,
              border: "none",
              background: "transparent",
              accentColor: "var(--red)",
              cursor: "pointer",
            }}
          />
          <div className={styles.spread} style={{ marginTop: -4 }}>
            <span className={styles.note}>Fewer · longer stints</span>
            <span className={styles.note}>More · shorter stints</span>
          </div>
        </div>

        {/* ── Alerts ── */}
        <SectionHead>Alerts</SectionHead>
        <p className={cx(styles.note, styles.noteNormal)}>
          Cues when a change is due, while the app is open. The app holds the screen awake during a
          match so they keep firing.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 12 }}>
          <button
            type="button"
            aria-pressed={prefs.sound}
            onClick={() => setPrefs({ sound: !prefs.sound })}
            className={cx(styles.cta, styles.ctaSm, prefs.sound ? styles.ctaInk : styles.ctaOutline)}
            style={{ fontSize: 14 }}
          >
            🔊 Sound {prefs.sound ? "on" : "off"}
          </button>
          <button
            type="button"
            aria-pressed={prefs.vibrate}
            onClick={() => setPrefs({ vibrate: !prefs.vibrate })}
            className={cx(styles.cta, styles.ctaSm, prefs.vibrate ? styles.ctaInk : styles.ctaOutline)}
            style={{ fontSize: 14 }}
          >
            📳 Buzz {prefs.vibrate ? "on" : "off"}
          </button>
        </div>

        {/* ── Backup ── */}
        <SectionHead>Backup</SectionHead>
        <p className={cx(styles.note, styles.noteNormal)}>
          Export a JSON file of everything, or restore one. Also the simplest way onto a new device.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button kind="outline" small onClick={() => void onExport()}>
            Export data
          </Button>
          <Button kind="outline" small onClick={() => fileRef.current?.click()}>
            Import data
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImportFile(file);
              e.target.value = "";
            }}
          />
        </div>

        {/* ── Share ── */}
        <SectionHead>Share NextOn</SectionHead>
        <p className={cx(styles.note, styles.noteNormal)}>
          Know another coach? It&apos;s free — send the link and they can name a squad in minutes.
        </p>
        <Button kind="outline" small onClick={() => void onShare()} style={{ marginTop: 12 }}>
          📤 Share the app
        </Button>
        {shareNote && (
          <p className={cx(styles.note, styles.noteNormal)} role="status">
            {shareNote}
          </p>
        )}

        {error && (
          <div
            className={cx(styles.box, styles.boxThin)}
            role="alert"
            style={{ marginTop: 18, borderColor: "var(--red)", color: "var(--red)", fontWeight: 700 }}
          >
            {error}
          </div>
        )}

        <p className={cx(styles.note, styles.noteNormal)} style={{ marginTop: 24, textAlign: "center" }}>
          NextOn — local-first, no account. Made for the touchline.
          <br />
          {/* inline-block padding, so the one link at the bottom of a long page is still a 44px target */}
          <Link href="/contact" style={{ display: "inline-block", padding: "14px 8px" }}>
            Letters to the editor →
          </Link>
        </p>
      </div>
    </main>
  );
}
