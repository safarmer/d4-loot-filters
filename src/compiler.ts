// Slot model -> filter JSON (the structure tools/filter_tool.ts encodes).
//
// Model:
//   {name, class, slot_idx, raw: [{place, rule}],
//    colors: {gear, charm_set, charm_stats}, charms: CharmConfig, slots: {slot_key: SlotConfig}}
// CharmConfig: enabled, sets [talisman set ids], desired [charm stat ids], n, mats
//   Charm rules (same in both filters): "Charm Set+Stats" (set charm of a wanted set with n desired
//   stats, charm_stats colour) before "Charm Set" (any set charm of a wanted set, charm_set colour).
//   With mats, "Charms/Seals for Mats" then shows every legendary-or-better charm and seal (set
//   charms included) for crafting materials, so the two charm colours only mark the wanted ones.
// SlotConfig:
//   enabled,
//   uniques [ids], legendaries, leg_rarity (8),
//   desired [affix ids], ga_wanted [affix ids, starred; also desired], required [affix ids, from imports],
//   n: desired stats needed, ga: greater affixes needed to recolour in the end-game filter
// One model compiles to two filters, switched in game. Per slot and item kind (uniques, legendaries):
//   starter  recolour: n desired stats (GA and ancestral ignored)  ·  show: always
//   endgame  recolour: ancestral + n desired + ga greater affixes (starred stats must be the GA)
//            show:     ancestral + n desired
// The recolour rule comes first (first match wins). With ga 0 the end-game filter has no recolour rule.
// All gear recolours use colors.gear.
// Rule order is fixed, not chosen. A rule sits above another only where that changes what matches
// (first match wins): inside a section, strong recolour (much better) before recolour before show,
// since they cover the same items. Sections cover different items (charms vs each gear slot;
// uniques vs legendaries by rarity), so they stay in natural order:
//   kept-as-is rules imported before any modelled rule, charms, gear slots in slot order,
//   kept-as-is rules imported after, `No Ma'am`.
// Both filters end with `No Ma'am` (hide the rest); the player can switch it off in game.
import type { Condition, Filter, Rule } from "./codec.ts";
import { mapping } from "./mapping.ts";

export const UNIQUE_MASK = 48; // unique + mythic
export const SET_MASK = 64;
const HIDE_ALL: Rule = { name: "No Ma'am", vis: 3, color: "0x00000000", enabled: 1, conditions: [] };

export type ProfileName = "starter" | "endgame";
export const PROFILES: ProfileName[] = ["starter", "endgame"];
/** Show rules carry this suffix; recolour rules use the plain slot label. */
export const SHOW_SUFFIX = " OK";

export interface Colors { gear: string; charm_set: string; charm_stats: string }
/** Owner's colours: lemon yellow gear, orange set charms, yellow-green set charms with stats. */
export const DEFAULT_COLORS: Colors = { gear: "0xFFFFE000", charm_set: "0xFFE89922", charm_stats: "0xFFD3E822" };

/** Where a kept-as-is rule goes: before or after the modelled rules (as it was imported). */
export type Place = "first" | "last";

export interface CharmConfig { enabled: boolean; sets: number[]; desired: number[]; n: number; mats: boolean }
/** Rarity mask of the materials rule: legendary, unique, mythic, set (owner's choice). */
export const MATS_MASK = 120;

export interface SlotConfig {
  enabled: boolean;
  uniques: number[]; legendaries: boolean; leg_rarity: number;
  desired: number[]; ga_wanted: number[]; required: number[];
  n: number; ga: number;
}
export interface Model {
  name: string; class: string; slot_idx: number;
  raw: { place: Place; rule: Rule }[];
  colors: Colors;
  charms: CharmConfig;
  slots: Record<string, SlotConfig>;
}

export function defaultSlot(): SlotConfig {
  return {
    enabled: false, uniques: [], legendaries: false, leg_rarity: 8,
    desired: [], ga_wanted: [], required: [], n: 2, ga: 1,
  };
}

export function defaultModel(cls = "warlock", name = "New Filter"): Model {
  const slots: Record<string, SlotConfig> = {};
  for (const k of Object.keys(mapping().slots)) slots[k] = defaultSlot();
  return {
    name, class: cls, slot_idx: 1, raw: [],
    colors: { ...DEFAULT_COLORS }, charms: { enabled: false, sets: [], desired: [], n: 1, mats: true }, slots,
  };
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

/** Charm stats this class can roll on legendary-or-better charms. */
export function validCharmAffixes(cls: string): number[] {
  return Object.entries(mapping().affixes)
    .filter(([, a]) => a.charm_stat && a.classes.includes(cls))
    .map(([i]) => Number(i))
    .sort((a, b) => a - b);
}

/** Talisman set ids for this class. */
export function classSets(cls: string): number[] {
  return Object.entries(mapping().talisman_sets).filter(([, t]) => t.classes.includes(cls)).map(([i]) => Number(i));
}

/** Charm rules, strongest first: Set+Stats (strong recolour), Set (recolour), materials (show). */
export function charmRules(c: CharmConfig, colors: Colors): Rule[] {
  const m = mapping();
  const out: Rule[] = [];
  const mats: Rule[] = c.mats ? [{ name: "Charms/Seals for Mats", vis: 0, color: "0xFFFF0000", enabled: 1, conditions: [
    { type: 1, kind: "rarity", value: MATS_MASK }, { type: 5, kind: "item_types", ids: [m.charm_type, m.seal_type] }] }] : [];
  if (!c.enabled || !c.sets.length) return mats;
  const set: Condition[] = [
    { type: 1, kind: "rarity", value: SET_MASK },
    { type: 9, kind: "talisman_sets", ids: [...c.sets] },
    { type: 5, kind: "item_types", ids: [m.charm_type] },
  ];
  if (c.desired.length && c.n > 0)
    out.push({ name: "Charm Set+Stats", vis: 2, color: colors.charm_stats, enabled: 1, conditions: [
      ...structuredClone(set), { type: 6, kind: "affixes", ids: [...c.desired], value: Math.min(c.n, c.desired.length) }] });
  out.push({ name: "Charm Set", vis: 2, color: colors.charm_set, enabled: 1, conditions: structuredClone(set) });
  return [...out, ...mats];
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

export function slotRules(key: string, s: SlotConfig, cls: string, label: string, profile: ProfileName = "endgame",
  color = DEFAULT_COLORS.gear): Rule[] {
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

/** Rules for one profile in output order, without `No Ma'am`, each with the section it comes from. */
export function orderedRules(model: Model, profile: ProfileName = "endgame"): { section: string; rule: Rule }[] {
  const m = mapping();
  const out: { section: string; rule: Rule }[] = [];
  const add = (section: string, rules: Rule[]) => rules.forEach((rule) => out.push({ section, rule }));
  add("kept as-is", model.raw.filter((r) => r.place === "first").map((r) => r.rule));
  add("Charms", charmRules(model.charms, model.colors));
  for (const [k, s] of Object.entries(model.slots))
    if (s.enabled) add(m.slots[k].label, slotRules(k, s, model.class, m.slots[k].label.replace(" (x2)", ""), profile, model.colors.gear));
  add("kept as-is", model.raw.filter((r) => r.place === "last").map((r) => r.rule));
  return out;
}

/** Filter for one profile. The endgame filter keeps the model's name; the starter adds " Starter". */
export function compileModel(model: Model, profile: ProfileName = "endgame"): Filter {
  const m = mapping();
  const rules = [...orderedRules(model, profile).map((r) => r.rule), { ...HIDE_ALL }];
  const cid = m.filter_class_id[model.class];
  if (cid === undefined)
    throw new Error(`filter class_id for ${model.class} is unverified; import one of its filters first`);
  const name = profile === "starter" ? `${model.name} Starter` : model.name;
  return { name, class_id: cid, slot_idx: model.slot_idx ?? 1, rules };
}
