// Slot model -> filter JSON (the structure tools/filter_tool.ts encodes).
//
// Model:
//   {name, class, slot_idx, raw: [{tier, rule}], hide_rest: {starter, endgame}, slots: {slot_key: SlotConfig}}
// SlotConfig:
//   enabled, tier (lower = earlier), color (null = tier palette),
//   uniques [ids], legendaries, leg_rarity (8),
//   desired [affix ids], ga_wanted [affix ids, starred; also desired], required [affix ids, from imports],
//   n: desired stats needed, ga: greater affixes needed to recolour in the end-game filter
// One model compiles to two filters, switched in game. Per slot and item kind (uniques, legendaries):
//   starter  recolour: n desired stats (GA and ancestral ignored)  ·  show: always
//   endgame  recolour: ancestral + n desired + ga greater affixes (starred stats must be the GA)
//            show:     ancestral + n desired
// The recolour rule comes first (first match wins). With ga 0 the end-game filter has no recolour rule.
// By default the starter shows everything else; the end-game ends with `No Ma'am`. Rules come out in tier order.
import type { Condition, Filter, Rule } from "./codec.ts";
import { mapping } from "./mapping.ts";

export const TIER_COLORS = ["0xFFFFE000", "0xFF3366FF", "0xFF00FFF4", "0xFFE89922", "0xFFE8229F",
  "0xFF22E8CB", "0xFFD3E822", "0xFF4E8A20", "0xFFFFFFFF"];
export const UNIQUE_MASK = 48; // unique + mythic
const HIDE_ALL: Rule = { name: "No Ma'am", vis: 3, color: "0x00000000", enabled: 1, conditions: [] };

export type ProfileName = "starter" | "endgame";
export const PROFILES: ProfileName[] = ["starter", "endgame"];
/** Show rules carry this suffix; recolour rules use the plain slot label. */
export const SHOW_SUFFIX = " OK";

export interface SlotConfig {
  enabled: boolean; tier: number; color: string | null;
  uniques: number[]; legendaries: boolean; leg_rarity: number;
  desired: number[]; ga_wanted: number[]; required: number[];
  n: number; ga: number;
}
export interface Model {
  name: string; class: string; slot_idx: number;
  raw: { tier: number; rule: Rule }[];
  hide_rest: Record<ProfileName, boolean>;
  slots: Record<string, SlotConfig>;
}

export function defaultSlot(tier = 1): SlotConfig {
  return {
    enabled: false, tier, color: null, uniques: [], legendaries: false, leg_rarity: 8,
    desired: [], ga_wanted: [], required: [], n: 2, ga: 1,
  };
}

export function defaultModel(cls = "warlock", name = "New Filter"): Model {
  const slots: Record<string, SlotConfig> = {};
  Object.keys(mapping().slots).forEach((k, i) => { slots[k] = defaultSlot(i + 1); });
  return { name, class: cls, slot_idx: 1, raw: [], hide_rest: { starter: false, endgame: true }, slots };
}

export function slotItemTypes(slotKey: string, cls: string): number[] {
  const m = mapping();
  const ids = m.slots[slotKey].item_types;
  const usable = ids.filter((i) => m.item_types[String(i)].classes.includes(cls));
  return usable.length ? usable : ids;
}

/** Rollable affix ids that can appear on this slot for this class. */
export function validAffixes(slotKey: string, cls: string): number[] {
  const m = mapping();
  const labels = new Set(m.slots[slotKey].labels);
  return Object.entries(m.affixes)
    .filter(([, a]) => a.labels.some((l) => labels.has(l)) && a.classes.includes(cls) && a.rollable && !a.hidden)
    .map(([i]) => Number(i))
    .sort((a, b) => a - b);
}

/** Required stats, then "n of the desired stats". With withGa, starred stats must be the greater affix. */
function affixConditions(s: SlotConfig, withGa: boolean): Condition[] {
  const conds: Condition[] = [];
  if (s.required.length)
    conds.push({ type: 6, kind: "affixes", ids: [...s.required], value: s.required.length });
  const ids = [...s.desired];
  for (const g of s.ga_wanted) if (!ids.includes(g)) ids.push(g);
  if (ids.length && s.n > 0) {
    const c: Condition = { type: 6, kind: "affixes", ids, value: Math.min(s.n, ids.length) };
    if (withGa && s.ga_wanted.length) c.ga_required_on = s.ga_wanted.map((g) => [g, g]);
    conds.push(c);
  }
  return conds;
}

const ANCESTRAL: Condition = { type: 2, kind: "property", value: 4 };
const gaCondition = (ga: number): Condition => ({ type: 4, kind: "greater_affixes", value: ga, flag: 1 });

/** [recolour conditions or null, show conditions] for one profile, between the rarity and item conditions. */
function levels(s: SlotConfig, profile: ProfileName): [Condition[] | null, Condition[]] {
  if (profile === "starter") {
    const stats = affixConditions(s, false);
    return [stats.length ? stats : null, []];
  }
  const show = [{ ...ANCESTRAL }, ...affixConditions(s, false)];
  const recolour = s.ga > 0 ? [{ ...ANCESTRAL }, gaCondition(s.ga), ...affixConditions(s, true)] : null;
  return [recolour, show];
}

export function slotRules(key: string, s: SlotConfig, cls: string, label: string, profile: ProfileName = "endgame"): Rule[] {
  const color = s.color || TIER_COLORS[Math.min(s.tier, TIER_COLORS.length) - 1];
  const kinds: [string, Condition, Condition][] = [];
  if (s.uniques.length)
    kinds.push([`${label} Uni`, { type: 1, kind: "rarity", value: UNIQUE_MASK }, { type: 8, kind: "uniques", ids: [...s.uniques] }]);
  if (s.legendaries)
    kinds.push([`${label} Leg`, { type: 1, kind: "rarity", value: s.leg_rarity }, { type: 5, kind: "item_types", ids: slotItemTypes(key, cls) }]);
  const [recolour, show] = levels(s, profile);
  const out: Rule[] = [];
  if (recolour)
    for (const [name, rarity, items] of kinds)
      out.push({ name, vis: 2, color, enabled: 1, conditions: [{ ...rarity }, ...structuredClone(recolour), { ...items }] });
  for (const [name, rarity, items] of kinds)
    out.push({ name: name + SHOW_SUFFIX, vis: 0, color, enabled: 1, conditions: [{ ...rarity }, ...structuredClone(show), { ...items }] });
  return out;
}

/** Filter for one profile. The endgame filter keeps the model's name; the starter adds " Starter". */
export function compileModel(model: Model, profile: ProfileName = "endgame"): Filter {
  const m = mapping();
  const order = Object.keys(m.slots);
  type Item = [number, number, number, string | null, SlotConfig | Rule];
  const items: Item[] = [
    ...Object.entries(model.slots).filter(([, s]) => s.enabled)
      .map(([k, s]): Item => [s.tier, 1, order.indexOf(k), k, s]),
    ...model.raw.map((r, i): Item => [r.tier, 0, i, null, r.rule]),
  ];
  items.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const rules: Rule[] = [];
  for (const [, , , k, s] of items) {
    if (k === null) rules.push(s as Rule);
    else rules.push(...slotRules(k, s as SlotConfig, model.class, m.slots[k].label.replace(" (x2)", ""), profile));
  }
  if (model.hide_rest[profile]) rules.push({ ...HIDE_ALL });
  const cid = m.filter_class_id[model.class];
  if (cid === undefined)
    throw new Error(`filter class_id for ${model.class} is unverified; import one of its filters first`);
  const name = profile === "starter" ? `${model.name} Starter` : model.name;
  return { name, class_id: cid, slot_idx: model.slot_idx ?? 1, rules };
}
