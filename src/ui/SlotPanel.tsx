import { useMemo, useState } from "react";
import { validAffixes, type Model, type SlotConfig } from "../compiler.ts";
import { mapping, STAT_GROUPS } from "../mapping.ts";
import type { Update } from "./App.tsx";
import { css, slotColor } from "./colors.ts";

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
    const ids = [...new Set([...valid, ...s.required, ...s.desired])];
    // several affixes share a label (e.g. pre-season-4 and S04_ versions): show the internal name too
    const count = new Map<string, number>();
    for (const id of ids) { const l = m.affixes[id]?.label; if (l) count.set(l, (count.get(l) ?? 0) + 1); }
    return ids.map((id) => {
      const a = m.affixes[id];
      const name = !a ? `unverified ${id}` : count.get(a.label)! > 1 ? `${a.label} (${a.name})` : a.label;
      return { id, name, ok: valid.has(id), group: a?.group ?? "Other" };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [valid, s.required, s.desired]);

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
          <label>Recolour{" "}
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
        <table className="profiles">
          <thead><tr><th>Filter</th><th>Shows</th><th>Recolours</th></tr></thead>
          <tbody>
            <tr>
              <th scope="row">Starter</th>
              <td>always</td>
              <td>{s.n > 0 && s.desired.length ? `${s.n} desired stat${s.n > 1 ? "s" : ""}` : "never (no desired stats)"}</td>
            </tr>
            <tr>
              <th scope="row">End-game</th>
              <td>ancestral{s.n > 0 && s.desired.length ? ` + ${s.n} desired` : ""}</td>
              <td>{s.ga > 0 ? `ancestral${s.n > 0 && s.desired.length ? ` + ${s.n} desired` : ""} + ${s.ga} GA` : "never"}</td>
            </tr>
          </tbody>
        </table>
        <small>Starred stats must be the greater affix in the end-game recolour.</small>
      </fieldset>

      <div className="pair">
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
          <small>{s.desired.length} desired · {s.ga_wanted.length} starred</small>
          {s.required.length > 0 && (
            <small>
              {s.required.length} required by the imported filter{" "}
              <button onClick={() => edit((d) => { d.required = []; })}>clear</button>
            </small>
          )}
        </div>
        <input placeholder="filter stats…" size={20} value={aq} onChange={(e) => setAq(e.target.value)} />
        <div className="list">
          {statGroups.map(([group, list]) => (
            <div key={group} role="group" aria-label={group}>
              <div className="group-head">{group} <small>{list.length}</small></div>
              {list.map((a) => (
                <div key={a.id} className="affix" title={a.ok ? "" : "not valid for this slot"}>
                  <label className="nm">
                    <input type="checkbox" checked={s.desired.includes(a.id)}
                      onChange={(e) => edit((d) => setDesired(d, a.id, e.target.checked))} />
                    {" "}{a.name}{a.ok ? "" : " (invalid)"}{s.required.includes(a.id) ? " · required" : ""}
                  </label>
                  <button className="star" aria-pressed={s.ga_wanted.includes(a.id)}
                    title="Greater affix wanted on this stat" aria-label={`Greater affix wanted: ${a.name}`}
                    onClick={() => edit((d) => setGa(d, a.id, !d.ga_wanted.includes(a.id)))}>
                    <GaStar on={s.ga_wanted.includes(a.id)} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </fieldset>
      </div>
    </section>
  );
}
