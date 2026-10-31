// Node-side mapping loader for the tools and tests.
import { readFileSync } from "fs";
import { join } from "path";
import { setMapping, type Mapping } from "../src/mapping.ts";

export const MAPPING_PATH = join(import.meta.dirname, "..", "data", "mapping.json");

export function loadMapping(path = MAPPING_PATH): Mapping {
  const m = JSON.parse(readFileSync(path, "utf8")) as Mapping;
  setMapping(m);
  return m;
}
