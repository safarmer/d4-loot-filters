# D4 Slot Editor

Character-sheet loot filter editor. Pick a class, click a paper-doll slot, set uniques, legendaries,
stats (desired N-of, GA wanted, required) and a priority tier. Compile writes rules in tier order with
`No Ma'am` last, encodes through `src/codec.ts` (round-trip checked) and copies the string.

Runs completely in the browser: Vite + React 19 + Immer, all TypeScript. The only offline step is
building the mapping in `data/` from d4data (roughly once per season).

```
npm install
npm run dev                 # Vite dev server -> http://localhost:5173
npm run build               # tsc type check + static site in dist/ (no server code)
npm run preview             # serve dist/ to check the build
npm test                    # Vitest: codec golden tests + slot model tests
npm run typecheck           # tsc (TypeScript 7, checks .ts and .tsx)
npm run filter -- check|decode|encode <in> [out]   # command-line codec (Node)
npm run build-mapping -- <d4data>/json             # offline: rebuild data/*.json (Node)
```

`dist/` needs a static host (any web server, or `npm run preview`). Browsers do not load module
scripts from `file://`, so opening `dist/index.html` directly does not work.

The two command-line tools run as TypeScript directly on Node 24+ (built-in type stripping). Keep to
erasable syntax (no enums, namespaces or parameter properties) and import with `.ts` extensions;
`tsc` enforces both. ts-node does not work with TypeScript 7 (no JavaScript compiler API).

| Path | What it is |
|---|---|
| `src/codec.ts` | Import string ↔ filter JSON (protobuf wire format via @bufbuild/protobuf) |
| `src/compiler.ts` | Slot model → filter JSON |
| `src/importer.ts` | Filter JSON → slot model, with warnings and a round-trip diff |
| `src/mapping.ts` | Mapping types; callers load the JSON and pass it to `setMapping()` |
| `src/ui/` | React UI. Loads the `data/` files with `fetch`; changes the model with Immer |
| `tools/filter_tool.ts` | Command-line codec |
| `tools/build_mapping.ts` | Builds the `data/` files from a d4data checkout |
| `tools/node_mapping.ts` | Loads the mapping from disk for the tools and tests |

`src/` (outside `src/ui/`) must stay free of Node-only APIs (`fs`, `path`, `Buffer`): the browser
and the Node tools share it.

Filters in `../Loot Filters/*.txt` are bundled into the page at build time (Load menu). Any other
filter loads by paste or file picker.

The TypeScript code is a port of the earlier Python. Before the Python was removed, both were checked
to give the same output: byte-identical import strings, the same mapping, and the same models,
warnings, diffs and compiled filters for both working filters.

## ID source (verified)
Filter IDs are d4data SNO IDs: all 53 IDs in `strict_warlock_bs` resolve (affix group 104, item 73,
item type 98, talisman set 109). The mapping is built from d4data files only, into three files in `data/`:

| File | Holds | Size |
|---|---|---|
| `meta.json` | source and d4data commit, classes, filter class ids, slots, item types | 10 KB |
| `uniques.json` | 983 unique items, one per line | 185 KB |
| `affixes.json` | 2,618 affixes (336 shown in stat lists), one per line | 558 KB |

One record per line, keys in numeric order, so a game update shows up as a diff of the changed
records only. Loaders join the files with `assembleMapping()` in `src/mapping.ts`.
Valid stats per slot = affix `arAllowedItemLabels` ∩ item type `arItemLabels`, filtered by class.

## Import
Rules that do not fit the slot model stay as raw rules (kept in tier position) and are listed in the UI.
Known: rules with a `uniques` + `item_types` pair, rarity masks other than 8, and a second rule for
the same slot stay raw. Multi-slot unique rules are split per slot (same behaviour).

## Stat lists
The mapping keeps every affix with item labels, so any affix ID in a filter resolves to a name. Stat
pickers show only affixes marked `rollable`: dwFlags bit `0x01` set, bit `0x80` clear (superseded
copies such as `Movement_Speed` vs `S04_Movement_Speed`), magic type 0 (not a legendary power), not
tempered, and not named `TEST_…`/`UNIQUE_…`. The flag meanings are inferred from the data. The rule
keeps all 29 affix IDs the two working filters use and cuts 2,618 affixes to 362 (Warlock boots:
163 → 37). Where labels still clash, the UI shows the internal name.

Past-season stats are hidden too (`hidden: "Season n stat"`): an `S<n>_` rollable stat with
4 < n < `CURRENT_SEASON` and dwFlags bit `0x04` set. Today that is the 26 `S12_KillStreak_*` stats
(Season 12's killstreak mechanic), leaving 336 stats. `S11_` stats stay: they lack bit `0x04`, match
the `S04_` base stats in every flag, and have Warlock-licensed copies (`S11_LifeOnKill_Warlock`), so
they were still being added after Season 11. Bit `0x04` alone is not enough: some base stats such as
`S04_CoreStats_All` carry it.

## Unique lists
Unique pickers show only items in the current season (`CURRENT_SEASON` in `tools/build_mapping.ts`,
now 15; update it each season and rebuild). Hidden items keep their entry, with a `hidden` reason,
so IDs in imported filters still resolve, and a hidden item a filter already uses still shows.

| Hidden | Rule | Count |
|---|---|---|
| placeholder or test item | no display name, `[PH]`, or `Boost`/`NoPowers` in the name | 67 |
| Season 10 chaos copy | `eForcedItemQualityModifier` 3 (e.g. `S10_Ring_Unique_Generic_100_Helm`) | 412 |
| Season n copy | `S<n>_` name with n < 15, when an older item has the same display name (ignoring a suffix such as ` (Crucible)`) and slot | 34 (S12, S14) |

Season items with no older copy stay shown, e.g. `S05_BSK_` items (Crown of Lucion) and `S15_` items.
`mythic` is `eMagicType` 4 (or `eForcedItemQualityModifier` 5 on a copy). Field meanings are inferred
from the data; drop tables did not help (d4data's reference index links no gear to treasure classes).

## Unverified
- Filter `class_id` is known only for warlock (6) and rogue (7). Other classes cannot compile.
- More than one affix (type 6) condition per rule (used for "required") is not in any real filter yet. Test in game.
- `ga_wanted` is written as `ga_required_on` pairs `[id, id]`, as in the Rogue filter. Their exact semantics are unverified.
- Display names exist for items only; affix names are prettified internal names.
