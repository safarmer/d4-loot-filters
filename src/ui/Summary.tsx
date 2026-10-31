import type { Model } from "../compiler.ts";
import { mapping } from "../mapping.ts";
import { css } from "./colors.ts";
import { CHARMS } from "./Doll.tsx";

const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`;

/** What the selected section's rules do, in words. */
export function Summary({ model, sel }: { model: Model; sel: string }) {
  if (sel === CHARMS) {
    const c = model.charms;
    const stats = c.n > 0 && c.desired.length ? `${c.n} desired stat${c.n > 1 ? "s" : ""}` : "";
    const rows: [string, string][] = [];
    if (c.enabled) for (const [what, plainColor, on] of [["picked unique", model.colors.unique_charm, c.uniques.length > 0], ["wanted set", model.colors.charm_set, c.sets.length > 0]] as const) {
      if (!on) continue;
      if (stats && c.ga > 0) rows.push([`${what} + ${stats} + ${c.ga} GA`, model.colors.charm_ga]);
      if (stats) rows.push([`${what} + ${stats}`, model.colors.charm_stats]);
      rows.push([`${what}`, plainColor]);
    }
    if (c.any_unique) rows.push(["any other unique charm", model.colors.any_unique_charm]);
    return (
      <>
        <h2>Charms <small>(both filters)</small></h2>
        <table className="profiles">
          <thead><tr><th>Recolours (first match)</th><th>Colour</th></tr></thead>
          <tbody>
            {rows.length ? rows.map(([t, col], i) => (
              <tr key={i}><td>{t}</td><td><span className="sw" style={{ background: css(col) }} /></td></tr>
            )) : <tr><td colSpan={2}>nothing yet</td></tr>}
          </tbody>
        </table>
        {c.mats && <small>Then shows every legendary-or-better charm and seal (materials).</small>}
      </>
    );
  }
  const s = model.slots[sel];
  const stats = s.n > 0 && s.desired.length ? plural(s.n, "desired stat") : "";
  return (
    <>
      <h2>{mapping().slots[sel].label}</h2>
      <table className="profiles">
        <thead><tr><th>Filter</th><th>Shows</th><th>Recolours</th></tr></thead>
        <tbody>
          <tr>
            <th scope="row">Starter</th>
            <td>always</td>
            <td>{stats || "never (no desired stats)"}</td>
          </tr>
          <tr>
            <th scope="row">End-game</th>
            <td>ancestral{stats ? ` + ${stats}` : ""}</td>
            <td>{s.ga > 0 ? `ancestral${stats ? ` + ${stats}` : ""} + ${s.ga} GA` : "never"}</td>
          </tr>
        </tbody>
      </table>
      <small>Starred stats must be the greater affix in the end-game recolour.</small>
    </>
  );
}
