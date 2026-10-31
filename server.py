#!/usr/bin/env python3
"""Local server for the slot editor. Python 3 stdlib only.

  python server.py [port]      then open http://127.0.0.1:8470

All encoding goes through ../Loot Filters/filter_tool.py (round-trip checked).
"""
import glob, json, os, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from d4editor.codec import decode, encode
from d4editor.compiler import compile_model, default_model, mapping, valid_affixes
from d4editor.importer import roundtrip

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, "web")
FILTERS = os.path.join(ROOT, "..", "Loot Filters")
TYPES = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json"}


def api(path, body):
    if path == "/api/mapping":
        return mapping()
    if path == "/api/filters":
        return sorted(os.path.basename(p) for p in glob.glob(os.path.join(FILTERS, "*.txt")))
    if path == "/api/default":
        return default_model(body.get("class", "warlock"), body.get("name", "New Filter"))
    if path == "/api/valid-affixes":
        return valid_affixes(body["slot"], body["class"], body.get("tempered", False))
    if path == "/api/import":
        text = body.get("text")
        if text is None:
            name = os.path.basename(body["file"])  # basename only: no path traversal
            with open(os.path.join(FILTERS, name)) as f:
                text = f.read()
        doc = decode(text)
        model, warnings, diffs = roundtrip(doc)
        return {"model": model, "warnings": warnings, "diffs": diffs, "rules": len(doc["rules"])}
    if path == "/api/compile":
        doc = compile_model(body["model"])
        text = encode(doc)  # raises if the round trip fails
        return {"import_string": text, "filter": doc,
                "rules": [{"name": r["name"], "vis": r["vis"], "color": r["color"], "enabled": r["enabled"],
                           "conditions": len(r["conditions"])} for r in doc["rules"]]}
    raise KeyError(path)


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, data, ctype="application/json"):
        raw = data if isinstance(data, bytes) else json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path.startswith("/api/"):
            return self._call(self.path, {})
        rel = "index.html" if self.path in ("/", "") else self.path.lstrip("/").split("?")[0]
        full = os.path.normpath(os.path.join(WEB, rel))
        if not full.startswith(WEB + os.sep) or not os.path.isfile(full):
            return self._send(404, {"error": "not found"})
        with open(full, "rb") as f:
            self._send(200, f.read(), TYPES.get(os.path.splitext(full)[1], "application/octet-stream"))

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return self._send(400, {"error": "bad json"})
        self._call(self.path, body)

    def _call(self, path, body):
        try:
            self._send(200, api(path, body))
        except KeyError as e:
            self._send(404, {"error": f"unknown: {e}"})
        except Exception as e:  # report to UI instead of dropping the connection
            self._send(400, {"error": str(e)})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8470
    print(f"http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
