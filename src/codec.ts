// Diablo 4 loot filter codec: in-game import string (base64 protobuf) <-> filter JSON.
// Port of the original filter_tool.py. Same JSON shape, same byte output.
// Wire format and base64 come from @bufbuild/protobuf; base64 is also checked strictly first.
// encode() re-decodes its own output and refuses a string that does not match the JSON.

import { BinaryReader, BinaryWriter, WireType, base64Decode, base64Encode } from "@bufbuild/protobuf/wire";

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

// ---------- wire format (via @bufbuild/protobuf) ----------
type Field = [number, number, number | Uint8Array];

// Read every top-level field of a message in order, keeping unknown fields.
function parse(b: Uint8Array): Field[] {
  const r = new BinaryReader(b);
  const out: Field[] = [];
  while (r.pos < r.len) {
    const start = r.pos;
    try {
      const [f, w] = r.tag();
      if (w === WireType.Varint) out.push([f, w, Number(r.uint64())]);
      else if (w === WireType.Bit32) out.push([f, w, r.fixed32()]);
      else if (w === WireType.LengthDelimited) out.push([f, w, r.bytes()]);
      else throw new Error(`unsupported wire type ${w}`);
    } catch (e) {
      throw new Error(`${(e as Error).message} at byte ${start}`);
    }
  }
  return out;
}

type Write = (w: BinaryWriter) => void;
const ld = (f: number, body: Write): Write => (w) => { w.tag(f, WireType.LengthDelimited).fork(); body(w); w.join(); };
const vi = (f: number, v: number): Write => (w) => { w.tag(f, WireType.Varint).uint64(v); };
const f32 = (f: number, v: number): Write => (w) => { w.tag(f, WireType.Bit32).fixed32(v); };
const raw = (f: number, b: Uint8Array): Write => (w) => { w.tag(f, WireType.LengthDelimited).bytes(b); };
const all = (parts: Write[]): Write => (w) => parts.forEach((p) => p(w));

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

function encodeCond(c: Condition): Write {
  const out: Write[] = [vi(1, c.type as number)];
  for (const x of c.ids ?? []) out.push(f32(2, x));
  for (const pair of c.ga_required_on ?? []) out.push(ld(3, all([f32(1, pair[0]), f32(2, pair[1])])));
  if (c.value !== undefined) out.push(vi(4, c.value));
  if (c.flag !== undefined) out.push(vi(6, c.flag));
  for (const [f, w, v] of c.extra ?? []) {
    if (w === 2) out.push(raw(f, Buffer.from(v as string, "hex")));
    else if (w === 0) out.push(vi(f, v as number));
    else out.push(f32(f, v as number));
  }
  return all(out);
}

const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function decode(text: string): Filter {
  const t = text.trim();
  if (!B64.test(t)) throw new Error("invalid base64 (bad character, padding or length)");
  const bytesIn = base64Decode(t);
  const doc: Filter = { name: null, class_id: null, slot_idx: null, rules: [] };
  for (const [f, w, v] of parse(bytesIn)) {
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
  const w = new BinaryWriter();
  for (const r of doc.rules) {
    ld(1, all([
      ...(r.name ? [(x: BinaryWriter) => { x.tag(1, WireType.LengthDelimited).string(r.name); }] : []),
      vi(2, r.vis), f32(3, parseInt(r.color, 16)),
      ...r.conditions.map((c) => ld(4, encodeCond(c))),
      vi(5, r.enabled),
    ]))(w);
  }
  if (doc.name) w.tag(2, WireType.LengthDelimited).string(doc.name);
  vi(3, doc.class_id as number)(w); vi(4, doc.slot_idx as number)(w);
  return w.finish();
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as any)[k], (b as any)[k]));
}

export function encode(doc: Filter): string {
  const text = base64Encode(rawEncode(doc));
  const normalised = decode(text);
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
