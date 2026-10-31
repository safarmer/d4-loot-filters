// Filter JSON -> slot model, with warnings for anything that does not fit. The import is an improved
// presentation, not the source of truth (the saved filter is never changed), so rules are cleaned
// to fit the editor where the intent is clear (cleanRule, shared gear colour, fixed Mythics and
// catch-all rules), each change with a note. An imported filter is read
// as an end-game filter: an ancestral recolour rule with a greater affix count sets the slot's desired
// stats, n and ga; an ancestral show rule without one sets desired stats and n. The end-game compile
// also adds the show rule an imported recolour-only slot lacks; `roundtrip` reports those as added.
//
// Rules that do not fit stay in the model verbatim as raw rules, before or after the modelled rules
// (as imported), so compile(import(x)) keeps their behaviour. `roundtrip` compares the two
// filters rule by rule.
import { deepEqual, type Condition, type Filter, type Rule } from "./codec.ts";
import { compileModel, defaultModel, MATS_MASK, MAX_UNIQUES, MYTHIC_MASK, SET_MASK, UNIQUE_MASK, validAffixes, validCharmAffixes, type Model } from "./compiler.ts";
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

type CharmGroup = "uni" | "set";
type CharmLevel = "stats" | "plain";

/** A charm recolour rule: picked unique charms or wanted sets, at a level. */
function classifyCharm(rule: Rule, m: Mapping): { group: CharmGroup; level: CharmLevel } | null {
  if (!rule.enabled || rule.vis !== 2) return null;
  const types = rule.conditions.map((c) => c.type as number);
  if (new Set(types).size !== types.length) return null;
  const by = byType(rule.conditions);
  const itemTypes = [...(by.get(5)?.ids ?? [])].sort();
  if (by.has(4)) return null; // greater-affix charm rules are not modelled (cleanRule drops them)
  const level: CharmLevel = by.has(6) ? "stats" : "plain";
  if (by.has(9)) {
    if (types.some((t) => ![1, 4, 5, 6, 9].includes(t)) || by.get(1)?.value !== SET_MASK || !deepEqual(itemTypes, [m.charm_type])) return null;
    return { group: "set", level };
  }
  if (by.has(8)) {
    const ids = by.get(8)!.ids ?? [];
    if (types.some((t) => ![4, 5, 6, 8].includes(t)) || !itemTypes.includes(m.charm_type)
      || itemTypes.some((t) => t !== m.charm_type && t !== m.seal_type)) return null;
    if (ids.length > MAX_UNIQUES || !ids.every((i) => m.uniques[String(i)]?.slot === "charm")) return null;
    return { group: "uni", level };
  }
  return null;
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

/**
 * Cleans an imported rule to fit the editor where the meaning is clear; returns null to drop it.
 * Each change adds a note. Only changes that cannot lose a wanted item, or that drop a rule the
 * materials rule covers:
 *  - "all unique charms" recolour (unique rarity + charm type, any extra property): dropped; the
 *    materials rule shows those charms.
 *  - charm-type uniques rule with gear uniques in it: the gear IDs never match a charm, dropped.
 *  - legendary-slot rule with a greater-affix condition and a rarity mask with magic/rare bits:
 *    greater affixes only roll on legendary or better, so the mask becomes legendary (8).
 * (Also, in importFilter: a gear recolour rule in another colour adopts the shared gear colour.)
 */
/** Name shared by the variants of one stat: drops S04_/X2_ prefixes, a _Greater suffix and charm prefixes. */
const statBase = (name: string) => name.replace(/^Talisman_Charm_(Affix_)?/, "").replace(/^(S\d+|X\d+)_/, "").replace(/_Greater$/, "");

/**
 * Affix IDs in a rule's stat conditions, mapped to IDs that can roll on the rule's items: for each
 * gear slot the rule covers, a stat that cannot roll there gets the variant that can (e.g.
 * S04_CoreStat_Willpower on an amulet -> X2_CoreStat_Willpower_Greater); in a charm rule a gear stat
 * becomes the charm stat (X2_SkillRankBonus_…_Hellfire -> Talisman_Charm_SkillRankBonus_…_Hellfire).
 * Gear rules only gain variants and keep every listed stat: a unique's fixed stats are not in the
 * slot's random pool, and how the game matches them is unverified. A charm rule's gear stat is
 * replaced by its charm variant (a charm never rolls gear stats). GA-on-stat pairs follow.
 */
function mapStats(r: Rule, m: Mapping, cls: string, notes: string[]): void {
  const by = byType(r.conditions);
  const itemTypes = by.get(5)?.ids ?? [];
  const charm = by.has(9) || (itemTypes.length > 0 && itemTypes.every((t) => t === m.charm_type || t === m.seal_type));
  const slots = charm ? [] : [...new Set([
    ...(by.get(8)?.ids ?? []).map((i) => m.uniques[String(i)]?.slot),
    ...itemTypes.map((t) => m.item_types[String(t)]?.slot ?? undefined),
  ].filter((s): s is string => !!s && s !== "charm"))];
  if (!charm && !slots.length) return;
  const pools = charm ? [new Set(validCharmAffixes(cls))] : slots.map((k) => new Set(validAffixes(k, cls)));
  const variantIn = (pool: Set<number>, id: number) => {
    const b = statBase(m.affixes[id]?.name ?? "");
    return b ? [...pool].find((v) => statBase(m.affixes[v].name) === b) : undefined;
  };
  const changes: string[] = [];
  for (const c of r.conditions) {
    if (c.type !== 6 || !c.ids) continue;
    const out: number[] = [];
    const swap = new Map<number, number>();
    for (const id of c.ids) {
      const validSomewhere = pools.some((p) => p.has(id));
      const replaced = charm && !validSomewhere && pools.some((p) => variantIn(p, id) !== undefined);
      if (!replaced && !out.includes(id)) out.push(id);
      for (const p of pools) {
        if (p.has(id)) continue;
        const v = variantIn(p, id);
        if (v !== undefined && !c.ids.includes(v) && !out.includes(v)) {
          out.push(v);
          if (replaced) swap.set(id, v);
          changes.push(`${m.affixes[id]?.name ?? id} ${replaced ? "->" : "+"} ${m.affixes[v].name}`);
        }
      }
    }
    if (c.ga_required_on) {
      const pairs = c.ga_required_on.map(([a]) => swap.get(a) ?? a).filter((a) => out.includes(a));
      c.ga_required_on = pairs.map((a) => [a, a]);
      if (!c.ga_required_on.length) delete c.ga_required_on;
    }
    c.ids = out;
    if (c.value !== undefined) c.value = Math.min(c.value, out.length);
  }
  if (changes.length) notes.push(`${r.name}: stats mapped to variants that can roll (+ added, -> replaced): ${[...new Set(changes)].join("; ")}`);
}

function cleanRule(rule: Rule, m: Mapping, notes: string[], cls = "warlock"): Rule | null {
  const r = structuredClone(rule);
  const by = byType(r.conditions);
  const itemTypes = by.get(5)?.ids ?? [];
  const charmOnly = itemTypes.length > 0 && itemTypes.every((t) => t === m.charm_type || t === m.seal_type);
  if (r.vis === 2 && charmOnly && by.get(1)?.value === UNIQUE_MASK && !by.has(8) && !by.has(6) && !by.has(9)
    && r.conditions.every((c) => [1, 2, 5].includes(c.type as number))) {
    notes.push(`${r.name}: dropped; the materials rule shows other unique charms`);
    return null;
  }
  // a charm rule with a greater-affix condition: dropped; the editor has no charm GA level (saves
  // rules), and the stats-only charm rules already colour these charms
  if ((by.has(9) || (charmOnly && by.has(8))) && by.has(4) && r.vis === 2) {
    notes.push(`${r.name}: dropped; charms have no greater-affix rule here (its stats rule still applies)`);
    return null;
  }
  if (charmOnly && by.has(8)) {
    const ids = by.get(8)!.ids ?? [];
    const keep = ids.filter((i) => m.uniques[String(i)]?.slot === "charm");
    if (keep.length && keep.length < ids.length) {
      notes.push(`${r.name}: removed ${ids.length - keep.length} gear unique(s) a charm rule cannot match`);
      by.get(8)!.ids = keep;
    }
  }
  mapStats(r, m, cls, notes);
  const rarity = by.get(1);
  const slotTypes = itemTypes.length > 0 && itemTypes.every((t) => m.item_types[String(t)]?.slot);
  if (rarity && slotTypes && by.has(4) && (rarity.value ?? 0) & 8 && (rarity.value ?? 0) & 6 && !((rarity.value ?? 0) & ~14)) {
    notes.push(`${r.name}: rarity ${rarity.value} -> 8; greater affixes only roll on legendary or better`);
    rarity.value = 8;
  }
  return r;
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

  doc.rules.forEach((original, idx) => {
    if (idx === doc.rules.length - 1 && endsHidden) return; // No Ma'am: compiler appends it
    const cleaned = cleanRule(original, m, warnings, cls!);
    if (!cleaned) return;
    const rule = cleaned;
    const keepRaw = (why: string | null) => {
      if (why) warnings.push(`${rule.name}: ${why}, kept as raw rule`);
      model.raw.push({ place: modelled ? "last" : "first", rule });
      if (modelled) moved.push(rule.name);
    };

    // the catch-all ancestral rules: the compiler always adds its own (on in starter, off in end-game)
    const types = rule.conditions.map((c) => `${c.type}:${c.value ?? ""}`).sort().join(",");
    if (rule.vis === 0 && (types === "2:4" || types === "2:4,4:2")) return;

    // a codex-upgrade rule: the compiler always adds one as the first rule
    if (rule.conditions.length === 1 && rule.conditions[0].type === 3) {
      if (rule.vis !== 2 || rule.color !== "0xFFFF0000") warnings.push(`${rule.name}: replaced by the fixed Codex Upgrades rule (recolour red, first)`);
      return;
    }

    // a "mythics only" rule (show or recolour): the compiler always adds one (last, before No Ma'am)
    if (rule.conditions.length === 1 && rule.conditions[0].type === 1 && rule.conditions[0].value === MYTHIC_MASK) {
      if (rule.vis !== 0) warnings.push(`${rule.name}: replaced by the fixed Mythics rule (show, last)`);
      return;
    }

    if (isMatsRule(rule, m)) {
      if (model.charms.mats) return keepRaw("materials rule already modelled");
      model.charms.mats = true;
      modelled = true;
      return;
    }

    const charm = classifyCharm(rule, m);
    if (charm) {
      const c = model.charms, by = byType(rule.conditions), key = `${charm.group}/${charm.level}`;
      if (charmKinds.has(key)) return keepRaw("charms already have this rule");
      if (c.mats) return keepRaw("charm rule after the materials rule");
      const items = charm.group === "uni" ? by.get(8)!.ids ?? [] : by.get(9)!.ids ?? [];
      const have = charm.group === "uni" ? c.uniques : c.sets;
      const groupSeen = [...charmKinds].some((k) => k.startsWith(charm.group + "/"));
      if (groupSeen && !deepEqual(have, items)) return keepRaw(`${charm.group === "uni" ? "uniques" : "sets"} differ from the other charm rule`);
      const statsSeen = [...charmKinds].some((k) => k.endsWith("/stats"));
      if (charm.level !== "plain") {
        const a = by.get(6)!, ids = a.ids ?? [], pairs = a.ga_required_on ?? [];
        if (pairs.some(([x, y]) => x !== y) || (charm.level === "stats" && pairs.length)) return keepRaw("charm GA-on-stat layout does not fit");
        if (statsSeen && (!deepEqual(c.desired, ids) || c.n !== a.value)) return keepRaw("charm stats differ from the other charm rule");
        const ok = new Set(validCharmAffixes(cls!));
        const valid = ids.filter((i) => ok.has(i));
        if (valid.length < ids.length)
          warnings.push(`${rule.name}: charms cannot roll ${ids.filter((i) => !ok.has(i)).map((i) => m.affixes[String(i)]?.name ?? i).join(", ")}; left out`);
        c.desired = valid;
        c.n = a.value ?? 1;
      }
      if (charm.group === "uni") c.uniques = [...items]; else c.sets = [...items];
      c.enabled = true;
      const colorKey = charm.level === "stats" ? "charm_stats"
        : charm.group === "uni" ? "unique_charm" : "charm_set";
      model.colors[colorKey] = rule.color;
      charmKinds.add(key);
      modelled = true;
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

    // each slot keeps only the stats that can roll on it (other slots' stats in a multi-slot rule, and
    // plain IDs where the slot rolls a _Greater variant, would show as invalid); the compiler merges
    // slots again where that cannot change a match
    const own = (sk: string) => {
      const ok = new Set(validAffixes(sk, cls!));
      const desired = probe.desired.filter((i) => ok.has(i));
      return {
        required: probe.required.filter((i) => ok.has(i)), desired,
        ga_wanted: probe.ga_wanted.filter((i) => ok.has(i)),
        n: Math.min(probe.n ?? 0, desired.length),
      };
    };
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
      const o = own(sk);
      if (!deepEqual([o.required, o.desired, o.n], [s.required, s.desired, s.n]))
        return keepRaw(`stats differ from slot ${sk}'s other rule`);
      if (recolour && hasRecolour && (ga !== s.ga || !deepEqual(o.ga_wanted, s.ga_wanted)))
        return keepRaw(`greater affixes differ from slot ${sk}'s other rule`);
      if (kind === "uni" && s.uniques.length && !deepEqual(s.uniques, idsFor(sk))) return keepRaw(`uniques differ from slot ${sk}'s other rule`);
      if (kind === "leg" && s.legendaries && s.leg_rarity !== by.get(1)!.value) return keepRaw(`rarity differs from slot ${sk}'s other rule`);
    }
    // all gear recolours share one colour: the first imported one sets it, later ones adopt it
    if (recolour && gearColor && rule.color !== model.colors.gear)
      warnings.push(`${rule.name}: colour ${rule.color} -> gear colour ${model.colors.gear}`);

    if (slots.length > 1) warnings.push(`${rule.name}: uniques span slots ${slots.join(", ")}; split into one rule per slot`);
    modelled = true;
    for (const sk of slots) {
      const s = model.slots[sk];
      // note stats left out; in a multi-slot rule only those no slot of the rule can roll (the rest
      // belong to another slot, as in the compiler's merged rules)
      const kept = own(sk);
      const anySlot = new Set(slots.flatMap((k) => [...own(k).required, ...own(k).desired]));
      const dropped = [...probe.required, ...probe.desired].filter((i) => !kept.required.includes(i) && !kept.desired.includes(i)
        && (slots.length === 1 || !anySlot.has(i)));
      if (dropped.length && (slots.length === 1 || sk === slots[0]))
        warnings.push(`${rule.name}: ${slots.length === 1 ? sk : slots.join("/")} cannot roll ${[...new Set(dropped)].map((i) => m.affixes[String(i)]?.name ?? i).join(", ")}; left out`);
      if (!s.enabled) {
        const o = own(sk);
        Object.assign(s, { enabled: true, required: o.required, desired: o.desired, n: o.n, ga: 0, ga_wanted: [] });
        pairs.set(sk, new Set());
      }
      if (recolour) {
        s.ga = ga;
        s.ga_wanted = own(sk).ga_wanted;
        if (!gearColor) model.colors.gear = rule.color;
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
