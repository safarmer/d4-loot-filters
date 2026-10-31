import type { CSSProperties } from "react";
import type { Model } from "../compiler.ts";
import { mapping } from "../mapping.ts";
import { css, slotColor } from "./colors.ts";

export function Doll({ model, sel, onSelect }: { model: Model; sel: string; onSelect: (k: string) => void }) {
  return (
    <section id="doll" aria-label="Paper doll">
      {Object.entries(mapping().slots).map(([key, def]) => {
        const s = model.slots[key];
        const style = { gridArea: key, "--c": css(slotColor(s)) } as CSSProperties;
        return (
          <button key={key} style={style} onClick={() => onSelect(key)}
            className={`slot ${key} ${s.enabled ? "on" : "off"} ${sel === key ? "sel" : ""}`}>
            <b>{def.label}</b>
            <small>{s.enabled ? `tier ${s.tier} · ${s.uniques.length} uniques${s.legendaries ? " · legendaries" : ""}` : "off"}</small>
          </button>
        );
      })}
    </section>
  );
}
