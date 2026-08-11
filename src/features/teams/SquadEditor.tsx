"use client";
/**
 * The Roster — add a name, order the list, say what each player can play, take one out.
 *
 * Shared by onboarding and the corrections screen so both edit an engine `Player[]` directly
 * (PRD §8.1). The row is deliberately one line: handle, name, one tag, remove. Everything the
 * original editor spread across three rows of chips per player — positions, keeper, preferred side,
 * inline rename — moved behind the tag, which doubles as the summary of it. Nothing was dropped; a
 * coach typing eleven names just shouldn't have to scroll past sixty chips to do it.
 */
import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { Player, PositionGroup, PositionSlot, Sport } from "@/engine";
import { newId } from "@/store/ids";
import { sportOf, type SportConfig } from "@/features/sports";
import { Button, SectionHead, Sheet, cx, styles } from "@/ui";
import css from "./teams.module.css";

interface SquadEditorProps {
  value: Player[];
  onChange: (players: Player[]) => void;
  /** Drives the position chips, the keeper toggle and the help text. Default football. */
  sport?: Sport;
  /**
   * Minutes already on the books, by player id. A player with a record gets a confirmation before
   * they leave the squad — their history survives (it lives on the match snapshots), but the coach
   * should know they're removing someone who has actually played.
   */
  playedSecondsById?: Record<string, number>;
}

const SIDES: { value: NonNullable<Player["preferredSide"]>; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "centre", label: "Centre" },
  { value: "right", label: "Right" },
];

/** The tag is the row's whole summary, so it says what's set — or "any position" when nothing is. */
function tagLabel(p: Player, cfg: SportConfig): string {
  const parts: string[] = [];
  if (cfg.hasGoalkeeper && p.canPlayGK) parts.push("🧤 Keeper");
  for (const g of cfg.positionGroups) {
    if (p.eligiblePositions.includes(g.value)) parts.push(g.chip);
  }
  return parts.length > 0 ? parts.join(" · ") : "Any position";
}

export function SquadEditor({ value, onChange, sport, playedSecondsById }: SquadEditorProps) {
  const cfg = sportOf(sport);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const editing = value.find((p) => p.id === editingId) ?? null;
  const keepers = value.filter((p) => p.canPlayGK).length;

  function add(): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    onChange([
      ...value,
      {
        id: newId(),
        name: trimmed,
        squadNumber: value.length + 1,
        eligiblePositions: [],
        preferredPositions: [],
        canPlayGK: false,
        minutesWeight: 1,
      },
    ]);
    setName("");
  }

  function update(id: string, patch: Partial<Player>): void {
    onChange(value.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function togglePosition(p: Player, slot: PositionSlot | PositionGroup): void {
    const has = p.eligiblePositions.includes(slot);
    update(p.id, {
      eligiblePositions: has
        ? p.eligiblePositions.filter((g) => g !== slot)
        : [...p.eligiblePositions, slot],
    });
  }

  function setSide(p: Player, side: NonNullable<Player["preferredSide"]>): void {
    // Toggle: tapping the active side clears it, back to "anywhere".
    update(p.id, { preferredSide: p.preferredSide === side ? undefined : side });
  }

  function remove(p: Player): void {
    const played = playedSecondsById?.[p.id] ?? 0;
    if (played > 0 && typeof window !== "undefined") {
      const minutes = Math.round(played / 60);
      const ok = window.confirm(
        `${p.name} has ${minutes}′ on the books. Remove them from the squad? Past matches keep their minutes.`,
      );
      if (!ok) return;
    }
    if (editingId === p.id) setEditingId(null);
    onChange(value.filter((x) => x.id !== p.id));
  }

  // ── ordering ──────────────────────────────────────────────────────────────
  // The handle drags (pointer events, so it works on a touchline phone as well as a mouse) and
  // answers the arrow keys, so the order is reachable without a pointer at all.

  function setRowRef(id: string, el: HTMLDivElement | null): void {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  }

  function moveTo(from: number, to: number): void {
    const target = Math.max(0, Math.min(value.length - 1, to));
    if (from < 0 || from === target) return;
    const next = value.slice();
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    onChange(next);
  }

  /** Where the pointer sits: the count of OTHER rows whose midpoint is above it. */
  function indexAtY(clientY: number, dragIndex: number): number {
    let index = 0;
    value.forEach((p, i) => {
      if (i === dragIndex) return;
      const el = rowRefs.current.get(p.id);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (clientY > rect.top + rect.height / 2) index += 1;
    });
    return index;
  }

  function startDrag(e: PointerEvent<HTMLButtonElement>, id: string): void {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragId(id);
  }

  function dragMove(e: PointerEvent<HTMLButtonElement>, id: string): void {
    if (dragId !== id) return;
    const from = value.findIndex((p) => p.id === id);
    moveTo(from, indexAtY(e.clientY, from));
  }

  function handleKey(e: KeyboardEvent<HTMLButtonElement>, id: string): void {
    const delta = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const from = value.findIndex((p) => p.id === id);
    moveTo(from, from + delta);
  }

  return (
    <div>
      <div className={css.addRow}>
        <input
          className={css.addInput}
          placeholder="Add a first name…"
          aria-label="New player name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <Button kind="red" small auto onClick={add} disabled={name.trim().length === 0} style={{ width: 76 }}>
          Add
        </Button>
      </div>

      <div className={css.list}>
        {value.length === 0 ? (
          <p className={cx(styles.note, styles.noteNormal)} style={{ padding: "14px 2px" }}>
            No names yet. Add everyone who might turn up — you can reorder and edit them after.
          </p>
        ) : (
          value.map((p, i) => (
            <div
              key={p.id}
              ref={(el) => setRowRef(p.id, el)}
              className={cx(
                styles.row,
                i === value.length - 1 && styles.rowLast,
                dragId === p.id && css.dragging,
              )}
            >
              <button
                type="button"
                className={cx(styles.iconBtn, styles.iconBtnBare, css.handle, dragId === p.id && css.handleDrag)}
                aria-label={`Move ${p.name} — drag, or use the up and down arrow keys`}
                onPointerDown={(e) => startDrag(e, p.id)}
                onPointerMove={(e) => dragMove(e, p.id)}
                onPointerUp={() => setDragId(null)}
                onPointerCancel={() => setDragId(null)}
                onKeyDown={(e) => handleKey(e, p.id)}
              >
                ≡
              </button>
              <span className={styles.name}>{p.name}</span>
              <button
                type="button"
                className={cx(
                  styles.tag,
                  css.tagBtn,
                  (p.canPlayGK || p.eligiblePositions.length > 0) && styles.tagOn,
                )}
                aria-label={`Edit ${p.name} — positions, keeper and side`}
                onClick={() => setEditingId(p.id)}
                /* The primitive's tag is a 32px label; as a button it has to clear the 44px floor. */
                style={{ minHeight: "var(--tap)" }}
              >
                {tagLabel(p, cfg)}
              </button>
              <button
                type="button"
                className={cx(styles.iconBtn, styles.iconBtnBare)}
                aria-label={`Remove ${p.name}`}
                onClick={() => remove(p)}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <p className={styles.note} style={{ marginTop: 10 }}>
        {value.length} {value.length === 1 ? "player" : "players"}
        {cfg.hasGoalkeeper ? ` · ${keepers} keeper${keepers === 1 ? "" : "s"}` : ""}
      </p>
      <p className={cx(styles.note, styles.noteNormal)}>
        Tap a player&apos;s tag to set the positions they can play
        {cfg.hasGoalkeeper ? ", mark your keepers," : ","} and pick a side. All of it is optional —
        leave it and the engine treats them as available anywhere.
      </p>

      {editing && (
        <Sheet onClose={() => setEditingId(null)}>
          <SectionHead small style={{ marginTop: 0 }}>
            {editing.name}
          </SectionHead>

          <div className={css.field}>
            <label className={css.fieldLabel} htmlFor="player-name">
              Name
            </label>
            <input
              id="player-name"
              value={editing.name}
              aria-label={`Name for ${editing.name}`}
              onChange={(e) => update(editing.id, { name: e.target.value })}
            />
          </div>

          <div className={css.field}>
            <span className={css.fieldLabel}>Can play</span>
            <div className={css.chips}>
              {cfg.positionGroups.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  className={cx(css.chip, editing.eligiblePositions.includes(g.value) && css.chipOn)}
                  aria-pressed={editing.eligiblePositions.includes(g.value)}
                  aria-label={`${editing.name} can play ${g.label}`}
                  onClick={() => togglePosition(editing, g.value)}
                >
                  {g.chip}
                </button>
              ))}
              {cfg.hasGoalkeeper && (
                <button
                  type="button"
                  className={cx(css.chip, editing.canPlayGK && css.chipOn)}
                  aria-pressed={editing.canPlayGK}
                  aria-label={`${editing.name} can play goalkeeper`}
                  onClick={() => update(editing.id, { canPlayGK: !editing.canPlayGK })}
                >
                  🧤 Keeper
                </button>
              )}
            </div>
          </div>

          <div className={css.field}>
            <span className={css.fieldLabel}>Preferred side</span>
            <div className={css.chips}>
              {SIDES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={cx(css.chip, editing.preferredSide === s.value && css.chipOn)}
                  aria-pressed={editing.preferredSide === s.value}
                  aria-label={`${editing.name} prefers the ${s.value} side`}
                  onClick={() => setSide(editing, s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className={cx(styles.note, styles.noteNormal)}>
              Side only nudges which flank they get within a line — leave it off for anywhere.
            </p>
          </div>

          <div className={css.foot}>
            <Button kind="ink" onClick={() => setEditingId(null)}>
              Done
            </Button>
            <div style={{ marginTop: 8 }}>
              <Button
                kind="outline"
                small
                onClick={() => remove(editing)}
                style={{ borderColor: "var(--red)", color: "var(--red)" }}
              >
                Remove from squad
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
