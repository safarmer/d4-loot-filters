import type { CSSProperties } from "react";
import type { Model } from "../compiler.ts";
import { mapping } from "../mapping.ts";
import { css } from "./colors.ts";

/** Key of the charms tile; not a gear slot. */
export const CHARMS = "charms";

export function Doll({ model, sel, onSelect }: { model: Model; sel: string; onSelect: (k: string) => void }) {
  const c = model.charms;
  const tile = (key: string, label: string, on: boolean, color: string, info: string) => (
    <button key={key} style={{ gridArea: key, "--c": css(color) } as CSSProperties} onClick={() => onSelect(key)}
      className={`slot ${key} ${on ? "on" : "off"} ${sel === key ? "sel" : ""}`}>
      <b>{label}</b>
      <small>{on ? info : "off"}</small>
    </button>
  );
  return (
    <section id="doll" aria-label="Paper doll">
      {Object.entries(mapping().slots).map(([key, def]) => {
        const s = model.slots[key];
        return tile(key, def.label, s.enabled, model.colors.gear,
          `tier ${s.tier} · ${s.uniques.length} uniques${s.legendaries ? " · legendaries" : ""}`);
      })}
      <hr className="doll-rule" />
      {tile(CHARMS, "Charms", c.enabled || c.mats, model.colors.charm_set,
        c.enabled ? `tier ${c.tier} · ${c.sets.length} sets · ${c.desired.length} stats` : "materials only")}
    </section>
  );
}
