"""Thin wrapper over tools/filter_tool.ts (the single encoder/decoder), run with ts-node.

filter_tool.ts encode re-decodes its own output and refuses a string that does not match.
"""
import json, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TS_NODE = os.path.join(ROOT, "node_modules", ".bin", "ts-node")
TOOL = os.path.join(ROOT, "tools", "filter_tool.ts")
ENV = dict(os.environ, TS_NODE_TRANSPILE_ONLY="1")


def _run(cmd, data):
    p = subprocess.run([TS_NODE, TOOL, cmd, "-", "-"], input=data, capture_output=True, text=True, cwd=ROOT, env=ENV)
    if p.returncode:
        raise ValueError(p.stderr.strip().removeprefix("ERROR: "))
    return p.stdout


def encode(doc):
    return _run("encode", json.dumps(doc)).strip()


def decode(text):
    return json.loads(_run("decode", text))
