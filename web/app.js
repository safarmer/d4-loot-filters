"use strict";
const $ = (id) => document.getElementById(id);
const state = { map: null, model: null, sel: null, valid: {}, notes: [] };

async function call(path, body) {
  const r = await fetch(path, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) e.append(k);
  return e;
}
const status = (msg, bad) => { $("status").textContent = msg; $("status").className = bad ? "err" : "ok"; };
const colorCss = (c) => "#" + c.slice(4);
const tierColors = ["0xFFFFE000", "0xFF3366FF", "0xFF00FFF4", "0xFFE89922", "0xFFE8229F", "0xFF22E8CB", "0xFFD3E822", "0xFF4E8A20", "0xFFFFFFFF"];
const slotColor = (s) => s.color || tierColors[Math.min(s.tier, tierColors.length) - 1];

function uniqueName(id) {
  const u = state.map.uniques[id];
  return u ? (u.display || u.name) : "unverified " + id;
}
function affixName(id) {
  const a = state.map.affixes[id];
  return a ? a.label : "unverified " + id;
}

async function loadValid(slot) {
  const key = state.model.class + "/" + slot;
  if (!state.valid[key]) state.valid[key] = await call("/api/valid-affixes", { slot, class: state.model.class });
  return state.valid[key];
}

function renderDoll() {
  const doll = $("doll"); doll.replaceChildren();
  for (const [key, def] of Object.entries(state.map.slots)) {
    const s = state.model.slots[key];
    const b = el("button", { className: `slot ${key} ${s.enabled ? "on" : "off"} ${state.sel === key ? "sel" : ""}` });
    b.style.setProperty("--c", colorCss(slotColor(s)));
    b.style.gridArea = key;
    b.append(el("b", { textContent: def.label }),
      el("small", { textContent: s.enabled ? `tier ${s.tier} · ${s.uniques.length} uniques${s.legendaries ? " · legendaries" : ""}` : "off" }));
    b.onclick = () => { state.sel = key; render(); };
    doll.append(b);
  }
}

function renderSide() {
  const rows = [];
  for (const [k, s] of Object.entries(state.model.slots)) if (s.enabled) rows.push([s.tier, state.map.slots[k].label, slotColor(s)]);
  for (const r of state.model.raw) rows.push([r.tier, r.rule.name, r.rule.color]);
  rows.sort((a, b) => a[0] - b[0]);
  $("order").replaceChildren(...rows.map(([t, n, c]) => {
    const li = el("li"); const sw = el("span", { className: "sw" }); sw.style.background = colorCss(c);
    li.append(sw, `${n} `, el("small", { textContent: `(tier ${t})` })); return li;
  }), el("li", { textContent: "No Ma'am (hide all)" }));
  $("raw").replaceChildren(...state.model.raw.map((r, i) => {
    const li = el("li", { textContent: r.rule.name + " " });
    const rm = el("button", { textContent: "remove" });
    rm.onclick = () => { state.model.raw.splice(i, 1); render(); };
    li.append(rm); return li;
  }));
  $("notes").replaceChildren(...state.notes.map((n) => el("li", { textContent: n })));
}

function numInput(value, min, max, onchange) {
  const i = el("input", { type: "number", value, min, max, size: 3 }); i.style.width = "4.5em";
  i.onchange = () => onchange(Math.max(min, Math.min(max, +i.value || 0))); return i;
}

async function renderPanel() {
  const p = $("panel"); p.replaceChildren();
  const key = state.sel;
  if (!key) { p.append(el("p", { className: "muted", textContent: "Pick a slot." })); return; }
  const def = state.map.slots[key], s = state.model.slots[key], cls = state.model.class;
  const chk = (label, val, set) => { const c = el("input", { type: "checkbox", checked: val }); c.onchange = () => set(c.checked); return el("label", {}, c, " " + label); };
  const touch = () => { renderDoll(); renderSide(); };

  p.append(el("h2", { textContent: def.label }));
  const top = el("fieldset"); top.append(el("legend", { textContent: "Slot" }));
  const tier = el("select"); for (let t = 1; t <= 9; t++) tier.append(new Option(t, t, false, t === s.tier));
  tier.onchange = () => { s.tier = +tier.value; touch(); };
  const vis = el("select"); vis.append(new Option("recolour", 2, false, s.vis === 2), new Option("show", 0, false, s.vis === 0));
  vis.onchange = () => { s.vis = +vis.value; touch(); };
  const col = el("input", { type: "color", value: colorCss(slotColor(s)) });
  col.onchange = () => { s.color = "0xFF" + col.value.slice(1).toUpperCase(); touch(); };
  const reset = el("button", { textContent: "tier colour" }); reset.onclick = () => { s.color = null; col.value = colorCss(slotColor(s)); touch(); };
  top.append(el("div", { className: "row" },
    chk("Enabled", s.enabled, (v) => { s.enabled = v; touch(); }),
    el("label", {}, "Priority tier ", tier), el("label", {}, "Mode ", vis), el("label", {}, "Colour ", col), reset));
  p.append(top);

  const cond = el("fieldset"); cond.append(el("legend", { textContent: "Gear" }));
  cond.append(el("div", { className: "row" },
    chk("Legendaries count", s.legendaries, (v) => { s.legendaries = v; touch(); }),
    chk("Ancestral only", s.ancestral, (v) => { s.ancestral = v; }),
    el("label", {}, "Min greater affixes ", numInput(s.ga_min, 0, 4, (v) => { s.ga_min = v; }))));
  p.append(cond);

  // uniques
  const uf = el("fieldset"); uf.append(el("legend", { textContent: "Uniques to keep" }));
  const search = el("input", { placeholder: "filter…", size: 20 });
  const all = el("input", { type: "checkbox" }); all.title = "class only";
  const list = el("div", { className: "list" });
  const uniqs = Object.entries(state.map.uniques).filter(([, u]) => u.slot === key && (u.classes.includes(cls) || s.uniques.includes(+u.id)))
    .map(([id, u]) => ({ id: +id, name: u.display || u.name })).sort((a, b) => a.name.localeCompare(b.name));
  for (const id of s.uniques) if (!uniqs.some((u) => u.id === id)) uniqs.push({ id, name: uniqueName(id) });
  const drawU = () => {
    list.replaceChildren(...uniqs.filter((u) => u.name.toLowerCase().includes(search.value.toLowerCase())).map((u) => {
      const c = el("input", { type: "checkbox", checked: s.uniques.includes(u.id) });
      c.onchange = () => { s.uniques = c.checked ? [...s.uniques, u.id] : s.uniques.filter((x) => x !== u.id); touch(); };
      return el("label", {}, c, u.name);
    }));
  };
  search.oninput = drawU; drawU();
  uf.append(search, list); p.append(uf);

  // stats
  const sf = el("fieldset"); sf.append(el("legend", { textContent: "Stats (valid for this slot and class only)" }));
  const n = numInput(s.desired.n, 0, 6, (v) => { s.desired.n = v; });
  sf.append(el("div", { className: "row" }, el("label", {}, "Desired: need at least ", n, " of the desired/GA stats"),
    el("small", { textContent: `${s.required.length} required` })));
  const asearch = el("input", { placeholder: "filter stats…", size: 20 });
  const alist = el("div", { className: "list" }); alist.style.maxHeight = "320px";
  sf.append(asearch, alist); p.append(sf);

  const get = (id) => s.required.includes(id) ? "req" : s.ga_wanted.includes(id) ? "ga" : s.desired.affixes.includes(id) ? "des" : "";
  const put = (id, v) => {
    s.required = s.required.filter((x) => x !== id);
    s.ga_wanted = s.ga_wanted.filter((x) => x !== id);
    s.desired.affixes = s.desired.affixes.filter((x) => x !== id);
    if (v === "req") s.required.push(id);
    if (v === "des") s.desired.affixes.push(id);
    if (v === "ga") { s.desired.affixes.push(id); s.ga_wanted.push(id); }
    if (v && v !== "req" && s.desired.n === 0) { s.desired.n = 1; n.value = 1; }
  };
  const valid = await loadValid(key);
  if (state.sel !== key) return;
  const ids = [...new Set([...valid, ...s.required, ...s.desired.affixes])];
  const items = ids.map((id) => ({ id, name: affixName(id), ok: valid.includes(id) })).sort((a, b) => a.name.localeCompare(b.name));
  const drawA = () => {
    alist.replaceChildren(...items.filter((a) => a.name.toLowerCase().includes(asearch.value.toLowerCase())).map((a) => {
      const sel = el("select");
      for (const [v, t] of [["", "—"], ["des", "desired"], ["ga", "GA wanted"], ["req", "required"]]) sel.append(new Option(t, v, false, get(a.id) === v));
      sel.onchange = () => { put(a.id, sel.value); renderDoll(); };
      return el("div", { className: "affix", title: a.ok ? "" : "not valid for this slot" }, el("span", { className: "nm", textContent: a.name + (a.ok ? "" : " (invalid)") }), sel);
    }));
  };
  asearch.oninput = drawA; drawA();
}

function render() { $("fname").value = state.model.name; renderDoll(); renderSide(); renderPanel(); }

async function setModel(model, notes = []) {
  state.model = model; state.notes = notes; state.valid = {};
  $("cls").value = model.class;
  if (!state.sel || !state.map.slots[state.sel]) state.sel = Object.keys(state.map.slots)[0];
  render();
}

async function compile() {
  state.model.name = $("fname").value;
  try {
    const r = await call("/api/compile", { model: state.model });
    try { await navigator.clipboard.writeText(r.import_string); status(`${r.rules.length} rules, round-trip OK, copied to clipboard`); }
    catch { window.prompt("Copy the import string:", r.import_string); status(`${r.rules.length} rules, round-trip OK`); }
  } catch (e) { status(e.message, true); }
}

async function init() {
  state.map = await call("/api/mapping");
  for (const [id, u] of Object.entries(state.map.uniques)) u.id = +id;
  const known = Object.keys(state.map.filter_class_id);
  $("cls").append(...state.map.classes.map((c) => new Option(c + (known.includes(c) ? "" : " (class id unverified)"), c)));
  for (const f of await call("/api/filters")) $("files").append(new Option(f, f));
  $("cls").onchange = async () => setModel(await call("/api/default", { class: $("cls").value, name: $("fname").value }));
  $("new").onclick = $("cls").onchange;
  $("compile").onclick = compile;
  $("fname").oninput = () => { state.model.name = $("fname").value; };
  $("files").onchange = async () => {
    if (!$("files").value) return;
    try {
      const r = await call("/api/import", { file: $("files").value });
      const notes = [...r.warnings, ...r.diffs.map((d) => "round-trip: " + d)];
      if (!notes.length) notes.push("Imported cleanly.");
      await setModel(r.model, notes); status(`imported ${r.rules} rules`);
    } catch (e) { status(e.message, true); }
  };
  await setModel(await call("/api/default", { class: "warlock", name: "New Filter" }));
}
init().catch((e) => status(e.message, true));
