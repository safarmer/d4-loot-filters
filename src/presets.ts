// Default filters bundled with the app: build guides as editor models, written with the names the
// editor shows (unique names, stat and set labels) instead of SNO IDs, so a person can read and edit them.
import { classSets, classUniqueCharms, defaultModel, validAffixes, validCharmAffixes, type Model } from "./compiler.ts";
import { mapping } from "./mapping.ts";

export interface PresetSlot {
  /** Unique names as the pick list shows them. */
  uniques?: string[];
  /** Also match legendaries (default: on when no unique is picked). */
  legendaries?: boolean;
  /** Desired stat labels as the stat list shows them. */
  stats?: string[];
  /** Starred stats (must be the greater affix in the end-game and strict recolours). */
  ga?: string[];
  /** Desired stats needed (default 2) and greater affixes needed (default 1). */
  n?: number; ga_count?: number;
}
export interface Preset {
  name: string; class: string;
  /** The build guide the preset follows. */
  source: string;
  slots: Record<string, PresetSlot>;
  charms?: { uniques?: string[]; sets?: string[]; stats?: string[]; n?: number; mats?: boolean };
}

/** Finds the one ID whose name is `name`; throws on no match or more than one. */
function pick(ids: number[], nameOf: (id: number) => string, name: string, what: string): number {
  const hits = ids.filter((i) => nameOf(i) === name);
  if (hits.length !== 1) throw new Error(`${what} "${name}": ${hits.length ? "more than one match" : "not found"}`);
  return hits[0];
}

/** Resolves a preset's names to IDs. Throws when a name is unknown, ambiguous or cannot roll there. */
export function presetToModel(p: Preset): Model {
  const m = mapping();
  const model = defaultModel(p.class, p.name);
  const uniqueName = (i: number) => m.uniques[i].display ?? m.uniques[i].name;
  const affixName = (i: number) => m.affixes[i].label;
  for (const [key, s] of Object.entries(p.slots)) {
    if (!m.slots[key]) throw new Error(`${p.name}: no slot "${key}"`);
    const gear = Object.entries(m.uniques)
      .filter(([, u]) => u.slot === key && u.classes.includes(p.class) && !u.hidden).map(([i]) => Number(i));
    const valid = validAffixes(key, p.class).filter((i) => !m.affixes[i].hidden);
    const slot = model.slots[key];
    slot.uniques = (s.uniques ?? []).map((n) => pick(gear, uniqueName, n, `${p.name} ${key} unique`));
    slot.desired = (s.stats ?? []).map((n) => pick(valid, affixName, n, `${p.name} ${key} stat`));
    slot.ga_wanted = (s.ga ?? []).map((n) => pick(slot.desired, affixName, n, `${p.name} ${key} starred stat`));
    slot.legendaries = s.legendaries ?? slot.uniques.length === 0;
    slot.n = s.n ?? 2;
    slot.ga = s.ga_count ?? 1;
    slot.enabled = slot.uniques.length > 0 || slot.desired.length > 0;
  }
  if (p.charms) {
    const c = p.charms;
    const sets = classSets(p.class);
    const stats = validCharmAffixes(p.class).filter((i) => !m.affixes[i].hidden);
    model.charms.uniques = (c.uniques ?? []).map((n) => pick(classUniqueCharms(p.class), uniqueName, n, `${p.name} unique charm`));
    model.charms.sets = (c.sets ?? []).map((n) => pick(sets, (i) => m.talisman_sets[i].display ?? m.talisman_sets[i].name, n, `${p.name} set`));
    model.charms.desired = (c.stats ?? []).map((n) => pick(stats, affixName, n, `${p.name} charm stat`));
    model.charms.n = c.n ?? 1;
    model.charms.mats = c.mats ?? true;
    model.charms.enabled = model.charms.uniques.length + model.charms.sets.length > 0;
  }
  return model;
}
