import { useState } from "react";
import { createPortal } from "react-dom";
import { mapping } from "../mapping.ts";

const CARD_W = 320;

/** A unique's details: name, power, fixed stats, flavour. */
function UniqueCard({ id, at }: { id: number; at: DOMRect }) {
  const m = mapping();
  const u = m.uniques[id];
  if (!u) return null;
  const all = u.classes.length === m.classes.length;
  // right of the row, or left of it when there is no room; kept inside the window
  const left = at.right + 8 + CARD_W < window.innerWidth ? at.right + 8 : Math.max(8, at.left - CARD_W - 8);
  const top = Math.min(at.top, window.innerHeight - 220);
  return createPortal(
    <div className="ucard" role="tooltip" style={{ left, top, width: CARD_W }}>
      <b className={u.mythic ? "mythic" : "unique"}>{u.display ?? u.name}</b>
      <small>{u.mythic ? "Mythic " : "Unique "}{m.slots[u.slot]?.label.replace(" (x2)", "") ?? "Charm"}{all ? "" : ` · ${u.classes.join(", ")}`}</small>
      {u.power && <p>{u.power}</p>}
      {u.stats?.length ? <ul>{u.stats.map((s, i) => <li key={i}>{s}</li>)}</ul> : null}
      {u.flavor && <p className="flavor">{u.flavor}</p>}
      {u.power?.includes("#") && <small>"#": depends on your character (e.g. weapon damage) or is unreadable in the game files.</small>}
    </div>,
    document.body,
  );
}

/** A unique in a pick list: checkbox and name (mythics in purple), with its details on hover or keyboard focus. */
export function UniqueRow({ id, name, checked, disabled, onChange }: {
  id: number; name: string; checked: boolean; disabled: boolean; onChange: (on: boolean) => void;
}) {
  const [at, setAt] = useState<DOMRect | null>(null);
  const show = (e: { currentTarget: HTMLElement }) => setAt(e.currentTarget.getBoundingClientRect());
  return (
    <label className={mapping().uniques[id]?.mythic ? "mythic" : undefined} onMouseEnter={show} onMouseLeave={() => setAt(null)} onFocus={show} onBlur={() => setAt(null)}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {name}
      {at && <UniqueCard id={id} at={at} />}
    </label>
  );
}
