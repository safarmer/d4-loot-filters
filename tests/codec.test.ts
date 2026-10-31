// Run: npm test
// Golden check: the working filters' .json encodes to their in-game .txt byte for byte.
// Those .txt files were written by the original filter_tool.py and import in game.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { decode, encode, toJson } from "../src/codec";

const LF = join(__dirname, "..", "..", "Loot Filters");
const read = (f: string) => readFileSync(join(LF, f), "utf8");

for (const f of ["strict_warlock_bs", "roa_very_strict_rogue"]) {
  test(`${f}: encode matches the in-game string`, () => {
    assert.equal(encode(JSON.parse(read(f + ".json"))), read(f + ".txt").trim());
  });
  test(`${f}: decode matches the JSON file`, () => {
    assert.equal(toJson(decode(read(f + ".txt"))), read(f + ".json").trimEnd());
  });
}

test("rejects bad base64 and truncated data", () => {
  assert.throws(() => decode("abc"), /base64/);
  assert.throws(() => decode(read("strict_warlock_bs.txt").slice(0, 100)), /premature EOF at byte/);
});

test("rejects JSON the format cannot hold", () => {
  const doc = JSON.parse(read("strict_warlock_bs.json"));
  doc.rules[0].conditions[0].value = 1.5;
  assert.throws(() => encode(doc), /not an integer/);
  doc.rules[0].conditions[0].value = 32;
  doc.rules[0].conditions[0].bogus = 1;
  assert.throws(() => encode(doc), /round-trip/);
});
