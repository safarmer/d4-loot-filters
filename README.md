# D4 Slot Editor

Character-sheet loot filter editor. Pick a class, click a paper-doll slot, set uniques, legendaries,
stats (desired N-of, GA wanted, required) and a priority tier. Compile writes rules in tier order with
`No Ma'am` last, encodes through `tools/filter_tool.ts` (round-trip checked) and copies the string.

```
npm install                 # once: typescript, ts-node
python server.py            # http://127.0.0.1:8470
npm test                    # codec golden tests against the working filters
python -m unittest discover tests
npm run filter -- check|decode|encode <in> [out]
python tools/build_mapping.py <d4data>/json     # rebuild data/mapping.json
```

`src/codec.ts` is a port of the original `filter_tool.py`. Before that file was removed, both tools
were checked to give byte-identical output on both filters, an editor-compiled filter, and error cases.

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
