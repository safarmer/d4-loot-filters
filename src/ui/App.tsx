import { useState } from "react";
import { produce } from "immer";
import { decode, encode } from "../codec.ts";
import { checkLimits, compileModel, defaultModel, MAX_RULES, PROFILE_LABEL, PROFILES, type Model, type ProfileName } from "../compiler.ts";
import { roundtrip } from "../importer.ts";
import { presetToModel, type Preset } from "../presets.ts";
import { mapping } from "../mapping.ts";
import { SlotPanel } from "./SlotPanel.tsx";
import { CharmPanel } from "./CharmPanel.tsx";
import { CHARMS, Doll } from "./Doll.tsx";
import { Side } from "./Side.tsx";
import { Notes } from "./Notes.tsx";

// The owner's filters next to editor/, bundled as raw text at build time.
const BUNDLED = import.meta.glob<string>("../../../Loot Filters/*.txt", { query: "?raw", import: "default" });
const bundledName = (p: string) => p.split("/").pop()!;
// Default filters from build guides (src/presets/*.json), in every build.
const PRESETS = import.meta.glob<Preset>("../presets/*.json", { eager: true, import: "default" });

export type Update = (fn: (m: Model) => void) => void;

export function App() {
  const m = mapping();
  const [model, setModel] = useState<Model>(() => defaultModel("warlock", "New Filter"));
  const [sel, setSel] = useState<string>(Object.keys(m.slots)[0]);
  const [notes, setNotes] = useState<string[]>([]);
  const [status, setStatus] = useState<{ msg: string; bad?: boolean }>({ msg: "" });
  const [paste, setPaste] = useState<string | null>(null);
  // when the clipboard is refused (some embedded views), show the string to copy by hand
  const [manual, setManual] = useState<{ name: string; text: string } | null>(null);
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

  function loadPreset(p: Preset) {
    try {
      setModel(presetToModel(p));
      setNotes([`Default filter from ${p.source}`]);
      setStatus({ msg: `loaded ${p.name}` });
      setPaste(null);
    } catch (e) {
      setStatus({ msg: (e as Error).message, bad: true });
    }
  }

  async function compile(profile: ProfileName) {
    try {
      setManual(null);
      const doc = compileModel(model, profile);
      // over the rule limit: refuse; other limit problems (an imported rule's unique count): warn
      if (doc.rules.length > MAX_RULES)
        throw new Error(`${doc.name}: ${doc.rules.length} rules, over the limit of ${MAX_RULES}. Remove items or kept-as-is rules.`);
      const warn = checkLimits(doc);
      const text = encode(doc); // throws if the round trip fails
      const what = `${doc.name}: ${doc.rules.length}/${MAX_RULES} rules, round-trip OK${warn.length ? `. Warning: ${warn.join("; ")}` : ""}`;
      try {
        await navigator.clipboard.writeText(text);
        setStatus({ msg: `${what}, copied to clipboard` });
      } catch {
        setManual({ name: doc.name ?? "filter", text });
        setStatus({ msg: `${what}. The clipboard is blocked here: copy the string below.` });
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
          <select value="" onChange={async (e) => {
            const v = e.target.value;
            if (PRESETS[v]) loadPreset(PRESETS[v]);
            else if (BUNDLED[v]) load(await BUNDLED[v]());
          }}>
            <option value="">(existing filter)</option>
            <optgroup label="Default filters">
              {Object.entries(PRESETS).map(([p, x]) => <option key={p} value={p}>{x.name}</option>)}
            </optgroup>
            {Object.keys(BUNDLED).length > 0 && <optgroup label="Your filters">
              {Object.keys(BUNDLED).map((p) => <option key={p} value={p}>{bundledName(p)}</option>)}
            </optgroup>}
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
        <span id="status" className={status.bad ? "err" : "ok"}>{status.msg}</span>
        <div className="exports">
          {PROFILES.map((p) => (
            <button key={p} className="primary" onClick={() => compile(p)}>Copy {PROFILE_LABEL[p]}</button>
          ))}
        </div>
      </header>
      {manual && (
        <div className="paste">
          <label>Import string for {manual.name} (select all, copy):
            <textarea readOnly value={manual.text} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <button onClick={() => setManual(null)}>Close</button>
        </div>
      )}
      {paste !== null && (
        <div className="paste">
          <textarea placeholder="Paste an in-game import string" value={paste} onChange={(e) => setPaste(e.target.value)} />
          <button onClick={() => load(paste)}>Import</button>
        </div>
      )}
      <main>
        <Doll model={model} sel={sel} onSelect={setSel} />
        <div className="center">
          {sel === CHARMS ? <CharmPanel key={`${model.class}/charms`} model={model} update={update} />
            : <SlotPanel key={`${model.class}/${sel}`} slotKey={sel} model={model} update={update} />}
          <Notes model={model} notes={notes} update={update} />
        </div>
        <Side model={model} sel={sel} update={update} />
      </main>
    </>
  );
}
