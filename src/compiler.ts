// Slot model -> filter JSON (the structure tools/filter_tool.ts encodes).
//
// Model:
//   {name, class, slot_idx, raw: [{tier, rule}], slots: {slot_key: SlotConfig}}
// SlotConfig:
//   enabled, tier (lower = earlier), vis (0 show, 2 recolour), color (null = tier palette),
//   uniques [ids], legendaries, leg_rarity (8), ancestral, ga_min,
//   required [affix ids], desired {n, affixes}, ga_wanted [affix ids, subset of desired]
// Rules come out in tier order, `No Ma'am` last.
import type { Condition, Filter, Rule } from "./codec.ts";
import { mapping } from "./mapping.ts";

export const TIER_COLORS = ["0xFFFFE000", "0xFF3366FF", "0xFF00FFF4", "0xFFE89922", "0xFFE8229F",
  "0xFF22E8CB", "0xFFD3E822", "0xFF4E8A20", "0xFFFFFFFF"];
export const UNIQUE_MASK = 48; // unique + mythic
const HIDE_ALL: Rule = { name: "No Ma'am", vis: 3, color: "0x00000000", enabled: 1, conditions: [] };

export interface SlotConfig {
  enabled: boolean; tier: number; vis: number; color: string | null;
  uniques: number[]; legendaries: boolean; leg_rarity: number;
  ancestral: boolean; ga_min: number;
  required: number[]; desired: { n: number; affixes: number[] }; ga_wanted: number[];
}
export interface Model {
  name: string; class: string; slot_idx: number;
  raw: { tier: number; rule: Rule }[];
  slots: Record<string, SlotConfig>;
}

export function defaultSlot(tier = 1): SlotConfig {
  return {
    enabled: false, tier, vis: 2, color: null, uniques: [], legendaries: false, leg_rarity: 8,
    ancestral: true, ga_min: 1, required: [], desired: { n: 0, affixes: [] }, ga_wanted: [],
  };
}

export function defaultModel(cls = "warlock", name = "New Filter"): Model {
  const slots: Record<string, SlotConfig> = {};
  Object.keys(mapping().slots).forEach((k, i) => { slots[k] = defaultSlot(i + 1); });
  return { name, class: cls, slot_idx: 1, raw: [], slots };
}

export function slotItemTypes(slotKey: string, cls: string): number[] {
  const m = mapping();
  const ids = m.slots[slotKey].item_types;
  const usable = ids.filter((i) => m.item_types[String(i)].classes.includes(cls));
  return usable.length ? usable : ids;
}

/** Affix ids that can roll on this slot for this class. */
export function validAffixes(slotKey: string, cls: string, tempered = false): number[] {
  const m = mapping();
  const labels = new Set(m.slots[slotKey].labels);
  return Object.entries(m.affixes)
    .filter(([, a]) => a.labels.some((l) => labels.has(l)) && a.classes.includes(cls) && (tempered || !a.tempered))
    .map(([i]) => Number(i))
    .sort((a, b) => a - b);
}

function affixConditions(s: SlotConfig): Condition[] {
  const conds: Condition[] = [];
  if (s.required.length)
    conds.push({ type: 6, kind: "affixes", ids: [...s.required], value: s.required.length });
  const ids = [...s.desired.affixes];
  for (const g of s.ga_wanted) if (!ids.includes(g)) ids.push(g);
  if (ids.length && s.desired.n > 0) {
    const c: Condition = { type: 6, kind: "affixes", ids, value: Math.min(s.desired.n, ids.length) };
    if (s.ga_wanted.length) c.ga_required_on = s.ga_wanted.map((g) => [g, g]);
    conds.push(c);
  }
  return conds;
}

function common(s: SlotConfig): Condition[] {
  const conds: Condition[] = [];
  if (s.ancestral) conds.push({ type: 2, kind: "property", value: 4 });
  if (s.ga_min > 0) conds.push({ type: 4, kind: "greater_affixes", value: s.ga_min, flag: 1 });
  return [...conds, ...affixConditions(s)];
}

export function slotRules(key: string, s: SlotConfig, cls: string, label: string): Rule[] {
  const color = s.color || TIER_COLORS[Math.min(s.tier, TIER_COLORS.length) - 1];
  const rule = (name: string, conditions: Condition[]): Rule => ({ name, vis: s.vis, color, enabled: 1, conditions });
  const out: Rule[] = [];
  if (s.uniques.length)
    out.push(rule(`${label} Uni`, [{ type: 1, kind: "rarity", value: UNIQUE_MASK }, ...common(s),
      { type: 8, kind: "uniques", ids: [...s.uniques] }]));
  if (s.legendaries)
    out.push(rule(`${label} Leg`, [{ type: 1, kind: "rarity", value: s.leg_rarity }, ...common(s),
      { type: 5, kind: "item_types", ids: slotItemTypes(key, cls) }]));
  return out;
}

export function compileModel(model: Model): Filter {
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
    else rules.push(...slotRules(k, s as SlotConfig, model.class, m.slots[k].label.replace(" (x2)", "")));
  }
  rules.push({ ...HIDE_ALL });
  const cid = m.filter_class_id[model.class];
  if (cid === undefined)
    throw new Error(`filter class_id for ${model.class} is unverified; import one of its filters first`);
  return { name: model.name, class_id: cid, slot_idx: model.slot_idx ?? 1, rules };
}
