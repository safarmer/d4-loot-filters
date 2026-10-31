// Node-side mapping loader for the tools and tests.
import { readFileSync } from "fs";
import { join } from "path";
import { assembleMapping, MAPPING_FILES, setMapping, type Mapping } from "../src/mapping.ts";

export const DATA_DIR = join(import.meta.dirname, "..", "data");

export function loadMapping(dir = DATA_DIR): Mapping {
  const read = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8"));
  const m = assembleMapping(read(MAPPING_FILES.meta), read(MAPPING_FILES.uniques), read(MAPPING_FILES.affixes));
  setMapping(m);
  return m;
}
