// Diablo 4 loot filter tool: convert between the in-game import string and editable JSON.
//
// Usage (from editor/):
//   npm run filter -- decode <filter.txt> <filter.json>   import string -> JSON
//   npm run filter -- encode <filter.json> <filter.txt>   JSON -> import string (validated)
//   npm run filter -- check  <filter.txt>                 validate a string and list its rules
// Use "-" for a file to read stdin / write stdout (the summary then goes to stderr).
//
// Edit the JSON, never the base64 string. Encoding always re-validates by decoding the result
// and comparing it with the JSON, so a string this tool writes is structurally sound.
import { readFileSync, writeFileSync } from "fs";
import { decode, encode, summary, toJson } from "../src/codec.ts";

const read = (p: string) => readFileSync(p === "-" ? 0 : p, "utf8");
function write(p: string, s: string) {
  if (p === "-") process.stdout.write(s); else writeFileSync(p, s);
}

const [cmd, a, b] = process.argv.slice(2);
const log = (s: string) => (b === "-" ? process.stderr : process.stdout).write(s + "\n");
try {
  if (cmd === "decode" && a && b) {
    const doc = decode(read(a));
    write(b, toJson(doc)); log(summary(doc));
  } else if (cmd === "encode" && a && b) {
    const doc = JSON.parse(read(a));
    write(b, encode(doc) + "\n"); log(summary(doc)); log("\nOK: encoded and verified");
  } else if (cmd === "check" && a) {
    log(summary(decode(read(a)))); log("\nOK: valid");
  } else {
    console.log("usage: filter_tool.ts decode|encode|check <in> [out]");
    process.exit(1);
  }
} catch (e) {
  console.error("ERROR: " + (e as Error).message);
  process.exit(1);
}
