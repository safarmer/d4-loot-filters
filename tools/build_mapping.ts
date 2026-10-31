// Build data/mapping.json from a d4data checkout (files only).
//
// Usage: npm run build-mapping -- <d4data/json dir> [out.json]
//
// Reads, from <json dir>:
//   base/meta/ItemType/*.itt.json   slot -> item type id, item labels
//   base/meta/Item/*.itm.json       unique items (type, class, forced affixes)
//   base/meta/Affix/*.aff.json      affix labels (which slots it can roll on), classes
//   enUS_Text/meta/StringList/      display names
// Source: https://github.com/DiabloTools/d4data (extracted game files). Never game memory or network.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { AffixDef, ItemTypeDef, Mapping, SlotDef, UniqueDef } from "../src/mapping.ts";
import { MAPPING_PATH } from "./node_mapping.ts";

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
const NOT_REAL = /^(test|unique)_/i; // test and unique-only affixes that still carry the roll bit

/** A random stat that can roll on gear: not a legendary power, tempered affix, unique-only or old copy. */
function rollable(name: string, d: any): boolean {
  return (d.dwFlags & ROLLS) !== 0 && (d.dwFlags & SUPERSEDED) === 0 && d.eMagicType === 0
    && !d.bIsTemperedAffix && !NOT_REAL.test(name);
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

const [root, out = MAPPING_PATH] = process.argv.slice(2);
if (!root) {
  console.error("usage: npm run build-mapping -- <d4data/json dir> [out.json]");
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
  uniques[d.__snoID__] = {
    name, display: display(strings, "Item", name), slot: slot ?? "charm", item_type: tid,
    classes: classes(d.fUsableByClass), season_item: Boolean(d.bSeasonItem),
    mythic: d.eMagicType === 5 || name.includes("Mythic"),
  };
}

const affixes: Record<string, AffixDef> = {};
for (const [name, p] of files(join(meta, "Affix"), ".aff.json")) {
  const d = load(p);
  if (!d.arAllowedItemLabels.length) continue;
  affixes[d.__snoID__] = {
    name, label: pretty(name), labels: [...d.arAllowedItemLabels].sort((a: number, b: number) => a - b),
    classes: classes(d.fAllowedForPlayerClass), tempered: Boolean(d.bIsTemperedAffix), magic_type: d.eMagicType,
    rollable: rollable(name, d),
  };
}

const result: Mapping = {
  source: "DiabloTools/d4data json (files only)",
  classes: CLASSES, filter_class_id: FILTER_CLASS_ID, slots, item_types: itemTypes, uniques, affixes,
  charm_type: CHARM_TYPE, seal_type: SEAL_TYPE,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(sortKeys(result)));
console.log(`slots ${Object.keys(slots).length}  item_types ${Object.keys(itemTypes).length}  uniques ${Object.keys(uniques).length}  affixes ${Object.keys(affixes).length} -> ${out}`);
