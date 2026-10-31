// Filter JSON -> slot model, with warnings for anything that does not fit. An imported filter is read
// as an end-game filter: an ancestral recolour rule with a greater affix count sets the slot's desired
// stats, n and ga; an ancestral show rule without one sets desired stats and n. The end-game compile
// also adds the show rule an imported recolour-only slot lacks; `roundtrip` reports those as added.
//
// Rules that do not fit stay in the model verbatim as raw rules, before or after the modelled rules
// (as imported), so compile(import(x)) keeps their behaviour. `roundtrip` compares the two
// filters rule by rule.
import { deepEqual, type Condition, type Filter, type Rule } from "./codec.ts";
import { compileModel, defaultModel, MATS_MASK, MYTHIC_MASK, SET_MASK, UNIQUE_MASK, type Model } from "./compiler.ts";
import { mapping, type Mapping } from "./mapping.ts";

const SLOT_TYPES = new Set([1, 2, 4, 5, 6, 8]);
// What a rule's affix conditions say: the stat lists and n (desired stats needed).
interface Probe { required: number[]; desired: number[]; ga_wanted: number[]; n: number | null }

function classFromId(classId: number | null): string | null {
  for (const [c, i] of Object.entries(mapping().filter_class_id)) if (i === classId) return c;
  return null;
}

function affixParts(conds: Condition[], s: Probe, warn: string[], rname: string): boolean {
  const t6 = conds.filter((c) => c.type === 6);
  if (t6.length > 2) return false;
  for (const c of t6) {
    const pairs = c.ga_required_on ?? [];
    if (pairs.some(([a, b]) => a !== b)) {
      warn.push(`${rname}: GA pair with different ids, kept raw`);
      return false;
    }
    const ids = c.ids ?? [];
    if (t6.length === 2 && !pairs.length && c.value === ids.length && !s.required.length) {
      s.required = [...ids];
    } else {
      if (s.desired.length) return false;
      s.desired = [...ids];
      s.n = c.value ?? 0;
      s.ga_wanted = pairs.map(([a]) => a);
    }
  }
  return true;
}

function byType(conds: Condition[]): Map<number, Condition> {
  return new Map(conds.map((c) => [c.type as number, c]));
}

/** The materials rule: show legendary-or-better charms and seals. */
function isMatsRule(rule: Rule, m: Mapping): boolean {
  const by = byType(rule.conditions);
  return !!rule.enabled && rule.vis === 0 && rule.conditions.length === 2 && by.get(1)?.value === MATS_MASK
    && deepEqual([...(by.get(5)?.ids ?? [])].sort(), [m.charm_type, m.seal_type].sort());
}

/** Set-charm recolour rule: "set" (sets only) or "stats" (sets + an affix condition), else null. */
function classifyCharm(rule: Rule, m: Mapping): "set" | "stats" | null {
  const types = rule.conditions.map((c) => c.type as number);
  if (!rule.enabled || rule.vis !== 2 || types.some((t) => ![1, 5, 6, 9].includes(t))) return null;
  if ([1, 5, 6, 9].some((t) => types.filter((x) => x === t).length > 1)) return null;
  const by = byType(rule.conditions);
  if (by.get(1)?.value !== SET_MASK || !by.has(9) || !deepEqual(by.get(5)?.ids, [m.charm_type])) return null;
  return by.has(6) ? "stats" : "set";
}

/** Returns [kind, slot keys] or null. */
function classify(rule: Rule, m: Mapping): ["uni" | "leg", string[]] | null {
  const conds = rule.conditions;
  const types = conds.map((c) => c.type as number);
  if (!conds.length || types.some((t) => !SLOT_TYPES.has(t)) || !rule.enabled || rule.vis === 3) return null;
  if ([1, 2, 4, 5, 8].some((t) => types.filter((x) => x === t).length > 1)) return null;
  const by = byType(conds);
  if (by.has(8) && !by.has(5)) {
    const slots = new Set((by.get(8)!.ids ?? []).map((i) => m.uniques[String(i)]?.slot));
    if (slots.has(undefined as any) || slots.has("charm")) return null;
    if (by.has(1) && (by.get(1)!.value ?? 0) & ~UNIQUE_MASK) return null;
    return ["uni", [...slots].sort()];
  }
  if (by.has(5) && !by.has(8) && by.has(1) && (by.get(1)!.value ?? 0) & 8) {
    const slots = new Set((by.get(5)!.ids ?? []).map((i) => m.item_types[String(i)]?.slot ?? undefined));
    if (slots.has(undefined) || slots.size !== 1) return null;
    return ["leg", [...slots].sort() as string[]];
  }
  return null;
}

export function importFilter(doc: Filter): { model: Model; warnings: string[] } {
  const m = mapping();
  const warnings: string[] = [];
  let cls = classFromId(doc.class_id);
  if (cls === null) {
    warnings.push(`class_id ${doc.class_id} is unverified; defaulting to warlock`);
    cls = "warlock";
  }
  const model = defaultModel(cls, doc.name || "Imported");
  model.slot_idx = doc.slot_idx ?? 1;
  const pairs = new Map<string, Set<string>>(); // slot -> imported "kind/vis" pairs
  let modelled = false; // a modelled rule seen: later kept-as-is rules go after the modelled ones
  const moved: string[] = []; // kept-as-is rules that sat between modelled rules
  const last = doc.rules.at(-1);
  const endsHidden = !!last && last.vis === 3 && !last.conditions.length;

  model.charms.mats = false; // set again only if the filter has the materials rule
  let gearColor = false;                // model.colors.gear taken from an imported rule
  const charmKinds = new Set<string>();  // charm rules already modelled

  doc.rules.forEach((rule, idx) => {
    if (idx === doc.rules.length - 1 && endsHidden) return; // No Ma'am: compiler appends it
    const keepRaw = (why: string | null) => {
      if (why) warnings.push(`${rule.name}: ${why}, kept as raw rule`);
      model.raw.push({ place: modelled ? "last" : "first", rule });
      if (modelled) moved.push(rule.name);
    };

    // the catch-all ancestral rules: the compiler always adds its own (on in starter, off in end-game)
    const types = rule.conditions.map((c) => `${c.type}:${c.value ?? ""}`).sort().join(",");
    if (rule.vis === 0 && (types === "2:4" || types === "2:4,4:2")) return;

    // a plain "show mythics" rule: the compiler always adds one (last, before No Ma'am)
    if (rule.vis === 0 && rule.conditions.length === 1 && rule.conditions[0].type === 1
      && rule.conditions[0].value === MYTHIC_MASK) return;

    if (isMatsRule(rule, m)) {
      if (model.charms.mats) return keepRaw("materials rule already modelled");
      model.charms.mats = true;
      modelled = true;
      return;
    }

    const charm = classifyCharm(rule, m);
    if (charm) {
      const by = byType(rule.conditions);
      const c = model.charms, sets = by.get(9)!.ids ?? [];
      const colorKey = charm === "set" ? "charm_set" : "charm_stats";
      if (charmKinds.has(charm)) return keepRaw("charms already have this rule");
      if (c.enabled && !deepEqual(c.sets, sets)) return keepRaw("sets differ from the other charm rule");
      if ((by.get(6)?.ga_required_on ?? []).length) return keepRaw("charm GA-on-stat is not modelled");
      if (model.charms.mats) return keepRaw("charm rule after the materials rule");
      if (!c.enabled) Object.assign(c, { enabled: true, sets: [...sets] });
      modelled = true;
      if (charm === "stats") { c.desired = [...(by.get(6)!.ids ?? [])]; c.n = by.get(6)!.value ?? 1; }
      model.colors[colorKey] = rule.color;
      charmKinds.add(charm);
      return;
    }

    const cl = classify(rule, m);
    if (cl === null) return keepRaw(null);
    const [kind, slots] = cl;
    const by = byType(rule.conditions);
    const probe: Probe = { required: [], desired: [], ga_wanted: [], n: null };
    const ga = by.get(4)?.value ?? 0;
    const recolour = rule.vis === 2;
    if (!affixParts(rule.conditions, probe, warnings, rule.name)) return keepRaw("affix layout does not fit");
    if (rule.vis !== 0 && rule.vis !== 2) return keepRaw(`mode ${rule.vis} is neither show nor recolour`);
    if (!by.has(2) || by.get(2)!.value !== 4) return keepRaw("end-game rules are ancestral only");
    if (recolour && !ga) return keepRaw("recolour without a greater affix count");
    if (!recolour && (ga || probe.ga_wanted.length)) return keepRaw("show rule with a greater affix condition");
    if (kind === "leg" && by.get(1)!.value !== 8) return keepRaw(`rarity mask ${by.get(1)!.value} is not plain legendary (8)`);

    const n = probe.n ?? 0;
    const pair = `${kind}/${rule.vis}`;
    const idsFor = (sk: string) => (by.get(8)?.ids ?? []).filter((i) => m.uniques[String(i)].slot === sk);

    // Check every slot before changing any, so a rule is either modelled whole or kept raw whole.
    for (const sk of slots) {
      const s = model.slots[sk];
      if (!s.enabled) continue;
      const have = pairs.get(sk)!;
      const hasRecolour = [...have].some((p) => p.endsWith("/2"));
      if (have.has(pair)) return keepRaw(`slot ${sk} already has this rule`);
      if (!deepEqual([probe.required, probe.desired, n], [s.required, s.desired, s.n]))
        return keepRaw(`stats differ from slot ${sk}'s other rule`);
      if (recolour && hasRecolour && (ga !== s.ga || !deepEqual(probe.ga_wanted, s.ga_wanted)))
        return keepRaw(`greater affixes differ from slot ${sk}'s other rule`);
      if (kind === "uni" && s.uniques.length && !deepEqual(s.uniques, idsFor(sk))) return keepRaw(`uniques differ from slot ${sk}'s other rule`);
      if (kind === "leg" && s.legendaries && s.leg_rarity !== by.get(1)!.value) return keepRaw(`rarity differs from slot ${sk}'s other rule`);
    }
    // all gear recolours share one colour: the first imported one sets it
    if (recolour && gearColor && rule.color !== model.colors.gear) return keepRaw("colour differs from the gear colour");

    if (slots.length > 1) warnings.push(`${rule.name}: uniques span slots ${slots.join(", ")}; split into one rule per slot`);
    modelled = true;
    for (const sk of slots) {
      const s = model.slots[sk];
      if (!s.enabled) {
        Object.assign(s, { enabled: true, required: probe.required, desired: probe.desired, n, ga: 0, ga_wanted: [] });
        pairs.set(sk, new Set());
      }
      if (recolour) {
        s.ga = ga;
        s.ga_wanted = probe.ga_wanted;
        model.colors.gear = rule.color;
        gearColor = true;
      }
      if (kind === "uni") s.uniques = idsFor(sk);
      else { s.legendaries = true; s.leg_rarity = by.get(1)!.value as number; }
      pairs.get(sk)!.add(pair);
    }
  });
  // a kept-as-is rule found after a modelled one goes after all modelled rules; say so when another
  // modelled rule followed it, since that is a move that could change what matches first
  const lastModelled = doc.rules.findLastIndex((r) => !model.raw.some((x) => x.rule === r) && !(r.vis === 3 && !r.conditions.length));
  for (const name of moved) {
    const i = doc.rules.findIndex((r) => r.name === name);
    if (i < lastModelled) warnings.push(`${name}: moved after the modelled rules; check it is not shadowed`);
  }
  return { model, warnings };
}

function cmpLists(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

function norm(rule: Rule): Omit<Rule, "name"> {
  const r = structuredClone(rule) as Partial<Rule>;
  for (const c of r.conditions!) {
    if (c.ids) c.ids.sort((a, b) => a - b);
    if (c.ga_required_on) c.ga_required_on.sort(cmpLists);
  }
  r.conditions!.sort((a, b) => (a.type as number) - (b.type as number) || cmpLists(a.ids ?? [], b.ids ?? []));
  delete r.name;
  if (r.vis !== 2) r.color = ""; // colour only matters when recolouring
  return r as Omit<Rule, "name">;
}

/** Compare original vs compile(import(original)). */
export function roundtrip(doc: Filter): { model: Model; warnings: string[]; diffs: string[] } {
  const { model, warnings } = importFilter(doc);
  const out = compileModel(model);
  const strip = (rs: Rule[]) => rs.filter((r) => !(r.vis === 3 && !r.conditions.length));
  const a = strip(doc.rules).map(norm);
  const b = strip(out.rules).map(norm);
  const diffs: string[] = [];
  const pool = [...b];
  const take = (n: unknown) => {
    const i = pool.findIndex((p) => deepEqual(p, n));
    if (i >= 0) pool.splice(i, 1);
    return i >= 0;
  };
  for (const r of strip(doc.rules)) if (!take(norm(r))) diffs.push(`lost or changed: ${r.name}`);
  for (const r of strip(out.rules)) if (take(norm(r))) diffs.push(`added: ${r.name}`);
  if (!diffs.length && !deepEqual(a, b)) diffs.push("same rules, different order");
  return { model, warnings, diffs };
}
