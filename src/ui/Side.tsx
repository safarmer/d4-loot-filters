import type { Colors, Model } from "../compiler.ts";
import { mapping } from "../mapping.ts";
import type { Update } from "./App.tsx";
import { argb, css } from "./colors.ts";

const COLOR_LABEL: [keyof Colors, string][] = [
  ["gear", "Gear (armour, jewellery, weapons)"],
  ["charm_set", "Charm of a wanted set"],
  ["charm_stats", "Charm of a wanted set + desired stats"],
];

export function Side({ model, notes, update }: { model: Model; notes: string[]; update: Update }) {
  const m = mapping();
  const rows: [number, string, string][] = [
    ...Object.entries(model.slots).filter(([, s]) => s.enabled)
      .map(([k, s]): [number, string, string] => [s.tier, m.slots[k].label, model.colors.gear]),
    ...(model.charms.enabled || model.charms.mats ? [[model.charms.tier, "Charms", model.colors.charm_set] as [number, string, string]] : []),
    ...model.raw.map((r): [number, string, string] => [r.tier, r.rule.name, r.rule.color]),
  ].sort((a, b) => a[0] - b[0]);

  return (
    <aside id="side">
      {/* global settings: closed by default */}
      <details className="settings">
        <summary>Settings</summary>
        <h3>Recolours</h3>
        {COLOR_LABEL.map(([k, label]) => (
          <label key={k} className="setting">
            <input type="color" value={css(model.colors[k])}
              onChange={(e) => update((d) => { d.colors[k] = argb(e.target.value); })} /> {label}
          </label>
        ))}
      </details>
      <h2>Order</h2>
      <ol>
        {rows.map(([t, n, c], i) => (
          <li key={i}><span className="sw" style={{ background: css(c) }} />{n} <small>(tier {t})</small></li>
        ))}
        <li>No Ma'am (hides the rest; can be switched off in game)</li>
      </ol>
      <h2>Kept as-is <small>(rules the slot model cannot express)</small></h2>
      <ul>
        {model.raw.map((r, i) => (
          <li key={i}>{r.rule.name}{" "}
            <button onClick={() => update((d) => { d.raw.splice(i, 1); })}>remove</button>
          </li>
        ))}
      </ul>
      <h2>Import notes</h2>
      <ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
    </aside>
  );
}
