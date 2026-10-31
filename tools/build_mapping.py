#!/usr/bin/env python3
"""Build data/mapping.json from a d4data checkout (files only).

Usage: python tools/build_mapping.py <d4data/json dir> [out.json]

Reads, from <json dir>:
  base/meta/ItemType/*.itt.json   slot -> item type id, item labels
  base/meta/Item/*.itm.json       unique items (type, class, forced affixes)
  base/meta/Affix/*.aff.json      affix labels (which slots it can roll on), classes
  enUS_Text/meta/StringList/      display names
Source: https://github.com/DiabloTools/d4data (extracted game files). Never game memory or network.
"""
import glob, json, os, re, sys

# d4data class order (index of fUsableByClass / fAllowedForPlayerClass). Checked against item
# types: Bow->rogue(3), Scythe->necromancer(4), Glaive->spiritborn(5), Focus->sorc/necro/warlock.
CLASSES = ["sorcerer", "druid", "barbarian", "rogue", "necromancer", "spiritborn", "paladin", "warlock"]
# Filter-file class_id values seen in real filters. Others are unverified, so left out.
FILTER_CLASS_ID = {"warlock": 6, "rogue": 7}

# Paper-doll slots -> d4data ItemType names.
SLOTS = [
    ("helm", "Helm", ["Helm"]),
    ("chest", "Chest", ["ChestArmor"]),
    ("gloves", "Gloves", ["Gloves"]),
    ("pants", "Pants", ["Legs"]),
    ("boots", "Boots", ["Boots"]),
    ("amulet", "Amulet", ["Amulet"]),
    ("ring", "Ring (x2)", ["Ring"]),
    ("weapon", "Weapon", ["Axe", "Axe2H", "Axe_Berserker_Axe", "Bow", "Crossbow", "Crossbow2H",
                          "Dagger", "Flail", "Glaive", "Mace", "Mace2H", "Mace2HDruid", "Polearm",
                          "Quarterstaff", "Scythe", "Scythe2H", "Staff", "StaffDruid",
                          "StaffSorcerer", "Sword", "Sword2H", "Sword_Phase_Blade", "Wand",
                          "Amazon_Spear"]),
    ("offhand", "Offhand", ["Focus", "FocusBookOffHand", "OffHandTotem", "Shield", "ShieldHTH",
                            "DaggerOffHand", "Amazon_Shield"]),
]


def load(path):
    with open(path) as f:
        return json.load(f)


def pretty(name):
    n = re.sub(r"^(S\d+|X\d+|T\d+)_", "", name)
    n = n.replace("_", " ")
    return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", n).strip()


def display(strings_dir, prefix, name):
    p = os.path.join(strings_dir, f"{prefix}_{name}.stl.json")
    if not os.path.exists(p):
        return None
    for e in load(p)["arStrings"]:
        if e["szLabel"] == "Name":
            return e["szText"]
    return None


def main(argv):
    if len(argv) < 2:
        sys.exit(__doc__)
    root = argv[1]
    out = argv[2] if len(argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "data", "mapping.json")
    meta = os.path.join(root, "base", "meta")
    strings = os.path.join(root, "enUS_Text", "meta", "StringList")

    itypes = {}
    for f in glob.glob(os.path.join(meta, "ItemType", "*.itt.json")):
        d = load(f)
        itypes[os.path.basename(f)[:-9]] = d

    slots, type_slot = {}, {}
    for key, label, names in SLOTS:
        ids, labels = [], set()
        for n in names:
            if n not in itypes:
                continue
            d = itypes[n]
            ids.append(d["__snoID__"])
            labels.update(d["arItemLabels"])
            type_slot[d["__snoID__"]] = key
        slots[key] = {"label": label, "item_types": sorted(ids), "labels": sorted(labels)}
    item_types = {str(i["__snoID__"]): {"name": n, "slot": type_slot.get(i["__snoID__"]),
                                       "classes": [c for c, v in zip(CLASSES, i["fUsableByClass"]) if v]}
                  for n, i in itypes.items() if i["__snoID__"] in type_slot or n in ("Charm", "HoradricSeal")}

    uniques = {}
    for f in glob.glob(os.path.join(meta, "Item", "*_Unique_*.itm.json")):
        d = load(f)
        t = d["snoItemType"]
        if not t:
            continue
        tid = t["__raw__"]
        slot = type_slot.get(tid)
        is_charm = tid == 2288901
        if not slot and not is_charm:
            continue
        name = os.path.basename(f)[:-9]
        uniques[str(d["__snoID__"])] = {
            "name": name,
            "display": display(strings, "Item", name),
            "slot": slot or "charm",
            "item_type": tid,
            "classes": [c for c, v in zip(CLASSES, d["fUsableByClass"]) if v],
            "season_item": bool(d.get("bSeasonItem")),
            "mythic": d.get("eMagicType") == 5 or "Mythic" in name,
        }

    affixes = {}
    for f in glob.glob(os.path.join(meta, "Affix", "*.aff.json")):
        d = load(f)
        if not d["arAllowedItemLabels"]:
            continue
        name = os.path.basename(f)[:-9]
        affixes[str(d["__snoID__"])] = {
            "name": name,
            "label": pretty(name),
            "labels": sorted(d["arAllowedItemLabels"]),
            "classes": [c for c, v in zip(CLASSES, d["fAllowedForPlayerClass"]) if v],
            "tempered": bool(d["bIsTemperedAffix"]),
            "magic_type": d["eMagicType"],
        }

    mapping = {
        "source": "DiabloTools/d4data json (files only)",
        "classes": CLASSES,
        "filter_class_id": FILTER_CLASS_ID,
        "slots": slots,
        "item_types": item_types,
        "uniques": uniques,
        "affixes": affixes,
        "charm_type": 2288901,
        "seal_type": 2326144,
    }
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w") as f:
        json.dump(mapping, f, separators=(",", ":"), sort_keys=True)
    print(f"slots {len(slots)}  item_types {len(item_types)}  uniques {len(uniques)}  affixes {len(affixes)} -> {out}")


if __name__ == "__main__":
    main(sys.argv)
