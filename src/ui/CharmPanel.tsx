import { useMemo, useState } from "react";
import { classSets, classUniqueCharms, MAX_UNIQUES, validCharmAffixes, type CharmConfig, type Model } from "../compiler.ts";
import { mapping } from "../mapping.ts";
import type { Update } from "./App.tsx";
import { StatList } from "./StatList.tsx";
import { UniqueRow } from "./UniqueRow.tsx";

const range = (n: number) => Array.from({ length: n + 1 }, (_, i) => i);
const has = (name: string, q: string) => name.toLowerCase().includes(q.toLowerCase());
// charm stat labels all start "Talisman Charm" (some "Talisman Charm Affix"): drop it in the list
const charmName = (label: string) => label.replace(/^Talisman Charm (Affix )?/, "");

export function CharmPanel({ model, update }: { model: Model; update: Update }) {
  const m = mapping();
  const c = model.charms, cls = model.class;
  const [uq, setUq] = useState("");
  // picking the first unique charm or set enables charms; clearing the last disables them
  const hasItems = (x: CharmConfig) => x.uniques.length > 0 || x.sets.length > 0;
  const edit = (fn: (c: CharmConfig) => void) => update((d) => {
    const had = hasItems(d.charms);
    fn(d.charms);
    if (hasItems(d.charms) !== had) d.charms.enabled = !had;
  });
  const valid = useMemo(() => validCharmAffixes(cls), [cls]);
  const uniques = useMemo(() => {
    const ids = [...new Set([...classUniqueCharms(cls), ...c.uniques])];
    return ids.map((id) => {
      const u = m.uniques[id];
      return { id, name: u ? (u.display ?? u.name) + (u.hidden ? ` · ${u.hidden}` : "") : `unverified ${id}` };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [cls, c.uniques]);
  const sets = useMemo(() => {
    const ids = [...new Set([...classSets(cls), ...c.sets])];
    return ids.map((id) => ({ id, name: m.talisman_sets[id]?.display ?? `unverified ${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cls, c.sets]);

  return (
    <section id="panel">
      <h2>Charms</h2>
      <fieldset>
        <legend>Charms (both filters)</legend>
        <div className="row">
          <label><input type="checkbox" checked={c.enabled} onChange={(e) => edit((d) => { d.enabled = e.target.checked; })} /> Enabled</label>
          <label>Desired stats needed{" "}
            <select value={c.n} onChange={(e) => edit((d) => { d.n = +e.target.value; })}>
              {range(4).map((n) => <option key={n} value={n}>{n === 0 ? "off" : n}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label><input type="checkbox" checked={c.mats} onChange={(e) => update((d) => { d.charms.mats = e.target.checked; })} /> Then show legendary-or-better charms and seals (materials, other unique and set charms included)</label>
        </div>
        <small>Uniques and sets share the desired stats. Charms roll their own stats (Talisman_Charm_…). Colours are in Settings.</small>
      </fieldset>

      <div className="triple">
        <fieldset>
          <legend>Uniques <small>({c.uniques.length}/{MAX_UNIQUES})</small></legend>
          <input placeholder="filter…" size={12} value={uq} onChange={(e) => setUq(e.target.value)} />
          <div className="list">
            {uniques.filter((u) => has(u.name, uq)).map((u) => (
              <UniqueRow key={u.id} id={u.id} name={u.name} checked={c.uniques.includes(u.id)}
                disabled={!c.uniques.includes(u.id) && c.uniques.length >= MAX_UNIQUES}
                onChange={(on) => edit((d) => { d.uniques = on ? [...d.uniques, u.id] : d.uniques.filter((x) => x !== u.id); })} />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Sets</legend>
          <div className="list">
            {sets.map((t) => (
              <label key={t.id}>
                <input type="checkbox" checked={c.sets.includes(t.id)} onChange={(e) => edit((d) => {
                  d.sets = e.target.checked ? [...d.sets, t.id] : d.sets.filter((x) => x !== t.id);
                })} />
                {t.name}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Stats</legend>
          <div className="row"><small>{c.desired.length} desired</small></div>
          <StatList valid={valid} desired={c.desired} nameOf={charmName}
            onDesired={(id, on) => edit((d) => {
              d.desired = on ? [...d.desired, id] : d.desired.filter((x) => x !== id);
            })} />
        </fieldset>
      </div>
    </section>
  );
}
