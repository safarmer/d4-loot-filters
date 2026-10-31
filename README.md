# D4 Slot Editor

Character-sheet loot filter editor. Pick a class, click a paper-doll slot, pick uniques, legendaries
and stats (tick = desired, star = greater affix wanted on that stat).

One model exports two filters; import both into the game and switch between them. Each slot has
one "desired stats needed" count (n) and one "greater affixes to recolour" count (ga):

| Filter | Recolour rule (checked first) | Show rule |
|---|---|---|
| Starter | n desired stats (GA and ancestral ignored) | always |
| End-game | ancestral + n desired + ga greater affixes | ancestral + n desired |

Both filters end with `No Ma'am` (hide the rest); the player can switch it off in game.

Limits (owner's): at most 25 rules per filter and 10 uniques per uniques condition. A slot takes at
most 10 unique picks; export refuses a filter over 25 rules and warns about a kept-as-is rule with
more than 10 uniques (Strict Warlock BS's "Build Unique Charms" has 11 and imports fine in game). No
stat limit is known; working rules use up to 12 stats. The right column shows both rule counts.

To stay under the limit, gear rules merge across slots where that cannot change what matches: same
kind, level, ancestral, GA count, required and starred stats and stat count, and the combined stat
list only adds, for each slot, stats that cannot roll on that slot. Starter "show always" rules
merge across all slots. Uniques go in rules of at most 10. Names: "Helm Uni", "Amulet/Ring Uni",
"Gear Uni 1".

Before Mythics: starter has "All Ancestral" (show, on) and end-game "Any 2GA+ Ancestral" (show,
off), for toggling in game. Imported copies of these are replaced by them.

Rule order is fixed, not chosen. A rule sits above another only where that changes what matches
(first match wins): inside a section, strong recolour before recolour before show, since those rules
cover the same items. Sections cover different items (charms, each gear slot; uniques vs legendaries
by rarity), so they keep a natural order: kept-as-is rules imported before any modelled rule,
charms, gear slots, kept-as-is rules imported after, Mythics, `No Ma'am`. Mythics (show rarity
32, always added; switch it off in game if wanted) comes last so the unique recolour rules, whose
rarity 48 includes mythic, match mythics first. A plain show-mythics rule in an imported filter is
replaced by it. The Order list in the right column
shows the end-game output.

A slot turns on when its first item is picked (a unique, or "Include Legendary") and off when the
last is cleared; Charms do the same with wanted sets. Ticking the first stat while no unique is picked turns
"Include Legendary" on; picking the first unique turns it off. Both act only on that first pick, so
the box can be changed by hand afterwards. Ticking stats alone does not change it, and the
Enabled box still works by hand.

All gear recolours share one colour. Below the divider is one Charms tile. Its panel has three
columns: unique charms (at most 10), wanted sets, and charm stats (checkbox = desired).
Uniques and sets share the "desired stats needed" setting. Rules, the same in both filters,
strongest first: "Unique Charms+Stats", "Unique Charms", "Charm Set+Stats", "Charm Set", then
"Charms/Seals for Mats" (shows every legendary-or-better charm and seal, rarity 120, so other unique
and set charms show uncoloured). There are no greater-affix rules for charms, to save rules; an
imported charm rule with a greater-affix condition is dropped with a note. "+Stats" needs n of the
desired stats. The colours (gear; charm +Stats, picked unique, wanted set) are global settings, in
the collapsed Settings section at the top of the right column.

Charms roll their own stats (`Talisman_Charm_*`, allowed on the Charm item label 71), not gear stats.
The charm stat list shows those with magic type 0 that can roll on legendary charms
(`dwAllowedQualityLevels` bit 8), minus `UNIQUE`/`TEST` ones: 55 for Warlock. The Warlock filter's
charm rules used gear stat IDs until 2026-10-31; they now use `Talisman_Charm_*` ones. The Rogue
reference filter still has gear stats in its charm rule.

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
npm run build:single         # one HTML file with everything inlined: dist-single/editor.html (used for the artifact)
npm test                    # Vitest: codec golden tests + slot model tests
npm run typecheck           # tsc (TypeScript 7, checks .ts and .tsx)
npm run filter -- check|decode|encode <in> [out]   # command-line codec (Node)
npm run build-mapping -- <d4data>/json             # offline: rebuild data/*.json (Node)
```

The data files are imported into the JS bundle (no fetch), so `build:single` can fold the app, data
and bundled filters into one HTML page fragment (about 1 MB). If the browser refuses clipboard writes
(some embedded views), export shows the import string in a text box to copy by hand.

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

## Unique hover card
Hovering (or focusing) a unique in a pick list shows its power, fixed stats and flavour text. The
mapping keeps these for shown uniques: power from the unique affix's `Desc` string, cleaned to plain
text (the non-mythic wording; value slots as `#` or `#%`, since the numbers roll on the item),
fixed stats from the item's other forced affixes, flavour from the item's `Flavor` string.

## Import
Imports are an improved presentation, not the source of truth (the saved filter never changes), so
rules are cleaned to fit where the intent is clear, each with an import note:
- an "all unique charms" recolour is dropped (the materials rule shows those charms);
- gear unique IDs in a charm-type uniques rule are removed (they can never match);
- a legendary rule with a greater affix condition and rarity 14 becomes rarity 8 (greater affixes
  only roll on legendary or better);
- gear recolours adopt the shared gear colour; a mythics-only rule becomes the fixed Mythics rule,
  and a codex-upgrade rule the fixed Codex Upgrades rule (always first: recolour red).
Rules that do not fit the slot model stay as raw rules, before or after the modelled rules as imported,
and are listed in the UI. A raw rule that sat between modelled rules gets a warning, because moving it
after them could change what matches first.
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
