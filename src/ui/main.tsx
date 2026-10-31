import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import mappingUrl from "../../data/mapping.json?url";
import { setMapping, type Mapping } from "../mapping.ts";
import { App } from "./App.tsx";
import "./style.css";

const root = createRoot(document.getElementById("root")!);
fetch(mappingUrl)
  .then((r) => r.json() as Promise<Mapping>)
  .then((m) => {
    setMapping(m);
    root.render(<StrictMode><App /></StrictMode>);
  })
  .catch((e: Error) => root.render(<p className="err">Could not load mapping: {e.message}</p>));
