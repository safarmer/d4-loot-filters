// Run: npm test (Vitest)
// Slot model: mapping coverage, import -> compile round trip, tier order, valid stats per slot.
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { decode, encode } from "../src/codec.ts";
import { compileModel, defaultModel, validAffixes, validCharmAffixes } from "../src/compiler.ts";
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

test("rogue: round trip loses no rule (RoA Uniques splits per slot)", () => {
  const { diffs } = roundtrip(load("roa_very_strict_rogue"));
  assert.deepEqual(diffs.filter((d) => d.startsWith("lost")), ["lost or changed: Rogue RoA Uniques"]);
  // added: per-slot show rules, and the set-only charm rule its set+stats charm rule lacked
  assert.ok(diffs.filter((d) => d.startsWith("added")).every((d) => d.endsWith(" Uni OK") || d === "added: Charm Set"));
});

test("rules come out in tier order", () => {
  const m = defaultModel("warlock");
  Object.assign(m.slots.boots, { enabled: true, tier: 2, legendaries: true });
  Object.assign(m.slots.helm, { enabled: true, tier: 1, legendaries: true });
  assert.deepEqual(compileModel(m).rules.map((r) => r.name), ["Charms/Seals for Mats", "Helm Leg", "Helm Leg OK", "Boots Leg", "Boots Leg OK", "No Ma'am"]);
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
        if (c.type === 6) for (const i of c.ids ?? []) {
          // set-charm rules (talisman set condition) take charm stats; gear rules take gear stats.
          // The Rogue reference filter still has gear stats in its charm rule (left as is).
          const charm = r.conditions.some((x) => x.type === 9);
          const a = m.affixes[i];
          if (charm && f === "roa_very_strict_rogue") continue;
          assert.ok(charm ? a.charm_stat : a.rollable && !a.hidden, `${f}: ${a.name}`);
        }
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

test("starter and end-game filters from one model", () => {
  const m = defaultModel("warlock", "Warlock");
  m.charms.mats = false;
  Object.assign(m.slots.helm, { enabled: true, uniques: [2647147], desired: [1829592, 1829586, 1829574], ga_wanted: [1829586], n: 2, ga: 1 });
  const starter = compileModel(m, "starter"), endgame = compileModel(m, "endgame");
  assert.equal(starter.name, "Warlock Starter");
  assert.equal(endgame.name, "Warlock");
  assert.deepEqual(starter.rules.map((r) => [r.name, r.vis]), [["Helm Uni", 2], ["Helm Uni OK", 0], ["No Ma'am", 3]]);
  assert.deepEqual(endgame.rules.map((r) => [r.name, r.vis]), [["Helm Uni", 2], ["Helm Uni OK", 0], ["No Ma'am", 3]]);
  const types = (r: { conditions: { type: number | null }[] }) => r.conditions.map((c) => c.type).sort();
  const cond = (r: (typeof starter.rules)[0], t: number) => r.conditions.find((c) => c.type === t);
  // starter: recolour on 2 desired stats only (no GA, no ancestral, no GA-on-stat); show always
  assert.deepEqual(types(starter.rules[0]), [1, 6, 8]);
  assert.equal(cond(starter.rules[0], 6)!.value, 2);
  assert.equal(cond(starter.rules[0], 6)!.ga_required_on, undefined);
  assert.deepEqual(types(starter.rules[1]), [1, 8]);
  // end-game: recolour = ancestral + 2 desired + 1 GA on the starred stat; show = ancestral + 2 desired
  assert.deepEqual(types(endgame.rules[0]), [1, 2, 4, 6, 8]);
  assert.equal(cond(endgame.rules[0], 4)!.value, 1);
  assert.deepEqual(cond(endgame.rules[0], 6)!.ga_required_on, [[1829586, 1829586]]);
  assert.deepEqual(types(endgame.rules[1]), [1, 2, 6, 8]);
  for (const f of [starter, endgame]) encode(f);
  // no GA wanted: the end-game filter only shows
  m.slots.helm.ga = 0;
  assert.deepEqual(compileModel(m).rules.map((r) => r.name), ["Helm Uni OK", "No Ma'am"]);
  // no desired stats: the starter only shows
  m.slots.helm.desired = []; m.slots.helm.ga_wanted = [];
  assert.deepEqual(compileModel(m, "starter").rules.map((r) => r.name), ["Helm Uni OK", "No Ma'am"]);
});

test("charms: set+stats before set, own colours; gear shares one colour", () => {
  const m = defaultModel("warlock", "W");
  Object.assign(m.charms, { enabled: true, tier: 0, sets: [2340371], desired: [2545972, 2545970], n: 1 });
  Object.assign(m.slots.helm, { enabled: true, uniques: [2647147] });
  Object.assign(m.slots.boots, { enabled: true, legendaries: true });
  m.colors = { gear: "0xFF112233", charm_set: "0xFF445566", charm_stats: "0xFF778899" };
  const f = compileModel(m, "starter");
  assert.deepEqual(f.rules.slice(0, 3).map((r) => [r.name, r.color]),
    [["Charm Set+Stats", "0xFF778899"], ["Charm Set", "0xFF445566"], ["Charms/Seals for Mats", "0xFFFF0000"]]);
  assert.deepEqual(f.rules[2].conditions.map((c) => [c.type, c.value ?? c.ids]), [[1, 120], [5, [2288901, 2326144]]]);
  assert.equal(f.rules.at(-1)!.name, "No Ma'am");
  assert.deepEqual(f.rules[0].conditions.map((c) => c.type).sort(), [1, 5, 6, 9]);
  assert.ok(f.rules.filter((r) => r.vis === 2 && !r.name.startsWith("Charm")).every((r) => r.color === "0xFF112233"));
  encode(f);
  // the Warlock filter's set charm rules import as charms
  const { model } = roundtrip(load("strict_warlock_bs"));
  assert.deepEqual(model.charms.sets, [2340371, 2340376]);
  assert.ok(model.charms.mats); // its Charms/Seals for Mats rule
  assert.deepEqual(model.charms.desired, [2545972, 2545970, 2588359]); // Talisman_Charm_ stats
  assert.equal(model.colors.charm_set, "0xFFE89922");
  assert.ok(validCharmAffixes("warlock").includes(2545972)); // Talisman_Charm_SkillRankBonus_Warlock_Category_Hellfire
  assert.ok(!validCharmAffixes("warlock").includes(1829592)); // S04_Life is a gear stat
});

test("unverified class id refuses to compile", () => {
  assert.throws(() => compileModel(defaultModel("druid")), /unverified/);
});
