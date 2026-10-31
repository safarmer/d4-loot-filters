// data/mapping.json: d4data SNO IDs -> names, slots, classes. Built by tools/build_mapping.ts.
// Browser-safe: the caller loads the JSON (fetch, import or fs) and passes it to setMapping().

export interface SlotDef { label: string; item_types: number[]; labels: number[] }
export interface ItemTypeDef { name: string; slot: string | null; classes: string[] }
export interface UniqueDef {
  name: string; display: string | null; slot: string; item_type: number;
  classes: string[]; season_item: boolean; mythic: boolean;
}
export interface AffixDef {
  name: string; label: string; labels: number[]; classes: string[];
  tempered: boolean; magic_type: number;
  /** Can roll as a random stat on gear (see tools/build_mapping.ts). */
  rollable: boolean;
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

let current: Mapping | null = null;

export function setMapping(m: Mapping): void {
  current = m;
}

export function mapping(): Mapping {
  if (!current) throw new Error("mapping not loaded: call setMapping() first");
  return current;
}
