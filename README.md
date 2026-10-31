# D4 Slot Editor

Character-sheet loot filter editor. Pick a class, click a paper-doll slot, set uniques, legendaries,
stats (desired N-of, GA wanted, required) and a priority tier. Compile writes rules in tier order with
`No Ma'am` last, encodes through `src/codec.ts` (round-trip checked) and copies the string.

All TypeScript. No Python.

```
npm install                 # once: @bufbuild/protobuf, typescript (type checking only)
npm start                   # node server.ts -> http://127.0.0.1:8470
npm test                    # codec golden tests + slot model tests
npm run typecheck           # tsc (TypeScript 7)
npm run filter -- check|decode|encode <in> [out]
npm run build-mapping -- <d4data>/json      # rebuild data/mapping.json
```

TypeScript files run directly on Node 24+ (built-in type stripping), so there is no ts-node or build
step. Keep to erasable syntax (no enums, namespaces or parameter properties) and import with `.ts`
extensions; `tsc` enforces both. ts-node does not work with TypeScript 7 (no JavaScript compiler API).

| Path | What it is |
|---|---|
| `src/codec.ts` | Import string ↔ filter JSON (protobuf wire format via @bufbuild/protobuf) |
| `src/compiler.ts` | Slot model → filter JSON |
| `src/importer.ts` | Filter JSON → slot model, with warnings and a round-trip diff |
| `src/mapping.ts` | Types and loader for `data/mapping.json` |
| `server.ts` | Local server: static `web/` plus a small JSON API |
| `web/` | The UI (plain JS) |
| `tools/filter_tool.ts` | Command-line codec |
| `tools/build_mapping.ts` | Builds `data/mapping.json` from a d4data checkout |

The TypeScript code is a port of the earlier Python. Before the Python was removed, both were checked
to give the same output: byte-identical import strings, the same `mapping.json`, and the same models,
warnings, diffs and compiled filters for both working filters.

## Goal: run in the browser

The editor should run completely in the browser where possible: open a page, edit, compile, copy,
with no local server. Building `data/mapping.json` from d4data stays an offline step (it is roughly a
one-off per season). Current blockers:

- `src/codec.ts` uses Node's `Buffer` for hex in unknown fields. Replace with a browser-safe helper.
- `src/mapping.ts` reads the file with `fs`. In the browser, `fetch` it instead.
- The UI calls `server.ts` for import, compile and the filter list. Call `src/` directly instead, and
  load filters by paste or file picker.
- Browsers do not run `.ts` and cannot resolve the npm import `@bufbuild/protobuf/wire`. This needs a
  bundle step (e.g. esbuild) or an import map with prebuilt JS.

Keep `src/` free of new Node-only APIs so it can move to the browser.

## ID source (verified)
Filter IDs are d4data SNO IDs: all 53 IDs in `strict_warlock_bs` resolve (affix group 104, item 73,
item type 98, talisman set 109). `data/mapping.json` is built from d4data files only.
Valid stats per slot = affix `arAllowedItemLabels` ∩ item type `arItemLabels`, filtered by class.

## Import
Rules that do not fit the slot model stay as raw rules (kept in tier position) and are listed in the UI.
Known: rules with a `uniques` + `item_types` pair, rarity masks other than 8, and a second rule for
the same slot stay raw. Multi-slot unique rules are split per slot (same behaviour).

## Unverified
- Filter `class_id` is known only for warlock (6) and rogue (7). Other classes cannot compile.
- More than one affix (type 6) condition per rule (used for "required") is not in any real filter yet. Test in game.
- `ga_wanted` is written as `ga_required_on` pairs `[id, id]`, as in the Rogue filter. Their exact semantics are unverified.
- Display names exist for items only; affix names are prettified internal names.
