import type { Model } from "../compiler.ts";
import type { Update } from "./App.tsx";

/** Bottom of the centre pane: kept-as-is rules and import notes. */
export function Notes({ model, notes, update }: { model: Model; notes: string[]; update: Update }) {
  return (
    <section id="notes" aria-label="Notes">
      <h2>Kept as-is <small>(rules the editor cannot express)</small></h2>
      {model.raw.length ? (
        <ul>
          {model.raw.map((r, i) => (
            <li key={i}>{r.rule.name}{" "}
              <button onClick={() => update((d) => { d.raw.splice(i, 1); })}>remove</button>
            </li>
          ))}
        </ul>
      ) : <p className="muted">None.</p>}
      <h2>Import notes</h2>
      {notes.length ? <ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : <p className="muted">None.</p>}
    </section>
  );
}
