// The mapping: d4data SNO IDs -> names, slots, classes. Built by tools/build_mapping.ts into data/:
//   meta.json      classes, slots, item types, class ids (small, hand-readable)
//   uniques.json   unique items, one per line
//   affixes.json   affixes, one per line
// Browser-safe: the caller loads the files (fetch, import or fs) and passes them to assembleMapping().

export interface SlotDef { label: string; item_types: number[]; labels: number[] }
export interface ItemTypeDef { name: string; slot: string | null; classes: string[] }
export interface UniqueDef {
  name: string; display: string | null; slot: string; item_type: number;
  classes: string[]; season_item: boolean; mythic: boolean;
  /** Why pickers hide this item (placeholder, past-season copy). Absent = shown. */
  hidden?: string;
}
export interface AffixDef {
  name: string; label: string; labels: number[]; classes: string[];
  tempered: boolean; magic_type: number;
  /** Can roll as a random stat on gear (see tools/build_mapping.ts). */
  rollable: boolean;
}
export interface Mapping {
  source: string;
  /** d4data git commit the mapping was built from, when known. */
  source_commit?: string;
  classes: string[];
  filter_class_id: Record<string, number>;
  slots: Record<string, SlotDef>;
  item_types: Record<string, ItemTypeDef>;
  uniques: Record<string, UniqueDef>;
  affixes: Record<string, AffixDef>;
  charm_type: number;
  seal_type: number;
}

export type MappingMeta = Omit<Mapping, "uniques" | "affixes">;
export const MAPPING_FILES = { meta: "meta.json", uniques: "uniques.json", affixes: "affixes.json" } as const;

export function assembleMapping(meta: MappingMeta, uniques: Mapping["uniques"], affixes: Mapping["affixes"]): Mapping {
  return { ...meta, uniques, affixes };
}

let current: Mapping | null = null;

export function setMapping(m: Mapping): void {
  current = m;
}

export function mapping(): Mapping {
  if (!current) throw new Error("mapping not loaded: call setMapping() first");
  return current;
}
