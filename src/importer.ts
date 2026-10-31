// Filter JSON -> slot model, with warnings for anything that does not fit.
//
// Rules that do not fit stay in the model verbatim as raw rules, placed by tier between the
// slot rules, so compile(import(x)) keeps their behaviour. `roundtrip` compares the two
// filters rule by rule.
import { deepEqual, type Condition, type Filter, type Rule } from "./codec.ts";
import { compileModel, defaultModel, UNIQUE_MASK, type Model, type SlotConfig } from "./compiler.ts";
import { mapping, type Mapping } from "./mapping.ts";

const SLOT_TYPES = new Set([1, 2, 4, 5, 6, 8]);
type Probe = Pick<SlotConfig, "required" | "desired" | "ga_wanted">;

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
      if (s.desired.affixes.length) return false;
      s.desired = { n: c.value ?? 0, affixes: [...ids] };
      s.ga_wanted = pairs.map(([a]) => a);
    }
  }
  return true;
}

function byType(conds: Condition[]): Map<number, Condition> {
  return new Map(conds.map((c) => [c.type as number, c]));
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
  const seen = new Set<string>(); // "slot/kind" already modelled
  let tier = 0;

  doc.rules.forEach((rule, idx) => {
    if (idx === doc.rules.length - 1 && rule.vis === 3 && !rule.conditions.length) return; // No Ma'am: compiler appends it
    const cl = classify(rule, m);
    if (cl === null) { model.raw.push({ tier: tier + 0.5, rule }); return; }
    const [kind, slots] = cl;
    const by = byType(rule.conditions);
    const probe: Probe = { required: [], desired: { n: 0, affixes: [] }, ga_wanted: [] };
    const gaMin = by.get(4)?.value ?? 0;
    let why: string | null = null;
    if (!affixParts(rule.conditions, probe, warnings, rule.name)) why = "affix layout does not fit";
    else if (slots.some((sk) => seen.has(`${sk}/${kind}`))) why = `a slot already has a ${kind} rule`;
    else if (by.has(2) && by.get(2)!.value !== 4) why = `property ${by.get(2)!.value} is not ancestral`;
    else if (kind === "leg" && by.get(1)!.value !== 8) why = `rarity mask ${by.get(1)!.value} is not plain legendary (8)`;
    if (why) {
      warnings.push(`${rule.name}: ${why}, kept as raw rule`);
      model.raw.push({ tier: tier + 0.5, rule });
      return;
    }
    if (slots.length > 1) warnings.push(`${rule.name}: uniques span slots ${slots.join(", ")}; split into one rule per slot`);
    tier += 1;
    for (const sk of slots) {
      const s = model.slots[sk];
      if (!s.enabled) {
        Object.assign(s, {
          enabled: true, tier, vis: rule.vis,
          color: rule.vis === 2 && rule.color !== "0x00000000" ? rule.color : null,
          ancestral: by.has(2), ga_min: gaMin,
          required: probe.required, desired: probe.desired, ga_wanted: probe.ga_wanted,
        });
      } else if (!deepEqual([probe.required, probe.desired, probe.ga_wanted], [s.required, s.desired, s.ga_wanted])
        || by.has(2) !== s.ancestral || gaMin !== s.ga_min) {
        // different settings for the same slot: cannot share one slot config
        warnings.push(`${rule.name}: settings differ from slot ${sk}'s other rule, kept as raw rule`);
        model.raw.push({ tier: tier - 0.5, rule });
        break;
      }
      if (kind === "uni") s.uniques = (by.get(8)!.ids ?? []).filter((i) => m.uniques[String(i)].slot === sk);
      else { s.legendaries = true; s.leg_rarity = by.get(1)!.value as number; }
      seen.add(`${sk}/${kind}`);
    }
  });
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
