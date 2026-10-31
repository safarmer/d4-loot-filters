import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import metaUrl from "../../data/meta.json?url";
import uniquesUrl from "../../data/uniques.json?url";
import affixesUrl from "../../data/affixes.json?url";
import { assembleMapping, setMapping } from "../mapping.ts";
import { App } from "./App.tsx";
import "./style.css";

const root = createRoot(document.getElementById("root")!);
const get = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
});
Promise.all([get(metaUrl), get(uniquesUrl), get(affixesUrl)])
  .then(([meta, uniques, affixes]) => {
    setMapping(assembleMapping(meta, uniques, affixes));
    root.render(<StrictMode><App /></StrictMode>);
  })
  .catch((e: Error) => root.render(<p className="err">Could not load mapping: {e.message}</p>));
