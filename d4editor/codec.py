"""Thin wrapper over ../Loot Filters/filter_tool.py (the single encoder/decoder).

filter_tool.encode re-decodes its own output and refuses a string that does not match.
"""
import importlib.util, os

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.environ.get("D4_FILTER_TOOL") or os.path.join(HERE, "..", "..", "Loot Filters", "filter_tool.py")

_spec = importlib.util.spec_from_file_location("filter_tool", TOOL)
filter_tool = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(filter_tool)


def encode(doc):
    return filter_tool.encode(doc)


def decode(text):
    return filter_tool.decode(text)
