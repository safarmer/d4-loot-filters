import type { Model } from "../compiler.ts";
import { mapping } from "../mapping.ts";
import { css } from "./colors.ts";
import { CHARMS } from "./Doll.tsx";

const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`;

/** What the selected section's rules do, in words. */
export function Summary({ model, sel }: { model: Model; sel: string }) {
  if (sel === CHARMS) {
    const c = model.charms;
    return (
      <>
        <h2>Charms <small>(both filters)</small></h2>
        <table className="profiles">
          <thead><tr><th>Recolours</th><th>Colour</th></tr></thead>
          <tbody>
            <tr>
              <td>a wanted set{c.n > 0 && c.desired.length ? ` with ${plural(c.n, "desired stat")}` : " (no desired stats: off)"}</td>
              <td><span className="sw" style={{ background: css(model.colors.charm_stats) }} /></td>
            </tr>
            <tr>
              <td>any charm of a wanted set</td>
              <td><span className="sw" style={{ background: css(model.colors.charm_set) }} /></td>
            </tr>
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
