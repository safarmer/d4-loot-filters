import { compileModel, MAX_RULES, orderedRules, type Colors, type Model } from "../compiler.ts";
import type { Rule } from "../codec.ts";
import type { Update } from "./App.tsx";
import { argb, css } from "./colors.ts";
import { Summary } from "./Summary.tsx";

const COLOR_LABEL: [keyof Colors, string][] = [
  ["gear", "Gear (armour, jewellery, weapons)"],
  ["charm_stats", "Charm with desired stats"],
  ["unique_charm", "Picked unique charm"],
  ["charm_set", "Charm of a wanted set"],
];

export function Side({ model, sel, update }: { model: Model; sel: string; update: Update }) {
  // rule counts per filter, against the limit (No Ma'am included)
  const counts: { label: string; n: number }[] = [];
  for (const [p, label] of [["starter", "Starter"], ["endgame", "End-game"]] as const) {
    try { counts.push({ label, n: compileModel(model, p).rules.length }); } catch { /* unverified class */ }
  }
  // the real end-game output order (see orderedRules)
  let rows: { section: string; rule: Rule }[] = [];
  try { rows = orderedRules(model, "endgame"); } catch { /* unverified class: nothing to list */ }

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
      <h2>Order <small>(end-game)</small></h2>
      <p className={counts.some((c) => c.n > MAX_RULES) ? "err" : "muted"}>
        Rules: {counts.map((c) => `${c.label} ${c.n}/${MAX_RULES}`).join(" · ")}
      </p>
      <ol>
        {rows.map(({ section, rule }, i) => (
          <li key={i}>
            <span className="sw" style={{ background: rule.vis === 2 ? css(rule.color) : "transparent" }} />
            {rule.name} <small>({section}, {rule.vis === 2 ? "recolour" : rule.vis === 3 ? "hide" : "show"})</small>
          </li>
        ))}
        <li>No Ma'am (hides the rest; can be switched off in game)</li>
      </ol>
      <Summary model={model} sel={sel} />
    </aside>
  );
}
