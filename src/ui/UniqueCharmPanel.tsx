import { useMemo, useState } from "react";
import { classUniqueCharms, MAX_UNIQUES, type Model, type UniqueCharmConfig } from "../compiler.ts";
import { mapping } from "../mapping.ts";
import type { Update } from "./App.tsx";

const has = (name: string, q: string) => name.toLowerCase().includes(q.toLowerCase());

export function UniqueCharmPanel({ model, update }: { model: Model; update: Update }) {
  const m = mapping();
  const c = model.unique_charms, cls = model.class;
  const [q, setQ] = useState("");
  // ticking the first unique charm enables the section; clearing the last disables it
  const edit = (fn: (c: UniqueCharmConfig) => void) => update((d) => {
    const had = d.unique_charms.uniques.length > 0;
    fn(d.unique_charms);
    if ((d.unique_charms.uniques.length > 0) !== had) d.unique_charms.enabled = !had;
  });
  const list = useMemo(() => {
    const ids = [...new Set([...classUniqueCharms(cls), ...c.uniques])];
    return ids.map((id) => {
      const u = m.uniques[id];
      return { id, name: u ? (u.display ?? u.name) + (u.mythic ? " · mythic" : "") + (u.hidden ? ` · ${u.hidden}` : "") : `unverified ${id}` };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [cls, c.uniques]);

  return (
    <section id="panel">
      <h2>Unique charms</h2>
      <fieldset>
        <legend>Unique charms</legend>
        <div className="row">
          <label><input type="checkbox" checked={c.enabled} onChange={(e) => edit((d) => { d.enabled = e.target.checked; })} /> Enabled</label>
          <label><input type="checkbox" checked={c.any} onChange={(e) => update((d) => { d.unique_charms.any = e.target.checked; })} /> Also recolour every other unique charm</label>
        </div>
        <small>Both filters. Colours are in Settings.</small>
      </fieldset>
      <fieldset>
        <legend>Unique charms to keep <small>({c.uniques.length}/{MAX_UNIQUES})</small></legend>
        <input placeholder="filter…" size={20} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="list" style={{ maxHeight: 420 }}>
          {list.filter((u) => has(u.name, q)).map((u) => (
            <label key={u.id}>
              <input type="checkbox" checked={c.uniques.includes(u.id)}
                disabled={!c.uniques.includes(u.id) && c.uniques.length >= MAX_UNIQUES}
                onChange={(e) => edit((d) => {
                  d.uniques = e.target.checked ? [...d.uniques, u.id] : d.uniques.filter((x) => x !== u.id);
                })} />
              {u.name}
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
