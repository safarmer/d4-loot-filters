// data/mapping.json: d4data SNO IDs -> names, slots, classes. Built by tools/build_mapping.ts.
import { readFileSync } from "fs";
import { join } from "path";

export interface SlotDef { label: string; item_types: number[]; labels: number[] }
export interface ItemTypeDef { name: string; slot: string | null; classes: string[] }
export interface UniqueDef {
  name: string; display: string | null; slot: string; item_type: number;
  classes: string[]; season_item: boolean; mythic: boolean;
}
export interface AffixDef {
  name: string; label: string; labels: number[]; classes: string[];
  tempered: boolean; magic_type: number;
}
export interface Mapping {
  source: string;
  classes: string[];
  filter_class_id: Record<string, number>;
  slots: Record<string, SlotDef>;
  item_types: Record<string, ItemTypeDef>;
  uniques: Record<string, UniqueDef>;
  affixes: Record<string, AffixDef>;
  charm_type: number;
  seal_type: number;
}

export const MAPPING_PATH = join(import.meta.dirname, "..", "data", "mapping.json");

let cached: Mapping | null = null;
export function mapping(): Mapping {
  cached ??= JSON.parse(readFileSync(MAPPING_PATH, "utf8")) as Mapping;
  return cached;
}
