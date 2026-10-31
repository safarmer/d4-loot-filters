// Build the mapping (data/meta.json, uniques.json, affixes.json) from a d4data checkout (files only).
//
// Usage: npm run build-mapping -- <d4data/json dir> [out dir]
//
// Reads, from <json dir>:
//   base/meta/ItemType/*.itt.json   slot -> item type id, item labels
//   base/meta/Item/*.itm.json       unique items (type, class, forced affixes)
//   base/meta/Affix/*.aff.json      affix labels (which slots it can roll on), classes
//   base/meta/SetItemBonus/*.set.json  charm (talisman) sets
//   enUS_Text/meta/StringList/      display names
// Source: https://github.com/DiabloTools/d4data (extracted game files). Never game memory or network.
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { MAPPING_FILES, type AffixDef, type ItemTypeDef, type MappingMeta, type SlotDef, type TalismanSetDef, type UniqueDef } from "../src/mapping.ts";
import { DATA_DIR } from "./node_mapping.ts";

// d4data class order (index of fUsableByClass / fAllowedForPlayerClass). Checked against item
// types: Bow->rogue(3), Scythe->necromancer(4), Glaive->spiritborn(5), Focus->sorc/necro/warlock.
const CLASSES = ["sorcerer", "druid", "barbarian", "rogue", "necromancer", "spiritborn", "paladin", "warlock"];
// Filter-file class_id values seen in real filters. Others are unverified, so left out.
const FILTER_CLASS_ID = { warlock: 6, rogue: 7 };

// Paper-doll slots -> d4data ItemType names.
const SLOTS: [string, string, string[]][] = [
  ["helm", "Helm", ["Helm"]],
  ["chest", "Chest", ["ChestArmor"]],
  ["gloves", "Gloves", ["Gloves"]],
  ["pants", "Pants", ["Legs"]],
  ["boots", "Boots", ["Boots"]],
  ["amulet", "Amulet", ["Amulet"]],
  ["ring", "Ring (x2)", ["Ring"]],
  ["weapon", "Weapon", ["Axe", "Axe2H", "Axe_Berserker_Axe", "Bow", "Crossbow", "Crossbow2H",
    "Dagger", "Flail", "Glaive", "Mace", "Mace2H", "Mace2HDruid", "Polearm",
    "Quarterstaff", "Scythe", "Scythe2H", "Staff", "StaffDruid",
    "StaffSorcerer", "Sword", "Sword2H", "Sword_Phase_Blade", "Wand",
    "Amazon_Spear"]],
  ["offhand", "Offhand", ["Focus", "FocusBookOffHand", "OffHandTotem", "Shield", "ShieldHTH",
    "DaggerOffHand", "Amazon_Shield"]],
];
const CHARM_TYPE = 2288901, SEAL_TYPE = 2326144;

// Affix dwFlags bits, inferred from data and checked against every affix id in the working filters:
// 0x01 = can roll as a random stat; 0x80 = superseded copy (e.g. Movement_Speed vs S04_Movement_Speed).
const ROLLS = 0x01, SUPERSEDED = 0x80;
// 0x04 = restricted stat; on a season-prefixed affix it marks a seasonal mechanic's stat
// (e.g. S12_KillStreak_*). Base stats with it (S04_CoreStats_All) stay shown.
const RESTRICTED = 0x04;
const BASE_STAT_SEASON = 4; // S04_ = the base stat set since the Season 4 itemization rework
const NOT_REAL = /^(test|unique)_/i; // test and unique-only affixes that still carry the roll bit

/** A random stat that can roll on gear: not a legendary power, tempered affix, unique-only or old copy. */
function rollable(name: string, d: any): boolean {
  return (d.dwFlags & ROLLS) !== 0 && (d.dwFlags & SUPERSEDED) === 0 && d.eMagicType === 0
    && !d.bIsTemperedAffix && !NOT_REAL.test(name);
}

// Unique item fields, inferred from data:
//   eMagicType 4 = mythic.
//   eForcedItemQualityModifier 3 = Season 10 chaos copy (412 items, e.g. S10_Ring_Unique_Generic_100_Helm);
//   5 = S14_ copy of a mythic.
const MYTHIC = 4, CHAOS_COPY = 3, MYTHIC_COPY = 5;
// Season the game is in. Update each season, then rebuild.
const CURRENT_SEASON = 15;

/** Reason to hide a unique from pickers, or undefined to show it. */
function hiddenReason(name: string, display: string | null, d: any): string | undefined {
  if (!display || display.startsWith("[") || /NoPowers|Boost/.test(name)) return "placeholder or test item";
  if (d.eForcedItemQualityModifier === CHAOS_COPY) return "Season 10 chaos copy";
  return undefined;
}

// Affix eCategory: 0 offence, 1 defence, 2 utility, 3 resource, 4 mobility (inferred from data).
// Skill tags (arAffixSkillTags) split out finer groups: skill ranks sit in utility, core stats in
// offence, resistances in defence.
const CATEGORY = ["Offence", "Defence", "Utility", "Resource", "Mobility"];

function statGroup(d: any): string {
  const tags: string[] = d.arAffixSkillTags.map((t: any) => t?.name ?? "");
  if (tags.includes("Affix_SkillRankAny")) return "Skill ranks";
  if (tags.some((t) => t === "Affix_CoreStat" || t === "Affix_FlatCoreStat")) return "Core stats";
  if (tags.some((t) => t.startsWith("Affix_Resistance"))) return "Resistances";
  return CATEGORY[d.eCategory] ?? "Other";
}

// Charm stats: affixes allowed on the Charm item label, magic type 0 (not a legendary power), able to
// roll on legendary items (dwAllowedQualityLevels bit 8; magic-only charm stats lack it), and not
// unique-charm-only. Charms do not roll gear stats: a charm's life stat is Talisman_Charm_Affix_Life,
// not S04_Life.
const LEGENDARY_QUALITY = 8;
function charmStat(name: string, d: any, charmLabels: number[]): boolean {
  return d.arAllowedItemLabels.some((l: number) => charmLabels.includes(l)) && d.eMagicType === 0
    && (d.dwAllowedQualityLevels & LEGENDARY_QUALITY) !== 0 && !/UNIQUE|TEST/i.test(name);
}

const load = (p: string): any => JSON.parse(readFileSync(p, "utf8"));
const classes = (flags: number[]) => CLASSES.filter((_, i) => flags[i]);

/** All files in dir ending with suffix, as [name without suffix, path]. */
function files(dir: string, suffix: string, contains = ""): [string, string][] {
  return readdirSync(dir).filter((f) => f.endsWith(suffix) && f.includes(contains))
    .map((f) => [f.slice(0, -suffix.length), join(dir, f)]);
}

function pretty(name: string): string {
  return name.replace(/^(S\d+|X\d+|T\d+)_/, "").replaceAll("_", " ")
    .replace(/(?<=[a-z])(?=[A-Z])/g, " ").trim();
}

function display(stringsDir: string, prefix: string, name: string): string | null {
  const p = join(stringsDir, `${prefix}_${name}.stl.json`);
  if (!existsSync(p)) return null;
  return load(p).arStrings.find((e: any) => e.szLabel === "Name")?.szText ?? null;
}

function sortKeys(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(sortKeys);
  if (x && typeof x === "object")
    return Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys((x as any)[k])]));
  return x;
}

/** One record per line, keys in numeric order: small diffs when the game data changes. */
function perLine(records: Record<string, unknown>): string {
  const keys = Object.keys(records).sort((a, b) => Number(a) - Number(b));
  return "{\n" + keys.map((k) => `${JSON.stringify(k)}: ${JSON.stringify(sortKeys(records[k]))}`).join(",\n") + "\n}\n";
}

function gitCommit(dir: string): string | undefined {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

const [root, out = DATA_DIR] = process.argv.slice(2);
if (!root) {
  console.error("usage: npm run build-mapping -- <d4data/json dir> [out dir]");
  process.exit(1);
}
const meta = join(root, "base", "meta");
const strings = join(root, "enUS_Text", "meta", "StringList");

const itypes = new Map(files(join(meta, "ItemType"), ".itt.json").map(([n, p]) => [n, load(p)]));

const slots: Record<string, SlotDef> = {};
const typeSlot = new Map<number, string>();
for (const [key, label, names] of SLOTS) {
  const ids: number[] = [], labels = new Set<number>();
  for (const n of names) {
    const d = itypes.get(n);
    if (!d) continue;
    ids.push(d.__snoID__);
    d.arItemLabels.forEach((l: number) => labels.add(l));
    typeSlot.set(d.__snoID__, key);
  }
  slots[key] = { label, item_types: ids.sort((a, b) => a - b), labels: [...labels].sort((a, b) => a - b) };
}

const itemTypes: Record<string, ItemTypeDef> = {};
for (const [n, i] of itypes)
  if (typeSlot.has(i.__snoID__) || n === "Charm" || n === "HoradricSeal")
    itemTypes[i.__snoID__] = { name: n, slot: typeSlot.get(i.__snoID__) ?? null, classes: classes(i.fUsableByClass) };

const uniques: Record<string, UniqueDef> = {};
for (const [name, p] of files(join(meta, "Item"), ".itm.json", "_Unique_")) {
  const d = load(p);
  const t = d.snoItemType;
  if (!t) continue;
  const tid: number = t.__raw__;
  const slot = typeSlot.get(tid);
  if (!slot && tid !== CHARM_TYPE) continue;
  const shown = display(strings, "Item", name);
  const hidden = hiddenReason(name, shown, d);
  uniques[d.__snoID__] = {
    name, display: shown, slot: slot ?? "charm", item_type: tid,
    classes: classes(d.fUsableByClass), season_item: Boolean(d.bSeasonItem),
    mythic: d.eMagicType === MYTHIC || d.eForcedItemQualityModifier === MYTHIC_COPY,
    ...(hidden ? { hidden } : {}),
  };
}

// Past-season copies: "S<n>_..." with n < CURRENT_SEASON, when an item with the same display name
// (ignoring a suffix such as " (Crucible)") and slot exists that is not a copy itself. Examples:
// S14_Helm_Unique_Generic_002 (Harlequin Crest), S12_1HSword_Unique_Generic_001 (Doombringer (Crucible)).
// Season items with no other copy (e.g. S05_BSK_Helm_Unique_Generic_001, Crown of Lucion) stay shown.
const seasonOf = (name: string) => Number(/^S(\d+)_/.exec(name)?.[1] ?? NaN);
const nameKey = (u: UniqueDef) => `${u.slot}|${(u.display ?? "").replace(/ \([^)]*\)$/, "")}`;
const isCopy = (u: UniqueDef) => seasonOf(u.name) < CURRENT_SEASON;
const firstSeen = new Map<string, number>(); // name key -> lowest season number (base items count as 0)
for (const u of Object.values(uniques)) {
  if (u.hidden) continue;
  const s = Number.isNaN(seasonOf(u.name)) ? 0 : seasonOf(u.name);
  firstSeen.set(nameKey(u), Math.min(firstSeen.get(nameKey(u)) ?? Infinity, s));
}
for (const u of Object.values(uniques)) {
  if (!u.hidden && isCopy(u) && firstSeen.get(nameKey(u))! < seasonOf(u.name)) u.hidden = `Season ${seasonOf(u.name)} copy`;
}

const charmLabels: number[] = itypes.get("Charm")?.arItemLabels ?? [];
const affixes: Record<string, AffixDef> = {};
for (const [name, p] of files(join(meta, "Affix"), ".aff.json")) {
  const d = load(p);
  if (!d.arAllowedItemLabels.length) continue;
  const season = seasonOf(name);
  const rolls = rollable(name, d);
  const hidden = rolls && season > BASE_STAT_SEASON && season < CURRENT_SEASON && (d.dwFlags & RESTRICTED) !== 0
    ? `Season ${season} stat` : undefined;
  affixes[d.__snoID__] = {
    name, label: pretty(name), labels: [...d.arAllowedItemLabels].sort((a: number, b: number) => a - b),
    classes: classes(d.fAllowedForPlayerClass), tempered: Boolean(d.bIsTemperedAffix), magic_type: d.eMagicType,
    rollable: rolls, group: statGroup(d),
    ...(charmStat(name, d, charmLabels) ? { charm_stat: true } : {}),
    ...(hidden ? { hidden } : {}),
  };
}

// Charm sets: Talisman_<Class>_NN; Talisman_Small_Generic* fit every class.
const SET_CLASS: Record<string, string> = {
  Barb: "barbarian", Druid: "druid", Necro: "necromancer", Pala: "paladin", Rogue: "rogue",
  Sorc: "sorcerer", Spirit: "spiritborn", Warlock: "warlock",
};
const talismanSets: Record<string, TalismanSetDef> = {};
for (const [name, p] of files(join(meta, "SetItemBonus"), ".set.json")) {
  if (!name.startsWith("Talisman_")) continue;
  const d = load(p);
  const cls = SET_CLASS[name.split("_")[1]];
  talismanSets[d.__snoID__] = { name, display: display(strings, "SetItemBonus", name), classes: cls ? [cls] : CLASSES };
}

const mappingMeta: MappingMeta = {
  source: "DiabloTools/d4data json (files only)",
  ...(gitCommit(root) ? { source_commit: gitCommit(root) } : {}),
  classes: CLASSES, filter_class_id: FILTER_CLASS_ID, slots, item_types: itemTypes,
  charm_type: CHARM_TYPE, seal_type: SEAL_TYPE,
  charm_labels: [...(itypes.get("Charm")?.arItemLabels ?? [])].sort((a: number, b: number) => a - b),
  talisman_sets: talismanSets,
};
mkdirSync(out, { recursive: true });
writeFileSync(join(out, MAPPING_FILES.meta), JSON.stringify(sortKeys(mappingMeta), null, 2) + "\n");
writeFileSync(join(out, MAPPING_FILES.uniques), perLine(uniques));
writeFileSync(join(out, MAPPING_FILES.affixes), perLine(affixes));
console.log(`slots ${Object.keys(slots).length}  item_types ${Object.keys(itemTypes).length}  uniques ${Object.keys(uniques).length}  affixes ${Object.keys(affixes).length} -> ${out}`);
