import { useState } from "react";
import { produce } from "immer";
import { decode, encode } from "../codec.ts";
import { compileModel, defaultModel, PROFILES, type Model, type ProfileName } from "../compiler.ts";
import { roundtrip } from "../importer.ts";
import { mapping } from "../mapping.ts";
import { Doll } from "./Doll.tsx";
import { SlotPanel } from "./SlotPanel.tsx";
import { Side } from "./Side.tsx";

// The owner's filters next to editor/, bundled as raw text at build time.
const BUNDLED = import.meta.glob<string>("../../../Loot Filters/*.txt", { query: "?raw", import: "default" });
const bundledName = (p: string) => p.split("/").pop()!;

export type Update = (fn: (m: Model) => void) => void;

export function App() {
  const m = mapping();
  const [model, setModel] = useState<Model>(() => defaultModel("warlock", "New Filter"));
  const [sel, setSel] = useState<string>(Object.keys(m.slots)[0]);
  const [notes, setNotes] = useState<string[]>([]);
  const [status, setStatus] = useState<{ msg: string; bad?: boolean }>({ msg: "" });
  const [paste, setPaste] = useState<string | null>(null);
  const update: Update = (fn) => setModel((cur) => produce(cur, fn));

  function load(text: string) {
    try {
      const doc = decode(text);
      const r = roundtrip(doc);
      const n = [...r.warnings, ...r.diffs.map((d) => "round-trip: " + d)];
      setModel(r.model);
      setNotes(n.length ? n : ["Imported cleanly."]);
      setStatus({ msg: `imported ${doc.rules.length} rules` });
      setPaste(null);
    } catch (e) {
      setStatus({ msg: (e as Error).message, bad: true });
    }
  }

  async function compile(profile: ProfileName) {
    try {
      const doc = compileModel(model, profile);
      const text = encode(doc); // throws if the round trip fails
      const what = `${doc.name}: ${doc.rules.length} rules, round-trip OK`;
      try {
        await navigator.clipboard.writeText(text);
        setStatus({ msg: `${what}, copied to clipboard` });
      } catch {
        window.prompt(`Copy the import string for ${doc.name}:`, text);
        setStatus({ msg: what });
      }
    } catch (e) {
      setStatus({ msg: (e as Error).message, bad: true });
    }
  }

  return (
    <>
      <header>
        <h1>D4 Slot Editor</h1>
        <label>Class{" "}
          <select value={model.class} onChange={(e) => { setModel(defaultModel(e.target.value, model.name)); setNotes([]); }}>
            {m.classes.map((c) => (
              <option key={c} value={c}>{c}{c in m.filter_class_id ? "" : " (class id unverified)"}</option>
            ))}
          </select>
        </label>
        <label>Name <input size={22} value={model.name} onChange={(e) => update((d) => { d.name = e.target.value; })} /></label>
        <label>Load{" "}
          <select value="" onChange={async (e) => { if (e.target.value) load(await BUNDLED[e.target.value]()); }}>
            <option value="">(existing filter)</option>
            {Object.keys(BUNDLED).map((p) => <option key={p} value={p}>{bundledName(p)}</option>)}
          </select>
        </label>
        <button onClick={() => setPaste(paste === null ? "" : null)}>Paste string</button>
        <label className="button">Open .txt{" "}
          <input type="file" accept=".txt,text/plain" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) load(await f.text());
            e.target.value = "";
          }} />
        </label>
        <button onClick={() => { setModel(defaultModel(model.class, model.name)); setNotes([]); }}>New</button>
        {PROFILES.map((p) => (
          <span key={p} className="export">
            <button className="primary" onClick={() => compile(p)}>Copy {p === "starter" ? "starter" : "end-game"}</button>
            <label title="End the filter with No Ma'am, which hides everything the rules above do not match">
              <input type="checkbox" checked={model.hide_rest[p]}
                onChange={(e) => update((d) => { d.hide_rest[p] = e.target.checked; })} /> hide the rest
            </label>
          </span>
        ))}
        <span id="status" className={status.bad ? "err" : "ok"}>{status.msg}</span>
      </header>
      {paste !== null && (
        <div className="paste">
          <textarea placeholder="Paste an in-game import string" value={paste} onChange={(e) => setPaste(e.target.value)} />
          <button onClick={() => load(paste)}>Import</button>
        </div>
      )}
      <main>
        <Doll model={model} sel={sel} onSelect={setSel} />
        <SlotPanel key={`${model.class}/${sel}`} slotKey={sel} model={model} update={update} />
        <Side model={model} notes={notes} update={update} />
      </main>
    </>
  );
}
