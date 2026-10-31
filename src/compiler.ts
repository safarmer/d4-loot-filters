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
// Gear rules merge across slots where that cannot change what matches (see gearRules), and
// starter gets "All Ancestral" (on) / end-game "Any 2GA+ Ancestral" (off) before Mythics, for
// toggling in game. Limits: MAX_RULES rules, MAX_UNIQUES uniques per rule (checkLimits).
// Rule order is fixed, not chosen. A rule sits above another only where that changes what matches
// (first match wins): inside a section, strong recolour (much better) before recolour before show,
// since they cover the same items. Sections cover different items (charms vs each gear slot;
// uniques vs legendaries by rarity), so they stay in natural order:
//   kept-as-is rules imported before any modelled rule, charms, gear slots in slot order,
//   kept-as-is rules imported after, Mythics, `No Ma'am`.
// Mythics (show rarity 32) comes last so the unique recolour rules (rarity 48 = unique + mythic)
// match mythics first.
// Both filters end with `No Ma'am` (hide the rest); the player can switch it off in game.
import type { Condition, Filter, Rule } from "./codec.ts";
import { mapping } from "./mapping.ts";

export const UNIQUE_MASK = 48; // unique + mythic
export const SET_MASK = 64;
const HIDE_ALL: Rule = { name: "No Ma'am", vis: 3, color: "0x00000000", enabled: 1, conditions: [] };
export const MYTHIC_MASK = 32;
const MYTHICS: Rule = { name: "Mythics", vis: 0, color: "0xFFFF0000", enabled: 1, conditions: [{ type: 1, kind: "rarity", value: MYTHIC_MASK }] };

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

/** Owner's limits: rules per filter, uniques per uniques condition (stats: no known limit). */
export const MAX_RULES = 25;
export const MAX_UNIQUES = 10;

const ANCESTRAL: Condition = { type: 2, kind: "property", value: 4 };
const gaCondition = (ga: number): Condition => ({ type: 4, kind: "greater_affixes", value: ga, flag: 1 });
/** Catch-all rules before Mythics, for toggling in game: starter on, end-game off. */
const ALL_ANCESTRAL: Rule = { name: "All Ancestral", vis: 0, color: "0xFF22E8CB", enabled: 1, conditions: [{ ...ANCESTRAL }] };
const ANY_2GA_ANCESTRAL: Rule = { name: "Any 2GA+ Ancestral", vis: 0, color: "0xFF22E8CB", enabled: 0,
  conditions: [gaCondition(2), { ...ANCESTRAL }] };

type LevelName = "recolour" | "show";
/** One level's conditions for a slot, apart from rarity and items. */
interface Spec { ancestral: boolean; ga: number; n: number; desired: number[]; pairs: number[]; required: number[] }

/** The slot's recolour and show specs for a profile (null = no such rule). */
function specs(s: SlotConfig, profile: ProfileName): Record<LevelName, Spec | null> {
  const desired = [...s.desired];
  for (const g of s.ga_wanted) if (!desired.includes(g)) desired.push(g);
  const n = desired.length ? s.n : 0;
  const base = { required: [...s.required], desired: n ? desired : [], n, pairs: [] as number[] };
  if (profile === "starter")
    return { recolour: n || s.required.length ? { ...base, ancestral: false, ga: 0 } : null, show: { ...base, ancestral: false, ga: 0, n: 0, desired: [], required: [] } };
  return {
    recolour: s.ga > 0 ? { ...base, ancestral: true, ga: s.ga, pairs: n ? [...s.ga_wanted] : [] } : null,
    show: { ...base, ancestral: true, ga: 0 },
  };
}

function specConditions(p: Spec): Condition[] {
  const conds: Condition[] = [];
  if (p.ancestral) conds.push({ ...ANCESTRAL });
  if (p.ga > 0) conds.push(gaCondition(p.ga));
  if (p.required.length) conds.push({ type: 6, kind: "affixes", ids: [...p.required], value: p.required.length });
  if (p.n > 0) {
    const c: Condition = { type: 6, kind: "affixes", ids: [...p.desired], value: Math.min(p.n, p.desired.length) };
    if (p.pairs.length) c.ga_required_on = p.pairs.map((g) => [g, g]);
    conds.push(c);
  }
  return conds;
}

const same = (a: number[], b: number[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

interface Group { kind: "uni" | "leg"; level: LevelName; spec: Spec; slots: string[]; rarity: number }

/**
 * Gear rules with slots merged where that cannot change what matches: same kind, level, ancestral,
 * GA count, required stats, starred stats and stat count, and the combined stat list only adds, for
 * each slot, stats that cannot roll on that slot. Uniques go in rules of at most MAX_UNIQUES.
 * Order: all recolour rules, then all show rules (each slot's recolour still comes before its show).
 */
export function gearRules(model: Model, profile: ProfileName = "endgame"): { section: string; rule: Rule }[] {
  const m = mapping();
  const valid = new Map<string, Set<number>>();
  const validFor = (k: string) => {
    if (!valid.has(k)) valid.set(k, new Set(validAffixes(k, model.class)));
    return valid.get(k)!;
  };
  const groups: Group[] = [];
  const own = new Map<string, Spec>(); // `${level}/${slot}` -> the slot's own spec
  for (const level of ["recolour", "show"] as LevelName[])
    for (const [k, s] of Object.entries(model.slots)) {
      if (!s.enabled) continue;
      const spec = specs(s, profile)[level];
      if (!spec) continue;
      own.set(`${level}/${k}`, spec);
      for (const kind of ["uni", "leg"] as const) {
        if (kind === "uni" ? !s.uniques.length : !s.legendaries) continue;
        const rarity = kind === "uni" ? UNIQUE_MASK : s.leg_rarity;
        const fits = (g: Group) => {
          if (g.kind !== kind || g.level !== level || g.rarity !== rarity) return false;
          const a = g.spec;
          if (a.ancestral !== spec.ancestral || a.ga !== spec.ga || a.n !== spec.n
            || !same(a.required, spec.required) || !same(a.pairs, spec.pairs)) return false;
          const union = [...new Set([...a.desired, ...spec.desired])];
          // each slot's stat count and its rollable stats must stay the same
          for (const slot of [...g.slots, k]) {
            const mine = slot === k ? spec : own.get(`${level}/${slot}`)!;
            if (Math.min(mine.n, mine.desired.length) !== Math.min(mine.n, union.length)) return false;
            if (union.some((id) => !mine.desired.includes(id) && validFor(slot).has(id))) return false;
          }
          return true;
        };
        const g = groups.find(fits);
        if (g) {
          g.slots.push(k);
          g.spec = { ...g.spec, desired: [...new Set([...g.spec.desired, ...spec.desired])] };
        } else groups.push({ kind, level, spec: { ...spec }, slots: [k], rarity });
      }
    }

  const label = (k: string) => m.slots[k].label.replace(" (x2)", "");
  const out: { section: string; rule: Rule }[] = [];
  for (const g of groups) {
    const names = g.slots.map(label);
    const who = names.length <= 2 ? names.join("/") : "Gear";
    const suffix = g.level === "show" ? SHOW_SUFFIX : "";
    const vis = g.level === "recolour" ? 2 : 0;
    const conds = specConditions(g.spec);
    const rule = (name: string, items: Condition): Rule => ({ name, vis, color: model.colors.gear, enabled: 1,
      conditions: [{ type: 1, kind: "rarity", value: g.rarity }, ...structuredClone(conds), items] });
    if (g.kind === "uni") {
      const ids = g.slots.flatMap((k) => model.slots[k].uniques);
      const chunks = Math.ceil(ids.length / MAX_UNIQUES);
      for (let i = 0; i < chunks; i++)
        out.push({ section: names.join(", "), rule: rule(`${who} Uni${chunks > 1 ? ` ${i + 1}` : ""}${suffix}`,
          { type: 8, kind: "uniques", ids: ids.slice(i * MAX_UNIQUES, (i + 1) * MAX_UNIQUES) }) });
    } else {
      const types = [...new Set(g.slots.flatMap((k) => slotItemTypes(k, model.class)))];
      out.push({ section: names.join(", "), rule: rule(`${who} Leg${suffix}`, { type: 5, kind: "item_types", ids: types }) });
    }
  }
  return out;
}

/** Rules for one profile in output order, without `No Ma'am`, each with the section it comes from. */
export function orderedRules(model: Model, profile: ProfileName = "endgame"): { section: string; rule: Rule }[] {
  const out: { section: string; rule: Rule }[] = [];
  const add = (section: string, rules: Rule[]) => rules.forEach((rule) => out.push({ section, rule }));
  add("kept as-is", model.raw.filter((r) => r.place === "first").map((r) => r.rule));
  add("Charms", charmRules(model.charms, model.colors));
  out.push(...gearRules(model, profile));
  add("kept as-is", model.raw.filter((r) => r.place === "last").map((r) => r.rule));
  // for toggling in game: starter shows every ancestral; end-game has a 2-GA version, off
  add("Catch-all", [structuredClone(profile === "starter" ? ALL_ANCESTRAL : ANY_2GA_ANCESTRAL)]);
  add("Mythics", [structuredClone(MYTHICS)]); // always; the player can switch it off in game
  return out;
}

/** Problems with a compiled filter against the owner's limits (MAX_RULES, MAX_UNIQUES). */
export function checkLimits(f: Filter): string[] {
  const problems: string[] = [];
  if (f.rules.length > MAX_RULES) problems.push(`${f.name}: ${f.rules.length} rules, limit ${MAX_RULES}`);
  for (const r of f.rules)
    for (const c of r.conditions)
      if (c.type === 8 && (c.ids?.length ?? 0) > MAX_UNIQUES)
        problems.push(`${r.name}: ${c.ids!.length} uniques in one rule, limit ${MAX_UNIQUES}`);
  return problems;
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
