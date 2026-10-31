"""Slot model -> filter JSON (the structure tools/filter_tool.ts encodes).

Model:
  {"name", "class", "slot_idx", "raw": [{"tier": float, "rule": raw rule}],
   "slots": {slot_key: SlotConfig}}
SlotConfig:
  enabled, tier (lower = earlier), vis (0 show, 2 recolour), color (None = tier palette),
  uniques [ids], legendaries bool, leg_rarity (8), ancestral bool, ga_min int,
  required [affix ids], desired {"n", "affixes"}, ga_wanted [affix ids, subset of desired]
Rules come out in tier order, `No Ma'am` last.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
TIER_COLORS = ["0xFFFFE000", "0xFF3366FF", "0xFF00FFF4", "0xFFE89922", "0xFFE8229F",
               "0xFF22E8CB", "0xFFD3E822", "0xFF4E8A20", "0xFFFFFFFF"]
UNIQUE_MASK = 48  # unique + mythic
HIDE_ALL = {"name": "No Ma'am", "vis": 3, "color": "0x00000000", "enabled": 1, "conditions": []}

_mapping = None


def mapping():
    global _mapping
    if _mapping is None:
        with open(os.path.join(HERE, "..", "data", "mapping.json")) as f:
            _mapping = json.load(f)
    return _mapping


def default_slot(tier=1):
    return {"enabled": False, "tier": tier, "vis": 2, "color": None, "uniques": [],
            "legendaries": False, "leg_rarity": 8, "ancestral": True, "ga_min": 1,
            "required": [], "desired": {"n": 0, "affixes": []}, "ga_wanted": []}


def default_model(cls="warlock", name="New Filter"):
    m = mapping()
    return {"name": name, "class": cls, "slot_idx": 1, "raw": [],
            "slots": {k: default_slot(i + 1) for i, k in enumerate(m["slots"])}}


def slot_item_types(slot_key, cls):
    m = mapping()
    ids = m["slots"][slot_key]["item_types"]
    return [i for i in ids if cls in m["item_types"][str(i)]["classes"]] or ids


def valid_affixes(slot_key, cls, tempered=False):
    """Affix ids that can roll on this slot for this class."""
    m = mapping()
    labels = set(m["slots"][slot_key]["labels"])
    return sorted(int(i) for i, a in m["affixes"].items()
                  if labels & set(a["labels"]) and cls in a["classes"] and (tempered or not a["tempered"]))


def _affix_conditions(s):
    conds = []
    if s["required"]:
        conds.append({"type": 6, "kind": "affixes", "ids": list(s["required"]), "value": len(s["required"])})
    d = s["desired"]
    ids = list(d["affixes"])
    ga = [g for g in s["ga_wanted"]]
    for g in ga:
        if g not in ids:
            ids.append(g)
    if ids and d["n"] > 0:
        c = {"type": 6, "kind": "affixes", "ids": ids, "value": min(d["n"], len(ids))}
        if ga:
            c["ga_required_on"] = [[g, g] for g in ga]
        conds.append(c)
    return conds


def _common(s):
    conds = []
    if s["ancestral"]:
        conds.append({"type": 2, "kind": "property", "value": 4})
    if s["ga_min"] > 0:
        conds.append({"type": 4, "kind": "greater_affixes", "value": s["ga_min"], "flag": 1})
    return conds + _affix_conditions(s)


def slot_rules(key, s, cls, label):
    color = s["color"] or TIER_COLORS[min(s["tier"], len(TIER_COLORS)) - 1]
    out = []

    def rule(name, conds):
        out.append({"name": name, "vis": s["vis"], "color": color, "enabled": 1, "conditions": conds})

    if s["uniques"]:
        rule(f"{label} Uni",
             [{"type": 1, "kind": "rarity", "value": UNIQUE_MASK}] + _common(s)
             + [{"type": 8, "kind": "uniques", "ids": list(s["uniques"])}])
    if s["legendaries"]:
        rule(f"{label} Leg",
             [{"type": 1, "kind": "rarity", "value": s["leg_rarity"]}] + _common(s)
             + [{"type": 5, "kind": "item_types", "ids": slot_item_types(key, s.get("_cls", cls))}])
    return out


def compile_model(model):
    m = mapping()
    cls = model["class"]
    order = list(m["slots"])
    items = [(s["tier"], 1, order.index(k), k, s) for k, s in model["slots"].items() if s["enabled"]]
    items += [(r["tier"], 0, i, None, r["rule"]) for i, r in enumerate(model["raw"])]
    rules = []
    for _, _, _, k, s in sorted(items, key=lambda t: t[:3]):
        rules += [s] if k is None else slot_rules(k, s, cls, m["slots"][k]["label"].replace(" (x2)", ""))
    rules.append(dict(HIDE_ALL))
    cid = m["filter_class_id"].get(cls)
    if cid is None:
        raise ValueError(f"filter class_id for {cls} is unverified; import one of its filters first")
    return {"name": model["name"], "class_id": cid, "slot_idx": model.get("slot_idx", 1), "rules": rules}
