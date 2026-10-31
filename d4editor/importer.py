"""Filter JSON -> slot model, with warnings for anything that does not fit.

Rules that do not fit stay in the model verbatim as raw rules (`pre` before the first slot
rule, `post` after), so compile(import(x)) keeps their behaviour. `roundtrip` compares the
two filters rule by rule.
"""
import copy
from .compiler import mapping, default_model, compile_model, UNIQUE_MASK, TIER_COLORS

SLOT_TYPES = {1, 2, 4, 5, 6, 8}


def _class_from_id(class_id):
    for c, i in mapping()["filter_class_id"].items():
        if i == class_id:
            return c
    return None


def _affix_parts(conds, s, warn, rname):
    t6 = [c for c in conds if c["type"] == 6]
    if len(t6) > 2:
        return False
    for c in t6:
        pairs = c.get("ga_required_on", [])
        if any(a != b for a, b in pairs):
            warn.append(f"{rname}: GA pair with different ids, kept raw")
            return False
        if len(t6) == 2 and not pairs and c["value"] == len(c["ids"]) and not s["required"]:
            s["required"] = list(c["ids"])
        else:
            if s["desired"]["affixes"]:
                return False
            s["desired"] = {"n": c["value"], "affixes": list(c["ids"])}
            s["ga_wanted"] = [a for a, _ in pairs]
    return True


def _classify(rule, m):
    """Return ('uni'|'leg', slot_keys) or None."""
    conds = rule["conditions"]
    types = [c["type"] for c in conds]
    if not conds or set(types) - SLOT_TYPES or not rule["enabled"] or rule["vis"] == 3:
        return None
    if any(types.count(t) > 1 for t in (1, 2, 4, 5, 8)):
        return None
    by = {c["type"]: c for c in conds}
    if 8 in by and 5 not in by:
        slots = {m["uniques"].get(str(i), {}).get("slot") for i in by[8]["ids"]}
        if None in slots or "charm" in slots:
            return None
        if 1 in by and by[1]["value"] & ~UNIQUE_MASK:
            return None
        return "uni", sorted(slots)
    if 5 in by and 8 not in by and 1 in by and by[1]["value"] & 8:
        slots = {m["item_types"].get(str(i), {}).get("slot") for i in by[5]["ids"]}
        if None in slots or len(slots) != 1:
            return None
        return "leg", sorted(slots)
    return None


def import_filter(doc):
    m = mapping()
    warnings = []
    cls = _class_from_id(doc["class_id"])
    if cls is None:
        warnings.append(f"class_id {doc['class_id']} is unverified; defaulting to warlock")
        cls = "warlock"
    model = default_model(cls, doc["name"] or "Imported")
    model["slot_idx"] = doc.get("slot_idx", 1)
    seen = set()       # (slot, kind) already modelled
    tier = 0

    for idx, rule in enumerate(doc["rules"]):
        if idx == len(doc["rules"]) - 1 and rule["vis"] == 3 and not rule["conditions"]:
            continue  # No Ma'am: compiler appends it
        cl = _classify(rule, m)
        if cl is None:
            model["raw"].append({"tier": tier + 0.5, "rule": rule})
            continue
        kind, slots = cl
        by = {c["type"]: c for c in rule["conditions"]}
        probe = {"required": [], "desired": {"n": 0, "affixes": []}, "ga_wanted": []}
        why = None
        if not _affix_parts(rule["conditions"], probe, warnings, rule["name"]):
            why = "affix layout does not fit"
        elif any((sk, kind) in seen for sk in slots):
            why = "a slot already has a " + kind + " rule"
        elif 2 in by and by[2]["value"] != 4:
            why = f"property {by[2]['value']} is not ancestral"
        elif kind == "leg" and by[1]["value"] != 8:
            why = f"rarity mask {by[1]['value']} is not plain legendary (8)"
        if why:
            warnings.append(f"{rule['name']}: {why}, kept as raw rule")
            model["raw"].append({"tier": tier + 0.5, "rule": rule})
            continue
        if len(slots) > 1:
            warnings.append(f"{rule['name']}: uniques span slots {slots}; split into one rule per slot")
        tier += 1
        for sk in slots:
            s = model["slots"][sk]
            first = not s["enabled"]
            if first:
                s.update(enabled=True, tier=tier, vis=rule["vis"],
                         color=rule["color"] if rule["vis"] == 2 and rule["color"] != "0x00000000" else None,
                         ancestral=2 in by, ga_min=by[4]["value"] if 4 in by else 0,
                         required=probe["required"], desired=probe["desired"], ga_wanted=probe["ga_wanted"])
            elif (probe["required"], probe["desired"], probe["ga_wanted"]) != (s["required"], s["desired"], s["ga_wanted"]) \
                    or (2 in by) != s["ancestral"] or (by[4]["value"] if 4 in by else 0) != s["ga_min"]:
                # different settings for the same slot: cannot share one slot config
                warnings.append(f"{rule['name']}: settings differ from slot {sk}'s other rule, kept as raw rule")
                model["raw"].append({"tier": tier - 0.5, "rule": rule})
                break
            if kind == "uni":
                s["uniques"] = [i for i in by[8]["ids"] if m["uniques"][str(i)]["slot"] == sk]
            else:
                s["legendaries"] = True
                s["leg_rarity"] = by[1]["value"]
            seen.add((sk, kind))
    return model, warnings


def _norm(rule):
    r = copy.deepcopy(rule)
    for c in r["conditions"]:
        if "ids" in c:
            c["ids"] = sorted(c["ids"])
        if "ga_required_on" in c:
            c["ga_required_on"] = sorted(c["ga_required_on"])
    r["conditions"] = sorted(r["conditions"], key=lambda c: (c["type"], c.get("ids", [])))
    r.pop("name")
    return r


def roundtrip(doc):
    """Compare original vs compile(import(original)); returns (model, warnings, diffs)."""
    model, warnings = import_filter(doc)
    out = compile_model(model)
    strip = lambda rs: [r for r in rs if not (r["vis"] == 3 and not r["conditions"])]
    a = [_norm(r) for r in strip(doc["rules"])]
    b = [_norm(r) for r in strip(out["rules"])]
    diffs = []
    pool = list(b)
    for r in strip(doc["rules"]):
        n = _norm(r)
        if n in pool:
            pool.remove(n)
        else:
            diffs.append(f"lost or changed: {r['name']}")
    for r in strip(out["rules"]):
        if _norm(r) in pool:
            diffs.append(f"added: {r['name']}")
            pool.remove(_norm(r))
    if not diffs and a != b:
        diffs.append("same rules, different order")
    return model, warnings, diffs
