import { useMemo } from "react";
import { classSets, validCharmAffixes, type CharmConfig, type Model } from "../compiler.ts";
import { mapping } from "../mapping.ts";
import type { Update } from "./App.tsx";
import { css } from "./colors.ts";
import { StatList } from "./StatList.tsx";

const range = (n: number) => Array.from({ length: n + 1 }, (_, i) => i);
// charm stat labels all start "Talisman Charm" (some "Talisman Charm Affix"): drop it in the list
const charmName = (label: string) => label.replace(/^Talisman Charm (Affix )?/, "");

export function CharmPanel({ model, update }: { model: Model; update: Update }) {
  const m = mapping();
  const c = model.charms, cls = model.class;
  // ticking the first wanted set enables charms; clearing the last disables them
  const edit = (fn: (c: CharmConfig) => void) => update((d) => {
    const had = d.charms.sets.length > 0;
    fn(d.charms);
    if ((d.charms.sets.length > 0) !== had) d.charms.enabled = !had;
  });
  const valid = useMemo(() => validCharmAffixes(cls), [cls]);
  const sets = useMemo(() => {
    const ids = [...new Set([...classSets(cls), ...c.sets])];
    return ids.map((id) => ({ id, name: m.talisman_sets[id]?.display ?? `unverified ${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cls, c.sets]);

  return (
    <section id="panel">
      <h2>Charms</h2>
      <fieldset>
        <legend>Set charms</legend>
        <div className="row">
          <label><input type="checkbox" checked={c.enabled} onChange={(e) => edit((d) => { d.enabled = e.target.checked; })} /> Enabled</label>
          <label>Priority tier{" "}
            <select value={c.tier} onChange={(e) => edit((d) => { d.tier = +e.target.value; })}>
              {range(9).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>Desired stats needed{" "}
            <select value={c.n} onChange={(e) => edit((d) => { d.n = +e.target.value; })}>
              {range(4).map((n) => <option key={n} value={n}>{n === 0 ? "off" : n}</option>)}
            </select>
          </label>
        </div>
        <table className="profiles">
          <thead><tr><th>Both filters recolour</th><th>Colour</th></tr></thead>
          <tbody>
            <tr>
              <td>a wanted set{c.n > 0 && c.desired.length ? ` with ${c.n} desired stat${c.n > 1 ? "s" : ""}` : " (no desired stats: off)"}</td>
              <td><span className="sw" style={{ background: css(model.colors.charm_stats) }} /></td>
            </tr>
            <tr>
              <td>any charm of a wanted set</td>
              <td><span className="sw" style={{ background: css(model.colors.charm_set) }} /></td>
            </tr>
          </tbody>
        </table>
        <label className="setting">
          <input type="checkbox" checked={c.mats} onChange={(e) => update((d) => { d.charms.mats = e.target.checked; })} />
          Always show legendary-or-better charms and seals (materials), after the rules above
        </label>
        <small>Charms roll their own stats (Talisman_Charm_…), not gear stats. Colours are in Settings.</small>
      </fieldset>

      <div className="pair">
        <fieldset>
          <legend>Wanted sets</legend>
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
          <legend>Charm stats (this class)</legend>
          <div className="row"><small>{c.desired.length} desired</small></div>
          <StatList valid={valid} desired={c.desired} nameOf={charmName}
            onDesired={(id, on) => edit((d) => { d.desired = on ? [...d.desired, id] : d.desired.filter((x) => x !== id); })} />
        </fieldset>
      </div>
    </section>
  );
}
