import type { Model } from "../compiler.ts";
import { mapping } from "../mapping.ts";
import type { Update } from "./App.tsx";
import { css, slotColor } from "./colors.ts";

export function Side({ model, notes, update }: { model: Model; notes: string[]; update: Update }) {
  const m = mapping();
  const rows: [number, string, string][] = [
    ...Object.entries(model.slots).filter(([, s]) => s.enabled)
      .map(([k, s]): [number, string, string] => [s.tier, m.slots[k].label, slotColor(s)]),
    ...model.raw.map((r): [number, string, string] => [r.tier, r.rule.name, r.rule.color]),
  ].sort((a, b) => a[0] - b[0]);

  return (
    <aside id="side">
      <h2>Order</h2>
      <ol>
        {rows.map(([t, n, c], i) => (
          <li key={i}><span className="sw" style={{ background: css(c) }} />{n} <small>(tier {t})</small></li>
        ))}
        <li>No Ma'am (hide all)</li>
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
