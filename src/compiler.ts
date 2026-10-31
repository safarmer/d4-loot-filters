// Slot model -> filter JSON (the structure tools/filter_tool.ts encodes).
//
// Model:
//   {name, class, slot_idx, raw: [{tier, rule}], hide_rest: {starter, endgame}, slots: {slot_key: SlotConfig}}
// SlotConfig:
//   enabled, tier (lower = earlier), color (null = tier palette),
//   uniques [ids], legendaries, leg_rarity (8),
//   desired [affix ids], ga_wanted [affix ids, starred; also desired], required [affix ids, from imports],
//   starter / endgame: {ancestral, recolour: Level, show: Level}
//   Level: {on, n: desired stats needed, ga: greater affixes needed}
// One model compiles to two filters: starter (looser, by default shows the rest) and endgame
// (stricter, by default ends with `No Ma'am`). Per slot, the recolour level ("likely much better")
// comes before the show level ("OK or slightly better"): first match wins. Rules come out in tier order.
import type { Condition, Filter, Rule } from "./codec.ts";
import { mapping } from "./mapping.ts";

export const TIER_COLORS = ["0xFFFFE000", "0xFF3366FF", "0xFF00FFF4", "0xFFE89922", "0xFFE8229F",
  "0xFF22E8CB", "0xFFD3E822", "0xFF4E8A20", "0xFFFFFFFF"];
export const UNIQUE_MASK = 48; // unique + mythic
const HIDE_ALL: Rule = { name: "No Ma'am", vis: 3, color: "0x00000000", enabled: 1, conditions: [] };

export type ProfileName = "starter" | "endgame";
export const PROFILES: ProfileName[] = ["starter", "endgame"];
export type LevelName = "recolour" | "show";
export const LEVELS: LevelName[] = ["recolour", "show"];
export interface Level { on: boolean; n: number; ga: number }
export interface Profile { ancestral: boolean; recolour: Level; show: Level }

export interface SlotConfig {
  enabled: boolean; tier: number; color: string | null;
  uniques: number[]; legendaries: boolean; leg_rarity: number;
  desired: number[]; ga_wanted: number[]; required: number[];
  starter: Profile; endgame: Profile;
}
export interface Model {
  name: string; class: string; slot_idx: number;
  raw: { tier: number; rule: Rule }[];
  hide_rest: Record<ProfileName, boolean>;
  slots: Record<string, SlotConfig>;
}

export const defaultProfile = (p: ProfileName): Profile => p === "starter"
  ? { ancestral: false, recolour: { on: true, n: 2, ga: 1 }, show: { on: true, n: 1, ga: 0 } }
  : { ancestral: true, recolour: { on: true, n: 3, ga: 2 }, show: { on: true, n: 2, ga: 1 } };

export function defaultSlot(tier = 1): SlotConfig {
  return {
    enabled: false, tier, color: null, uniques: [], legendaries: false, leg_rarity: 8,
    desired: [], ga_wanted: [], required: [],
    starter: defaultProfile("starter"), endgame: defaultProfile("endgame"),
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

function affixConditions(s: SlotConfig, p: Level): Condition[] {
  const conds: Condition[] = [];
  if (s.required.length)
    conds.push({ type: 6, kind: "affixes", ids: [...s.required], value: s.required.length });
  const ids = [...s.desired];
  for (const g of s.ga_wanted) if (!ids.includes(g)) ids.push(g);
  if (ids.length && p.n > 0) {
    const c: Condition = { type: 6, kind: "affixes", ids, value: Math.min(p.n, ids.length) };
    // starred stats ask for the greater affix on that stat; only when this profile wants GAs
    if (s.ga_wanted.length && p.ga > 0) c.ga_required_on = s.ga_wanted.map((g) => [g, g]);
    conds.push(c);
  }
  return conds;
}

function common(s: SlotConfig, ancestral: boolean, p: Level): Condition[] {
  const conds: Condition[] = [];
  if (ancestral) conds.push({ type: 2, kind: "property", value: 4 });
  if (p.ga > 0) conds.push({ type: 4, kind: "greater_affixes", value: p.ga, flag: 1 });
  return [...conds, ...affixConditions(s, p)];
}

/** Rule name suffix per level, used by the importer to tell them apart from imported names. */
export const LEVEL_SUFFIX: Record<LevelName, string> = { recolour: "", show: " OK" };

export function slotRules(key: string, s: SlotConfig, cls: string, label: string, profile: ProfileName = "endgame"): Rule[] {
  const p = s[profile];
  const color = s.color || TIER_COLORS[Math.min(s.tier, TIER_COLORS.length) - 1];
  const out: Rule[] = [];
  for (const lv of LEVELS) {
    const level = p[lv];
    if (!level.on) continue;
    const vis = lv === "recolour" ? 2 : 0;
    const rule = (name: string, conditions: Condition[]): Rule =>
      ({ name: name + LEVEL_SUFFIX[lv], vis, color, enabled: 1, conditions });
    if (s.uniques.length)
      out.push(rule(`${label} Uni`, [{ type: 1, kind: "rarity", value: UNIQUE_MASK }, ...common(s, p.ancestral, level),
        { type: 8, kind: "uniques", ids: [...s.uniques] }]));
    if (s.legendaries)
      out.push(rule(`${label} Leg`, [{ type: 1, kind: "rarity", value: s.leg_rarity }, ...common(s, p.ancestral, level),
        { type: 5, kind: "item_types", ids: slotItemTypes(key, cls) }]));
  }
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
