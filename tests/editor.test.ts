// Run: npm test (Vitest)
// Slot model: mapping coverage, import -> compile round trip, tier order, valid stats per slot.
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { decode, encode } from "../src/codec.ts";
import { compileModel, defaultModel, validAffixes } from "../src/compiler.ts";
import { roundtrip } from "../src/importer.ts";
import { mapping, STAT_GROUPS } from "../src/mapping.ts";
import { loadMapping } from "../tools/node_mapping.ts";

loadMapping();

const LF = join(import.meta.dirname, "..", "..", "Loot Filters");
const load = (f: string) => decode(readFileSync(join(LF, f + ".txt"), "utf8"));
const FILTERS = ["strict_warlock_bs", "roa_very_strict_rogue"];

test("every filter id resolves in the mapping", () => {
  const m = mapping();
  const pools: Record<number, object> = { 5: m.item_types, 6: m.affixes, 8: m.uniques };
  for (const f of FILTERS)
    for (const r of load(f).rules)
      for (const c of r.conditions)
        for (const i of c.ids ?? [])
          if (pools[c.type as number]) assert.ok(String(i) in pools[c.type as number], `${f}: ${i}`);
});

test("import then compile encodes, No Ma'am last", () => {
  for (const f of FILTERS) {
    const out = compileModel(roundtrip(load(f)).model);
    assert.equal(out.rules.at(-1)!.name, "No Ma'am");
    encode(out);
  }
});

test("warlock: only the rules split per slot differ", () => {
  const { diffs } = roundtrip(load("strict_warlock_bs"));
  assert.deepEqual(new Set(diffs.filter((d) => d.startsWith("lost"))),
    new Set(["lost or changed: Weapon Good GA Uni", "lost or changed: Jewelry Good GA Uni"]));
});

test("rogue: round trip keeps every rule", () => {
  assert.deepEqual(roundtrip(load("roa_very_strict_rogue")).diffs, []);
});

test("rules come out in tier order", () => {
  const m = defaultModel("warlock");
  Object.assign(m.slots.boots, { enabled: true, tier: 2, legendaries: true });
  Object.assign(m.slots.helm, { enabled: true, tier: 1, legendaries: true });
  assert.deepEqual(compileModel(m).rules.map((r) => r.name), ["Helm Leg", "Boots Leg", "No Ma'am"]);
});

test("valid stats depend on the slot", () => {
  const helm = new Set(validAffixes("helm", "warlock")), boots = new Set(validAffixes("boots", "warlock"));
  assert.ok([...helm].some((a) => !boots.has(a)) && [...boots].some((a) => !helm.has(a)));
  assert.ok(helm.has(1829592)); // S04_Life, from the working filter
});

test("stat lists hold only rollable affixes, including every affix the working filters use", () => {
  const m = mapping();
  for (const f of FILTERS)
    for (const r of load(f).rules)
      for (const c of r.conditions)
        if (c.type === 6) for (const i of c.ids ?? [])
          assert.ok(m.affixes[i].rollable && !m.affixes[i].hidden, `${f}: ${m.affixes[i].name}`);
  const names = validAffixes("boots", "warlock").map((i) => m.affixes[i].name);
  assert.ok(names.includes("S04_Movement_Speed"));
  for (const bad of ["Movement_Speed", "Resistance_Single_Fire"]) assert.ok(!names.includes(bad), bad);
  assert.ok(!names.some((n) => /^(UNIQUE|TEST|Runeword|RuneWord|X2_Transfiguration|S12_KillStreak)/i.test(n)), "junk affix in list");
  assert.ok(names.includes("S11_LifeOnKill_Warlock")); // S11 stats are current (Warlock-era copies)
  assert.ok(validAffixes("amulet", "warlock").map((i) => m.affixes[i].name).includes("S04_CoreStats_All"));
});

test("unique pickers hold only current items, including every unique the working filters use", () => {
  const m = mapping();
  for (const f of FILTERS)
    for (const r of load(f).rules)
      for (const c of r.conditions)
        if (c.type === 8) for (const i of c.ids ?? []) assert.equal(m.uniques[i].hidden, undefined, `${f}: ${m.uniques[i].name}`);
  const shown = Object.values(m.uniques).filter((u) => !u.hidden && u.slot !== "charm");
  const names = new Set<string>();
  for (const u of shown) {
    const key = `${u.slot}|${u.display}`;
    assert.ok(!names.has(key), `duplicate shown: ${key}`);
    names.add(key);
    assert.ok(!/^S(10|12|14)_/.test(u.name) && !u.display?.startsWith("["), u.name);
  }
  assert.ok(m.uniques[2647147].hidden === undefined); // Leoric's Crown
  assert.equal(m.uniques[2646291].hidden, "Season 14 copy"); // S14 Harlequin Crest
  assert.ok(m.uniques[609820].mythic); // Harlequin Crest
});

test("every shown stat has a known group", () => {
  const m = mapping();
  for (const slot of Object.keys(m.slots))
    for (const id of validAffixes(slot, "warlock")) {
      const g = m.affixes[id].group;
      assert.ok(STAT_GROUPS.includes(g) && g !== "Other", `${slot}: ${m.affixes[id].name} -> ${g}`);
    }
  assert.equal(m.affixes[1829598].group, "Mobility"); // S04_Movement_Speed
  assert.equal(m.affixes[2534726].group, "Skill ranks"); // X2_SkillRankBonus_Warlock_Core_BlazingScream
  assert.equal(m.affixes[1829614].group, "Resistances"); // S04_Resistance_Single_Fire
});

test("unverified class id refuses to compile", () => {
  assert.throws(() => compileModel(defaultModel("druid")), /unverified/);
});
