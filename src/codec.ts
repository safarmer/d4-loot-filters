// Diablo 4 loot filter codec: in-game import string (base64 protobuf) <-> filter JSON.
// Port of the original filter_tool.py. Same JSON shape, same byte output.
// encode() re-decodes its own output and refuses a string that does not match the JSON.

// ---------- schema ----------
// Filter:    1 rule (repeated), 2 name, 3 class_id, 4 slot_idx
// Rule:      1 name, 2 vis (0 show, 2 recolour, 3 hide), 3 colour ARGB, 4 condition (repeated), 5 enabled
// Condition: 1 type, 2 id list (fixed32), 3 GA-on-affix pair (repeated), 4 value, 6 flag
//   type 1 rarity (value = bitmask: 1 normal, 2 magic, 4 rare, 8 legendary, 16 unique, 32 mythic, 64 set)
//   type 2 item property (value 4 = ancestral) | type 3 codex upgrade (flag) | type 4 greater affixes (value = min GA)
//   type 5 item types | type 6 affixes (value = min matches) | type 8 unique items | type 9 talisman sets
export const TYPES: Record<number, string> = {
  1: "rarity", 2: "property", 3: "codex", 4: "greater_affixes", 5: "item_types",
  6: "affixes", 8: "uniques", 9: "talisman_sets",
};

export type Extra = [number, number, number | string];
export interface Condition {
  type: number | null;
  kind?: string;
  ids?: number[];
  ga_required_on?: number[][];
  value?: number;
  flag?: number;
  extra?: Extra[];
}
export interface Rule { name: string; vis: number; color: string; enabled: number; conditions: Condition[] }
export interface Filter { name: string | null; class_id: number | null; slot_idx: number | null; rules: Rule[] }

// ---------- wire format ----------
type Field = [number, number, number | Uint8Array];

function vint(n: number): number[] {
  const out: number[] = [];
  for (;;) {
    const b = n % 128; n = Math.floor(n / 128);
    if (n) out.push(b | 0x80);
    else { out.push(b); return out; }
  }
}

function readVint(b: Uint8Array, i: number): [number, number] {
  let r = 0, mul = 1;
  for (;;) {
    if (i >= b.length) throw new Error("truncated varint");
    const c = b[i++]; r += (c & 0x7f) * mul; mul *= 128;
    if (!(c & 0x80)) return [r, i];
  }
}

function parse(b: Uint8Array): Field[] {
  let i = 0;
  const out: Field[] = [];
  while (i < b.length) {
    const start = i;
    let k: number; [k, i] = readVint(b, i);
    const f = Math.floor(k / 8), w = k & 7;
    if (f === 0) throw new Error(`field 0 at byte ${start}`);
    let v: number | Uint8Array;
    if (w === 0) [v, i] = readVint(b, i);
    else if (w === 5) {
      if (i + 4 > b.length) throw new Error(`truncated fixed32 at byte ${start}`);
      v = new DataView(b.buffer, b.byteOffset + i, 4).getUint32(0, true); i += 4;
    } else if (w === 2) {
      let n: number; [n, i] = readVint(b, i);
      if (i + n > b.length) throw new Error(`length ${n} overruns message at byte ${start}`);
      v = b.subarray(i, i + n); i += n;
    } else throw new Error(`unsupported wire type ${w} at byte ${start}`);
    out.push([f, w, v]);
  }
  return out;
}

const ld = (f: number, payload: number[]) => [...vint((f << 3) | 2), ...vint(payload.length), ...payload];
const vi = (f: number, v: number) => [...vint(f << 3), ...vint(v)];
function f32(f: number, v: number): number[] {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v, true);
  return [...vint((f << 3) | 5), ...b];
}

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const utf8 = new TextDecoder("utf-8", { fatal: true });
const num = (v: number | Uint8Array) => v as number;
const bytes = (v: number | Uint8Array) => v as Uint8Array;

function decodeCond(b: Uint8Array): Condition {
  const c: Condition = { type: null };
  const extra: Extra[] = [];
  for (const [f, w, v] of parse(b)) {
    if (f === 1 && w === 0) { c.type = num(v); c.kind = TYPES[num(v)] ?? "unknown"; }
    else if (f === 2 && w === 5) (c.ids ??= []).push(num(v));
    else if (f === 3 && w === 2) {
      const pair = parse(bytes(v)).filter(([, ww]) => ww === 5).map(([, , x]) => num(x));
      (c.ga_required_on ??= []).push(pair);
    } else if (f === 4 && w === 0) c.value = num(v);
    else if (f === 6 && w === 0) c.flag = num(v);
    else extra.push([f, w, w === 2 ? hex(bytes(v)) : num(v)]);
  }
  if (extra.length) c.extra = extra;
  return c;
}

function encodeCond(c: Condition): number[] {
  const out = vi(1, c.type as number);
  for (const x of c.ids ?? []) out.push(...f32(2, x));
  for (const pair of c.ga_required_on ?? []) out.push(...ld(3, [...f32(1, pair[0]), ...f32(2, pair[1])]));
  if (c.value !== undefined) out.push(...vi(4, c.value));
  if (c.flag !== undefined) out.push(...vi(6, c.flag));
  for (const [f, w, v] of c.extra ?? []) {
    if (w === 2) out.push(...ld(f, [...Buffer.from(v as string, "hex")]));
    else if (w === 0) out.push(...vi(f, v as number));
    else out.push(...f32(f, v as number));
  }
  return out;
}

const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function decode(text: string): Filter {
  const t = text.trim();
  if (!B64.test(t)) throw new Error("invalid base64 (bad character, padding or length)");
  const raw = new Uint8Array(Buffer.from(t, "base64"));
  const doc: Filter = { name: null, class_id: null, slot_idx: null, rules: [] };
  for (const [f, w, v] of parse(raw)) {
    if (f === 1 && w === 2) {
      const r: Rule = { name: "", vis: 0, color: "0x00000000", enabled: 0, conditions: [] };
      for (const [a, , x] of parse(bytes(v))) {
        if (a === 1) r.name = utf8.decode(bytes(x));
        else if (a === 2) r.vis = num(x);
        else if (a === 3) r.color = "0x" + num(x).toString(16).toUpperCase().padStart(8, "0");
        else if (a === 4) r.conditions.push(decodeCond(bytes(x)));
        else if (a === 5) r.enabled = num(x);
        else throw new Error(`unknown rule field ${a}`);
      }
      doc.rules.push(r);
    } else if (f === 2 && w === 2) doc.name = utf8.decode(bytes(v));
    else if (f === 3 && w === 0) doc.class_id = num(v);
    else if (f === 4 && w === 0) doc.slot_idx = num(v);
    else throw new Error(`unknown top-level field ${f} (wire type ${w})`);
  }
  return doc;
}

function rawEncode(doc: Filter): Uint8Array {
  const out: number[] = [];
  const enc = new TextEncoder();
  for (const r of doc.rules) {
    const body = r.name ? ld(1, [...enc.encode(r.name)]) : [];
    body.push(...vi(2, r.vis), ...f32(3, parseInt(r.color, 16)));
    for (const c of r.conditions) body.push(...ld(4, encodeCond(c)));
    body.push(...vi(5, r.enabled));
    out.push(...ld(1, body));
  }
  if (doc.name) out.push(...ld(2, [...enc.encode(doc.name)]));
  out.push(...vi(3, doc.class_id as number), ...vi(4, doc.slot_idx as number));
  return new Uint8Array(out);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as any)[k], (b as any)[k]));
}

export function encode(doc: Filter): string {
  const text = Buffer.from(rawEncode(doc)).toString("base64");
  const normalised = decode(Buffer.from(rawEncode(doc)).toString("base64"));
  if (!deepEqual(decode(text), normalised))
    throw new Error("round-trip check failed: encoded string does not decode back to the JSON");
  // also catch JSON the encoder cannot represent (e.g. a key it ignores)
  if (!deepEqual(stripUndefined(doc), normalised))
    throw new Error("round-trip check failed: JSON has fields or values the format cannot hold");
  return text;
}

const stripUndefined = (x: unknown) => JSON.parse(JSON.stringify(x));

// Same text as Python json.dump(indent=2): non-ASCII escaped as \uXXXX.
export function toJson(doc: unknown): string {
  return JSON.stringify(doc, null, 2).replace(/[\u007f-￿]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

export function summary(doc: Filter): string {
  const vis: Record<number, string> = { 0: "show", 2: "recolour", 3: "hide" };
  const lines = [`'${doc.name}'  class ${doc.class_id}  slot ${doc.slot_idx}  ${doc.rules.length} rules`];
  doc.rules.forEach((r, i) => {
    const conds = r.conditions.map((c) => `${c.kind}` + (c.ids ? `[${c.ids.length}]` : "")
      + (c.value !== undefined ? `=${c.value}` : "")).join(", ");
    lines.push(`  ${String(i).padStart(2)} ${r.name.padEnd(24)} ${(vis[r.vis] ?? String(r.vis)).padEnd(8)} ${r.color}  ${conds || "(matches everything)"}`);
  });
  return lines.join("\n");
}
