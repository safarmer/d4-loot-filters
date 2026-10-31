"""Thin wrapper over tools/filter_tool.ts (the single encoder/decoder), run by Node's built-in TypeScript support.

filter_tool.ts encode re-decodes its own output and refuses a string that does not match.
"""
import json, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOL = os.path.join(ROOT, "tools", "filter_tool.ts")


def _run(cmd, data):
    p = subprocess.run(["node", TOOL, cmd, "-", "-"], input=data, capture_output=True, text=True, cwd=ROOT)
    if p.returncode:
        raise ValueError(p.stderr.strip().removeprefix("ERROR: "))
    return p.stdout


def encode(doc):
    return _run("encode", json.dumps(doc)).strip()


def decode(text):
    return json.loads(_run("decode", text))
