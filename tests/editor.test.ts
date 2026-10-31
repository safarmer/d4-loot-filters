// Run: npm test (Vitest)
// Slot model: mapping coverage, import -> compile round trip, tier order, valid stats per slot.
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { decode, encode } from "../src/codec.ts";
import { checkLimits, classUniqueCharms, compileModel, defaultModel, MAX_RULES, MAX_UNIQUES, validAffixes, validCharmAffixes } from "../src/compiler.ts";
import { roundtrip } from "../src/importer.ts";
import { mapping, STAT_GROUPS } from "../src/mapping.ts";
import { loadMapping } from "../tools/node_mapping.ts";

loadMapping();

const LF = join(import.meta.dirname, "..", "..", "Loot Filters");
const load = (f: string) => decode(readFileSync(join(LF, f + ".txt"), "utf8"));
// the Warlock filter before it was rebuilt by the editor (2026-10-31): the import-cleanup cases
const loadOld = () => decode(readFileSync(join(import.meta.dirname, "fixtures", "strict_warlock_bs_2026-10-31.txt"), "utf8"));
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

test("warlock: every changed rule is explained by an import note", () => {
  const { diffs, warnings, model } = roundtrip(load("strict_warlock_bs"));
  for (const d of diffs.filter((x) => x.startsWith("lost"))) {
    const name = d.replace("lost or changed: ", "");
    // modelled rules are rebuilt by the editor (split, merged, show level added); others need a note
    const keptAsIs = model.raw.some((r) => r.rule.name === name);
    assert.ok(!keptAsIs || warnings.some((w) => w.startsWith(name + ":")), d);
    assert.ok(keptAsIs || warnings.some((w) => w.startsWith(name + ":")) || !diffs.includes(`added: ${name}`), d);
  }
});

test("rogue: every changed rule is explained by an import note", () => {
  const { diffs, warnings, model } = roundtrip(load("roa_very_strict_rogue"));
  for (const d of diffs.filter((x) => x.startsWith("lost"))) {
    const name = d.replace("lost or changed: ", "");
    // modelled rules are rebuilt by the editor (split, merged, show level added); others need a note
    const keptAsIs = model.raw.some((r) => r.rule.name === name);
    assert.ok(!keptAsIs || warnings.some((w) => w.startsWith(name + ":")), d);
    assert.ok(keptAsIs || warnings.some((w) => w.startsWith(name + ":")) || !diffs.includes(`added: ${name}`), d);
  }
});

test("import cleanup: bad charm rules, gear rarity, gear colour", () => {
  const { model, warnings } = roundtrip(loadOld());
  // All Unique Charms dropped; Build Unique Charms loses the gear amulet and becomes the picked list
  assert.ok(warnings.some((w) => w.startsWith("All Unique Charms: dropped")));
  assert.equal(model.charms.uniques.length, 10);
  assert.ok(!model.charms.uniques.includes(1719158));
  // Boots Good GA Leg: rarity 14 -> 8, royal blue -> the shared gear colour, modelled as boots legendaries
  assert.ok(model.slots.boots.enabled && model.slots.boots.legendaries && model.slots.boots.leg_rarity === 8);
  assert.equal(model.colors.gear, "0xFFFFE000");
  assert.ok(!model.raw.some((r) => /Unique Charms|Boots Good GA Leg|Codex/.test(r.rule.name)));
});

test("fixed order: kept-as-is first, charms, slots (recolour before show), kept-as-is last", () => {
  const m = defaultModel("warlock");
  Object.assign(m.slots.boots, { enabled: true, legendaries: true });
  Object.assign(m.slots.helm, { enabled: true, legendaries: true });
  const raw = (name: string) => ({ name, vis: 0, color: "0xFFFFFFFF", enabled: 1, conditions: [{ type: 1, kind: "rarity", value: 32 }] });
  m.raw = [{ place: "last", rule: raw("After") }, { place: "first", rule: raw("Before") }];
  assert.deepEqual(compileModel(m).rules.map((r) => r.name),
    ["Codex Upgrades", "Before", "Charms/Seals for Mats", "Boots/Helm Leg", "Boots/Helm Leg OK", "After", "Any 2GA+ Ancestral", "Mythics", "No Ma'am"]);
  // the Warlock filter keeps its own order apart from the per-slot split
  const { diffs } = roundtrip(load("strict_warlock_bs"));
  assert.ok(!diffs.includes("same rules, different order") || diffs.some((d) => d.startsWith("added")));
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
          const types = r.conditions.find((x) => x.type === 5)?.ids ?? [];
          const charm = r.conditions.some((x) => x.type === 9) || (types.length > 0 && types.every((t) => t === 2288901 || t === 2326144));
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
  assert.deepEqual(starter.rules.map((r) => [r.name, r.vis]), [["Codex Upgrades", 2], ["Helm Uni", 2], ["Helm Uni OK", 0], ["All Ancestral", 0], ["Mythics", 0], ["No Ma'am", 3]]);
  assert.deepEqual(endgame.rules.map((r) => [r.name, r.vis]), [["Codex Upgrades", 2], ["Helm Uni", 2], ["Helm Uni OK", 0], ["Any 2GA+ Ancestral", 0], ["Mythics", 0], ["No Ma'am", 3]]);
  const types = (r: { conditions: { type: number | null }[] }) => r.conditions.map((c) => c.type).sort();
  const cond = (r: (typeof starter.rules)[0], t: number) => r.conditions.find((c) => c.type === t);
  const rule = (f: typeof starter, name: string) => f.rules.find((r) => r.name === name)!;
  // starter: recolour on 2 desired stats only (no GA, no ancestral, no GA-on-stat); show always
  assert.deepEqual(types(rule(starter, "Helm Uni")), [1, 6, 8]);
  assert.equal(cond(rule(starter, "Helm Uni"), 6)!.value, 2);
  assert.equal(cond(rule(starter, "Helm Uni"), 6)!.ga_required_on, undefined);
  assert.deepEqual(types(rule(starter, "Helm Uni OK")), [1, 8]);
  // end-game: recolour = ancestral + 2 desired + 1 GA on the starred stat; show = ancestral + 2 desired
  assert.deepEqual(types(rule(endgame, "Helm Uni")), [1, 2, 4, 6, 8]);
  assert.equal(cond(rule(endgame, "Helm Uni"), 4)!.value, 1);
  assert.deepEqual(cond(rule(endgame, "Helm Uni"), 6)!.ga_required_on, [[1829586, 1829586]]);
  assert.deepEqual(types(rule(endgame, "Helm Uni OK")), [1, 2, 6, 8]);
  for (const f of [starter, endgame]) encode(f);
  // no GA wanted: the end-game filter only shows
  m.slots.helm.ga = 0;
  assert.deepEqual(compileModel(m).rules.map((r) => r.name), ["Codex Upgrades", "Helm Uni OK", "Any 2GA+ Ancestral", "Mythics", "No Ma'am"]);
  // no desired stats: the starter only shows
  m.slots.helm.desired = []; m.slots.helm.ga_wanted = [];
  assert.deepEqual(compileModel(m, "starter").rules.map((r) => r.name), ["Codex Upgrades", "Helm Uni OK", "All Ancestral", "Mythics", "No Ma'am"]);
});

test("mythics: shown last, after the unique recolours that also match them", () => {
  const m = defaultModel("warlock");
  Object.assign(m.slots.helm, { enabled: true, uniques: [609820] }); // Harlequin Crest (mythic)
  const names = compileModel(m).rules.map((r) => r.name);
  assert.ok(names.indexOf("Helm Uni") < names.indexOf("Mythics"));
  assert.deepEqual(names.slice(-2), ["Mythics", "No Ma'am"]);
  // the Warlock filter's first-rule Mythics becomes the setting, moved last
  const { model } = roundtrip(load("strict_warlock_bs"));
  assert.ok(!model.raw.some((r) => r.rule.name === "Mythics"));
  assert.deepEqual(compileModel(model).rules.slice(-2).map((r) => r.name), ["Mythics", "No Ma'am"]);
});

test("merging: only where it cannot change matches; uniques in rules of at most 10", () => {
  const m = defaultModel("warlock");
  // same stats on helm and pants (both can roll Life and Armor): merged
  Object.assign(m.slots.helm, { enabled: true, uniques: [2647147], desired: [1829592, 1829554], n: 1, ga: 1 });
  Object.assign(m.slots.pants, { enabled: true, uniques: [1306326], desired: [1829592, 1829554], n: 1, ga: 1 });
  // boots wants only Life: adding Armor (rollable on boots) would change its matches, so not merged
  Object.assign(m.slots.boots, { enabled: true, uniques: [2549170], desired: [1829592], n: 1, ga: 1 });
  const names = compileModel(m).rules.map((r) => r.name);
  assert.ok(names.includes("Helm/Pants Uni") && names.includes("Boots Uni"), names.join(" | "));
  // starter show-always rules merge across slots, at most 10 uniques each
  const many = Object.entries(mapping().uniques).filter(([, u]) => u.slot === "ring" && !u.hidden && u.classes.includes("warlock")).map(([i]) => +i);
  Object.assign(m.slots.ring, { enabled: true, uniques: many.slice(0, 12) });
  const starter = compileModel(m, "starter");
  const show = starter.rules.filter((r) => r.name.endsWith(" OK"));
  assert.ok(show.every((r) => r.conditions.find((c) => c.type === 8)!.ids!.length <= MAX_UNIQUES));
  assert.equal(show.flatMap((r) => r.conditions.find((c) => c.type === 8)!.ids!).length, 15);
  assert.deepEqual(checkLimits(starter), []);
  for (const f of [starter, compileModel(m)]) encode(f);
});

test("limits: more than 25 rules or 10 uniques in a rule are reported", () => {
  const f = { name: "X", class_id: 6, slot_idx: 1, rules: Array.from({ length: 26 }, (_, i) => (
    { name: `R${i}`, vis: 0, color: "0xFFFFFFFF", enabled: 1, conditions: [{ type: 8, kind: "uniques", ids: i ? [1] : Array(11).fill(1) }] })) };
  assert.deepEqual(checkLimits(f), ["X: 26 rules, limit 25", "R0: 11 uniques in one rule, limit 10"]);
  // the owner's working filter fits (the Rogue reference filter does not: 27 rules once modelled)
  for (const name of ["strict_warlock_bs"])
    for (const p of ["starter", "endgame"] as const)
      assert.ok(compileModel(roundtrip(load(name)).model, p).rules.length <= MAX_RULES, `${name} ${p}`);
});

test("charms: uniques and sets share stats; +Stats and plain per group; no GA rules", () => {
  const m = defaultModel("warlock", "W");
  const uniques = classUniqueCharms("warlock").slice(0, 2);
  Object.assign(m.charms, { enabled: true, uniques, sets: [2340371], desired: [2545972, 2545970], n: 1 });
  Object.assign(m.slots.helm, { enabled: true, uniques: [2647147] });
  m.colors = { ...m.colors, gear: "0xFF112233" };
  const f = compileModel(m, "starter");
  assert.deepEqual(f.rules.slice(1, 6).map((r) => [r.name, r.color]), [
    ["Unique Charms+Stats", "0xFFD3E822"], ["Unique Charms", "0xFF4E8A20"],
    ["Charm Set+Stats", "0xFFD3E822"], ["Charm Set", "0xFFE89922"], ["Charms/Seals for Mats", "0xFFFF0000"]]);
  assert.ok(!f.rules.some((r) => r.name.endsWith("+GA")));
  const stats = f.rules[3].conditions;
  assert.deepEqual(stats.map((c) => c.type).sort(), [1, 5, 6, 9]);
  assert.equal(stats.find((c) => c.type === 6)!.ga_required_on, undefined);
  assert.ok(f.rules.filter((r) => r.vis === 2 && !/Charm|Codex/.test(r.name)).every((r) => r.color === "0xFF112233"));
  encode(f);
  // a compiled filter imports back into the same charm settings
  const back = roundtrip(compileModel(m)).model.charms;
  assert.deepEqual([back.uniques, back.sets, back.desired, back.n, back.mats],
    [uniques, [2340371], [2545972, 2545970], 1, true]);
  // the Warlock filter: the GA Needed Set Charms rule is dropped with a note; the rest imports
  const { model, warnings } = roundtrip(loadOld());
  assert.ok(warnings.some((w) => w.startsWith("GA Needed Set Charms: dropped")));
  assert.deepEqual([model.charms.sets, model.charms.n], [[2340371, 2340376], 1]);
  assert.deepEqual(model.charms.desired, [2545972, 2545970, 2588359]); // Talisman_Charm_ stats
  assert.ok(model.charms.mats && model.charms.uniques.length === 10); // Build Unique Charms, gear amulet removed
  assert.ok(validCharmAffixes("warlock").includes(2545972));
  assert.ok(!validCharmAffixes("warlock").includes(1829592)); // S04_Life is a gear stat
});
test("unique power text shows value ranges in brackets", () => {
  const u = mapping().uniques;
  assert.match(u[2549162].power!, /deals \[80% - 100%\] increased damage/); // Nails of the Gore-Crowned
  assert.match(u[2549170].power!, /reduced by \[0\.6 - 1\] seconds/); // Footfalls of the Waning World
  assert.match(u[609820].power!, /Gain \+6 Rank/); // Harlequin Crest: a fixed value, no brackets
  assert.ok(!Object.values(u).some((x) => /\[-|NaN/.test(x.power ?? "")));
});

test("import maps stat IDs to the variants that can roll on the rule's items", () => {
  const m = mapping();
  const { model, warnings } = roundtrip(load("strict_warlock_bs"));
  // amulet rolls the _Greater core stat and life; the plain IDs stay (unique fixed stats unverified)
  for (const name of ["X2_CoreStat_Willpower_Greater", "X2_Life_Greater", "S04_CoreStat_Willpower"])
    assert.ok(model.slots.amulet.desired.some((i) => m.affixes[i].name === name), name);
  assert.ok(warnings.some((w) => /Amulet\/Ring Uni: stats mapped/.test(w)));
  // a charm rule's gear stat becomes the charm stat (Rogue reference filter)
  const rogue = roundtrip(load("roa_very_strict_rogue")).model.charms;
  assert.ok(rogue.desired.some((i) => m.affixes[i].name === "Talisman_Charm_SkillRankBonus_Rogue_Category_Marksman"));
  assert.ok(!rogue.desired.some((i) => m.affixes[i].name === "X2_SkillRankBonus_Rogue_Category_Marksman"));
  // re-importing the export maps nothing more
  const again = roundtrip(compileModel(model));
  assert.ok(!again.warnings.some((w) => /stats mapped/.test(w)), again.warnings.join("; "));
});

test("unverified class id refuses to compile", () => {
  assert.throws(() => compileModel(defaultModel("druid")), /unverified/);
});
