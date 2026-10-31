import { useMemo, useState } from "react";
import { mapping, STAT_GROUPS } from "../mapping.ts";

/** Greater affix mark: a four-point star, filled when on. Drawn here, not copied from the game. */
function GaStar({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M8 0.8 L9.9 6.1 L15.2 8 L9.9 9.9 L8 15.2 L6.1 9.9 L0.8 8 L6.1 6.1 Z"
        fill={on ? "var(--ga)" : "none"} stroke={on ? "var(--ga)" : "var(--mut)"} strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

const has = (name: string, q: string) => name.toLowerCase().includes(q.toLowerCase());

interface Props {
  /** Stats offered (valid for the slot or charm). */
  valid: number[];
  /** Ticked stats; shown even when not in `valid` (marked invalid). */
  desired: number[];
  onDesired: (id: number, on: boolean) => void;
  /** Stats a filter requires (imports only); shown and marked. */
  required?: number[];
  /** GA stars; omit to hide them. */
  starred?: number[];
  onStar?: (id: number, on: boolean) => void;
  /** Display name from the affix label (e.g. to drop a shared prefix). */
  nameOf?: (label: string) => string;
}

/** One stat list with a header per stat group (STAT_GROUPS order), a search box, checkboxes and optional GA stars. */
export function StatList({ valid, desired, onDesired, required = [], starred, onStar, nameOf = (l) => l }: Props) {
  const m = mapping();
  const [q, setQ] = useState("");
  const validSet = useMemo(() => new Set(valid), [valid]);
  const stats = useMemo(() => {
    const ids = [...new Set([...valid, ...required, ...desired])];
    // several affixes share a label (e.g. S04_ and X2_ versions): show the internal name too
    const count = new Map<string, number>();
    for (const id of ids) { const l = m.affixes[id]?.label; if (l) count.set(l, (count.get(l) ?? 0) + 1); }
    return ids.map((id) => {
      const a = m.affixes[id];
      const name = !a ? `unverified ${id}` : nameOf(a.label) + (count.get(a.label)! > 1 ? ` (${a.name})` : "");
      return { id, name, ok: validSet.has(id), group: a?.group ?? "Other" };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [validSet, required, desired]);

  const shown = stats.filter((a) => has(a.name, q));
  const groups = STAT_GROUPS.map((g) => [g, shown.filter((a) => a.group === g)] as const).filter(([, l]) => l.length);

  return (
    <>
      <input placeholder="filter stats…" size={20} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="list">
        {groups.map(([group, list]) => (
          <div key={group} role="group" aria-label={group}>
            <div className="group-head">{group} <small>{list.length}</small></div>
            {list.map((a) => (
              <div key={a.id} className="affix" title={a.ok ? "" : "not valid here"}>
                <label className="nm">
                  <input type="checkbox" checked={desired.includes(a.id)} onChange={(e) => onDesired(a.id, e.target.checked)} />
                  {" "}{a.name}{a.ok ? "" : " (invalid)"}{required.includes(a.id) ? " · required" : ""}
                </label>
                {starred && onStar && (
                  <button className="star" aria-pressed={starred.includes(a.id)}
                    title="Greater affix wanted on this stat" aria-label={`Greater affix wanted: ${a.name}`}
                    onClick={() => onStar(a.id, !starred.includes(a.id))}>
                    <GaStar on={starred.includes(a.id)} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
