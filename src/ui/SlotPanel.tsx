import { useMemo, useState } from "react";
import { MAX_UNIQUES, validAffixes, type Model, type SlotConfig } from "../compiler.ts";
import { mapping } from "../mapping.ts";
import type { Update } from "./App.tsx";
import { StatList } from "./StatList.tsx";

const range = (n: number) => Array.from({ length: n + 1 }, (_, i) => i);

/** Desired checkbox. Clearing it also clears the GA star. */
function setDesired(s: SlotConfig, id: number, on: boolean) {
  s.desired = s.desired.filter((x) => x !== id);
  if (on) s.desired.push(id);
  else s.ga_wanted = s.ga_wanted.filter((x) => x !== id);
}

/** GA star. Starring a stat also makes it desired. */
function setGa(s: SlotConfig, id: number, on: boolean) {
  s.ga_wanted = s.ga_wanted.filter((x) => x !== id);
  if (on) {
    s.ga_wanted.push(id);
    if (!s.desired.includes(id)) s.desired.push(id);
  }
}

const has = (name: string, q: string) => name.toLowerCase().includes(q.toLowerCase());

export function SlotPanel({ slotKey, model, update }: { slotKey: string; model: Model; update: Update }) {
  const m = mapping();
  const def = m.slots[slotKey], s = model.slots[slotKey], cls = model.class;
  const [uq, setUq] = useState("");
  // picking the first item (unique or legendaries) enables the slot; clearing the last disables it
  const hasItems = (x: SlotConfig) => x.uniques.length > 0 || x.legendaries;
  const edit = (fn: (s: SlotConfig) => void) => update((d) => {
    const slot = d.slots[slotKey], had = hasItems(slot);
    const hadStats = slot.desired.length > 0, hadUniques = slot.uniques.length > 0;
    fn(slot);
    // first stat with no unique picked: include legendaries; first unique picked: leave them out
    // (both only on that change, so the checkbox can still be set by hand afterwards)
    if (!hadStats && slot.desired.length > 0 && !slot.uniques.length) slot.legendaries = true;
    if (!hadUniques && slot.uniques.length > 0) slot.legendaries = false;
    if (hasItems(slot) !== had) slot.enabled = !had;
  });

  const uniques = useMemo(() => {
    // hidden items (placeholders, past-season copies) show only when the filter already uses them
    const picked = Object.entries(m.uniques).filter(([id, u]) => u.slot === slotKey
      && ((u.classes.includes(cls) && !u.hidden) || s.uniques.includes(+id)));
    // same display name twice (e.g. a mythic and its S14_ copy): show the internal name too
    const count = new Map<string, number>();
    for (const [, u] of picked) count.set(u.display ?? u.name, (count.get(u.display ?? u.name) ?? 0) + 1);
    const list = picked.map(([id, u]) => {
      const base = u.display ?? u.name;
      const name = base + (count.get(base)! > 1 ? ` (${u.name})` : "") + (u.mythic ? " · mythic" : "")
        + (u.hidden ? ` · ${u.hidden}` : "");
      return { id: +id, name };
    });
    for (const id of s.uniques)
      if (!list.some((u) => u.id === id)) list.push({ id, name: `unverified ${id}` });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [slotKey, cls, s.uniques]);

  const valid = useMemo(() => validAffixes(slotKey, cls), [slotKey, cls]);

  return (
    <section id="panel">
      <h2>{def.label}</h2>
      <fieldset>
        <legend>Slot</legend>
        <div className="row">
          <label><input type="checkbox" checked={s.enabled} onChange={(e) => edit((d) => { d.enabled = e.target.checked; })} /> Enabled</label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Gear</legend>
        <div className="row">
          <label><input type="checkbox" checked={s.legendaries} onChange={(e) => edit((d) => { d.legendaries = e.target.checked; })} /> Include Legendary</label>
        </div>
        <div className="row">
          <label>Desired stats needed{" "}
            <select value={s.n} onChange={(e) => edit((d) => { d.n = +e.target.value; })}>
              {range(6).map((n) => <option key={n} value={n}>{n === 0 ? "any" : n}</option>)}
            </select>
          </label>
          <label>Greater affixes to recolour{" "}
            <select value={s.ga} onChange={(e) => edit((d) => { d.ga = +e.target.value; })}>
              {range(4).map((n) => <option key={n} value={n}>{n === 0 ? "none (show only)" : n}</option>)}
            </select>
          </label>
        </div>
      </fieldset>

      <div className="pair">
      <fieldset>
        <legend>Uniques to keep <small>({s.uniques.length}/{MAX_UNIQUES})</small></legend>
        <input placeholder="filter…" size={20} value={uq} onChange={(e) => setUq(e.target.value)} />
        <div className="list">
          {uniques.filter((u) => has(u.name, uq)).map((u) => (
            <label key={u.id}>
              <input type="checkbox" checked={s.uniques.includes(u.id)}
                disabled={!s.uniques.includes(u.id) && s.uniques.length >= MAX_UNIQUES}
                onChange={(e) => edit((d) => {
                d.uniques = e.target.checked ? [...d.uniques, u.id] : d.uniques.filter((x) => x !== u.id);
              })} />
              {u.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Stats (valid for this slot and class only)</legend>
        <div className="row">
          <small>{s.desired.length} desired · {s.ga_wanted.length} starred</small>
          {s.required.length > 0 && (
            <small>
              {s.required.length} required by the imported filter{" "}
              <button onClick={() => edit((d) => { d.required = []; })}>clear</button>
            </small>
          )}
        </div>
        <StatList valid={valid} desired={s.desired} required={s.required} starred={s.ga_wanted}
          onDesired={(id, on) => edit((d) => setDesired(d, id, on))}
          onStar={(id, on) => edit((d) => setGa(d, id, on))} />
      </fieldset>
      </div>
    </section>
  );
}
