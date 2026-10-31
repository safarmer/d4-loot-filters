import { useMemo, useState } from "react";
import { validAffixes, type Model, type SlotConfig } from "../compiler.ts";
import { mapping, STAT_GROUPS } from "../mapping.ts";
import type { Update } from "./App.tsx";
import { css, slotColor } from "./colors.ts";

type StatState = "" | "des" | "ga" | "req";
const STATES: [StatState, string][] = [["", "—"], ["des", "desired"], ["ga", "GA wanted"], ["req", "required"]];

function statState(s: SlotConfig, id: number): StatState {
  return s.required.includes(id) ? "req" : s.ga_wanted.includes(id) ? "ga" : s.desired.affixes.includes(id) ? "des" : "";
}

function setStat(s: SlotConfig, id: number, v: StatState) {
  s.required = s.required.filter((x) => x !== id);
  s.ga_wanted = s.ga_wanted.filter((x) => x !== id);
  s.desired.affixes = s.desired.affixes.filter((x) => x !== id);
  if (v === "req") s.required.push(id);
  if (v === "des" || v === "ga") s.desired.affixes.push(id);
  if (v === "ga") s.ga_wanted.push(id);
  if ((v === "des" || v === "ga") && s.desired.n === 0) s.desired.n = 1;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v || 0));
const has = (name: string, q: string) => name.toLowerCase().includes(q.toLowerCase());

export function SlotPanel({ slotKey, model, update }: { slotKey: string; model: Model; update: Update }) {
  const m = mapping();
  const def = m.slots[slotKey], s = model.slots[slotKey], cls = model.class;
  const [uq, setUq] = useState("");
  const [aq, setAq] = useState("");
  const edit = (fn: (s: SlotConfig) => void) => update((d) => fn(d.slots[slotKey]));

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

  const valid = useMemo(() => new Set(validAffixes(slotKey, cls)), [slotKey, cls]);
  const stats = useMemo(() => {
    const ids = [...new Set([...valid, ...s.required, ...s.desired.affixes])];
    // several affixes share a label (e.g. pre-season-4 and S04_ versions): show the internal name too
    const count = new Map<string, number>();
    for (const id of ids) { const l = m.affixes[id]?.label; if (l) count.set(l, (count.get(l) ?? 0) + 1); }
    return ids.map((id) => {
      const a = m.affixes[id];
      const name = !a ? `unverified ${id}` : count.get(a.label)! > 1 ? `${a.label} (${a.name})` : a.label;
      return { id, name, ok: valid.has(id), group: a?.group ?? "Other" };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [valid, s.required, s.desired.affixes]);

  // one list, a header per stat group (STAT_GROUPS order), empty groups left out
  const shownStats = stats.filter((a) => has(a.name, aq));
  const statGroups = STAT_GROUPS.map((g) => [g, shownStats.filter((a) => a.group === g)] as const)
    .filter(([, list]) => list.length);

  return (
    <section id="panel">
      <h2>{def.label}</h2>
      <fieldset>
        <legend>Slot</legend>
        <div className="row">
          <label><input type="checkbox" checked={s.enabled} onChange={(e) => edit((d) => { d.enabled = e.target.checked; })} /> Enabled</label>
          <label>Priority tier{" "}
            <select value={s.tier} onChange={(e) => edit((d) => { d.tier = +e.target.value; })}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>Mode{" "}
            <select value={s.vis} onChange={(e) => edit((d) => { d.vis = +e.target.value; })}>
              <option value={2}>recolour</option>
              <option value={0}>show</option>
            </select>
          </label>
          <label>Colour{" "}
            <input type="color" value={css(slotColor(s))}
              onChange={(e) => edit((d) => { d.color = "0xFF" + e.target.value.slice(1).toUpperCase(); })} />
          </label>
          <button onClick={() => edit((d) => { d.color = null; })}>tier colour</button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Gear</legend>
        <div className="row">
          <label><input type="checkbox" checked={s.legendaries} onChange={(e) => edit((d) => { d.legendaries = e.target.checked; })} /> Legendaries count</label>
          <label><input type="checkbox" checked={s.ancestral} onChange={(e) => edit((d) => { d.ancestral = e.target.checked; })} /> Ancestral only</label>
          <label>Min greater affixes{" "}
            <input type="number" min={0} max={4} style={{ width: "4.5em" }} value={s.ga_min}
              onChange={(e) => edit((d) => { d.ga_min = clamp(+e.target.value, 0, 4); })} />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Uniques to keep</legend>
        <input placeholder="filter…" size={20} value={uq} onChange={(e) => setUq(e.target.value)} />
        <div className="list">
          {uniques.filter((u) => has(u.name, uq)).map((u) => (
            <label key={u.id}>
              <input type="checkbox" checked={s.uniques.includes(u.id)} onChange={(e) => edit((d) => {
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
          <label>Desired: need at least{" "}
            <input type="number" min={0} max={6} style={{ width: "4.5em" }} value={s.desired.n}
              onChange={(e) => edit((d) => { d.desired.n = clamp(+e.target.value, 0, 6); })} />
            {" "}of the desired/GA stats
          </label>
          <small>{s.required.length} required</small>
        </div>
        <input placeholder="filter stats…" size={20} value={aq} onChange={(e) => setAq(e.target.value)} />
        <div className="list" style={{ maxHeight: 320 }}>
          {statGroups.map(([group, list]) => (
            <div key={group} role="group" aria-label={group}>
              <div className="group-head">{group} <small>{list.length}</small></div>
              {list.map((a) => (
                <div key={a.id} className="affix" title={a.ok ? "" : "not valid for this slot"}>
                  <span className="nm">{a.name}{a.ok ? "" : " (invalid)"}</span>
                  <select value={statState(s, a.id)} onChange={(e) => edit((d) => setStat(d, a.id, e.target.value as StatState))}>
                    {STATES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </div>
              ))}
            </div>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
