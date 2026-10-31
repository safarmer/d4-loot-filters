// Local server for the slot editor. Node 24+, no build step.
//
//   node server.ts [port]      then open http://127.0.0.1:8470
//
// All encoding goes through src/codec.ts (round-trip checked).
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readdirSync, readFileSync, statSync } from "fs";
import { basename, extname, join, normalize, sep } from "path";
import { decode, encode } from "./src/codec.ts";
import { compileModel, defaultModel, validAffixes } from "./src/compiler.ts";
import { roundtrip } from "./src/importer.ts";
import { mapping } from "./src/mapping.ts";

const ROOT = import.meta.dirname;
const WEB = join(ROOT, "web");
const FILTERS = join(ROOT, "..", "Loot Filters");
const TYPES: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
};

class NotFound extends Error {}

function api(path: string, body: any): unknown {
  switch (path) {
    case "/api/mapping": return mapping();
    case "/api/filters": return readdirSync(FILTERS).filter((f) => f.endsWith(".txt")).sort();
    case "/api/default": return defaultModel(body.class ?? "warlock", body.name ?? "New Filter");
    case "/api/valid-affixes": return validAffixes(body.slot, body.class, body.tempered ?? false);
    case "/api/import": {
      // basename only: no path traversal
      const text: string = body.text ?? readFileSync(join(FILTERS, basename(body.file)), "utf8");
      const doc = decode(text);
      return { ...roundtrip(doc), rules: doc.rules.length };
    }
    case "/api/compile": {
      const doc = compileModel(body.model);
      const text = encode(doc); // throws if the round trip fails
      return {
        import_string: text, filter: doc,
        rules: doc.rules.map((r) => ({ name: r.name, vis: r.vis, color: r.color, enabled: r.enabled, conditions: r.conditions.length })),
      };
    }
  }
  throw new NotFound(path);
}

function send(res: ServerResponse, code: number, data: unknown, type = "application/json") {
  const raw = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
  res.writeHead(code, { "Content-Type": type, "Content-Length": raw.length, "Cache-Control": "no-store" });
  res.end(raw);
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  if (path.startsWith("/api/")) {
    let body: any;
    try { body = req.method === "POST" ? await readBody(req) : {}; }
    catch { return send(res, 400, { error: "bad json" }); }
    try { return send(res, 200, api(path, body)); }
    catch (e) {
      // report to UI instead of dropping the connection
      return send(res, e instanceof NotFound ? 404 : 400, { error: e instanceof NotFound ? `unknown: ${path}` : (e as Error).message });
    }
  }
  const full = normalize(join(WEB, path === "/" ? "index.html" : path));
  try {
    if (!full.startsWith(WEB + sep) || !statSync(full).isFile()) throw new Error();
    send(res, 200, readFileSync(full), TYPES[extname(full)] ?? "application/octet-stream");
  } catch {
    send(res, 404, { error: "not found" });
  }
});

const port = Number(process.argv[2] ?? 8470);
server.listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}`));
