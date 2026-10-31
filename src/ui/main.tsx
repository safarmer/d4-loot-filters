import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { assembleMapping, setMapping, type Mapping, type MappingMeta } from "../mapping.ts";
import { App } from "./App.tsx";
import "./style.css";

const root = createRoot(document.getElementById("root")!);
// The data files are imported (not fetched), so they ship inside the JS: one request, and the
// single-file build (npm run build:single) needs no server for them.
Promise.all([import("../../data/meta.json"), import("../../data/uniques.json"), import("../../data/affixes.json")])
  .then(([meta, uniques, affixes]) => {
    setMapping(assembleMapping(meta.default as unknown as MappingMeta, uniques.default as unknown as Mapping["uniques"],
      affixes.default as unknown as Mapping["affixes"]));
    root.render(<StrictMode><App /></StrictMode>);
  })
  .catch((e: Error) => root.render(<p className="err">Could not load mapping: {e.message}</p>));
