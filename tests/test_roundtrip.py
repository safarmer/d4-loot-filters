"""Run: python -m unittest discover tests  (from editor/)"""
import os, unittest
from d4editor.codec import decode, encode
from d4editor.compiler import compile_model, default_model, valid_affixes, mapping
from d4editor.importer import roundtrip

FILTERS = os.path.join(os.path.dirname(__file__), "..", "..", "Loot Filters")


class T(unittest.TestCase):
    def test_every_filter_id_resolves(self):
        m = mapping()
        for f in ("strict_warlock_bs", "roa_very_strict_rogue"):
            doc = decode(open(os.path.join(FILTERS, f + ".txt")).read())
            for r in doc["rules"]:
                for c in r["conditions"]:
                    for i in c.get("ids", []):
                        pool = {6: m["affixes"], 8: m["uniques"], 5: m["item_types"]}.get(c["type"])
                        if pool is not None:
                            self.assertIn(str(i), pool, f"{f}: {i}")

    def test_import_compile_encodes(self):
        for f in ("strict_warlock_bs", "roa_very_strict_rogue"):
            doc = decode(open(os.path.join(FILTERS, f + ".txt")).read())
            model, _, _ = roundtrip(doc)
            out = compile_model(model)
            self.assertEqual(out["rules"][-1]["name"], "No Ma'am")
            encode(out)

    def test_warlock_semantics_kept(self):
        # only the rules the importer splits per slot may differ
        doc = decode(open(os.path.join(FILTERS, "strict_warlock_bs.txt")).read())
        _, _, diffs = roundtrip(doc)
        self.assertEqual({d for d in diffs if d.startswith("lost")},
                         {"lost or changed: Weapon Good GA Uni", "lost or changed: Jewelry Good GA Uni"})

    def test_tier_order(self):
        m = default_model("warlock")
        for k, t in (("boots", 2), ("helm", 1)):
            m["slots"][k].update(enabled=True, tier=t, legendaries=True)
        names = [r["name"] for r in compile_model(m)["rules"]]
        self.assertEqual(names, ["Helm Leg", "Boots Leg", "No Ma'am"])

    def test_valid_affixes_by_slot(self):
        helm, boots = set(valid_affixes("helm", "warlock")), set(valid_affixes("boots", "warlock"))
        self.assertTrue(helm - boots and boots - helm)  # slot-specific stats differ
        self.assertIn(1829592, helm)  # S04_Life from the working filter
