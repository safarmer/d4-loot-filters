import type { CSSProperties } from "react";
import type { Model } from "../compiler.ts";
import { mapping } from "../mapping.ts";
import { css } from "./colors.ts";

/** Keys of the charm tiles; not gear slots. */
export const CHARMS = "charms";
export const UNIQUE_CHARMS = "ucharms";

export function Doll({ model, sel, onSelect }: { model: Model; sel: string; onSelect: (k: string) => void }) {
  const c = model.charms, u = model.unique_charms;
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
          `${s.uniques.length} uniques${s.legendaries ? " · legendaries" : ""}`);
      })}
      <hr className="doll-rule" />
      {tile(UNIQUE_CHARMS, "Unique charms", u.enabled || u.any, model.colors.unique_charm,
        `${u.uniques.length} picked${u.any ? " · all others" : ""}`)}
      {tile(CHARMS, "Set charms", c.enabled || c.mats, model.colors.charm_set,
        c.enabled ? `${c.sets.length} sets · ${c.desired.length} stats` : "materials only")}
    </section>
  );
}
