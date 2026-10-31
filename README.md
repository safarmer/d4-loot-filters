# D4 Slot Editor

Character-sheet loot filter editor. Pick a class, click a paper-doll slot, pick uniques, legendaries
and stats (tick = desired, star = greater affix wanted on that stat) and a priority tier.

One model exports two filters; import both into the game and switch between them. Each slot has
one "desired stats needed" count (n) and one "greater affixes to recolour" count (ga):

| Filter | Recolour rule (checked first) | Show rule | Everything else |
|---|---|---|---|
| Starter | n desired stats (GA and ancestral ignored) | always | shown |
| End-game | ancestral + n desired + ga greater affixes | ancestral + n desired | hidden (`No Ma'am`) |

A slot turns on when its first item is picked (a unique, or "Legendaries count") and off when the
last is cleared; Charms do the same with wanted sets. Ticking stats alone does not change it, and the
Enabled box still works by hand.

All gear recolours share one colour. Charms (their own tile, below the gear) recolour set charms
of the wanted talisman sets in both filters: "Charm Set+Stats" (a wanted set with n desired charm
stats) before "Charm Set" (any charm of a wanted set), each with its own colour. The three colours
and the two "hide the rest" switches are global settings, in the collapsed Settings section at the
top of the right column.

Charms roll their own stats (`Talisman_Charm_*`, allowed on the Charm item label 71), not gear stats.
The charm stat list shows those with magic type 0 that can roll on legendary charms
(`dwAllowedQualityLevels` bit 8), minus `UNIQUE`/`TEST` ones: 55 for Warlock. The Warlock filter's
"Skill Set Charms" rule uses gear stat IDs (`X2_SkillRankBonus_Warlock_Category_*`, `S04_Life`), so
it probably never matches a charm (unverified); the editor marks them invalid in the charm list.

With ga 0 the end-game filter has no recolour rule; with no desired stats the starter has none. A
starred stat must be the greater affix in the end-game recolour (`ga_required_on`). Export encodes
through `src/codec.ts` (round-trip checked) and copies the string. Imports are read as end-game
filters: an ancestral recolour rule with a GA count sets n and ga, an ancestral show rule sets n.
Non-ancestral rules stay as raw rules. A slot imported with only a recolour rule gains its show rule
on export (the round trip lists it as added).

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

Stats are grouped under headers in one list: Core stats, Offence, Defence, Resistances, Resource,
Mobility, Utility, Skill ranks. The group comes from the affix `eCategory` (0 offence, 1 defence,
2 utility, 3 resource, 4 mobility; inferred) refined by skill tags: `Affix_SkillRankAny` → Skill ranks,
`Affix_CoreStat`/`Affix_FlatCoreStat` → Core stats, `Affix_Resistance*` → Resistances.

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
- Starred stats are written as `ga_required_on` pairs `[id, id]`, as in the Rogue filter. Their exact in-game meaning is unverified.
- Both filters use `slot_idx` 1. Whether the game needs different values to hold both at once is unverified.
- The star is drawn by the editor, not the game's greater affix icon (that would need extracting game textures).
- Display names exist for items only; affix names are prettified internal names.
