import { SUPABASE_URL, SUPABASE_ANON_KEY, EDITOR_PIN } from "./config.js";

/* ------------------------------------------------------------------ *
 *  Editor parkovišť — samostatný nástroj (NENÍ ve veřejné appce).
 *  Nakreslíš/upravíš parkoviště na mapě a uložíš do databáze (Supabase),
 *  případně vyexportuješ/naimportuješ jako JSON soubor.
 *
 *  Editor NEPŘEPISUJE živé počty aut — ukládá jen geometrii, název,
 *  kapacitu a příznak "spodní cesta".
 * ------------------------------------------------------------------ */

const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
let supabase = null;
let remoteOk = false;

const LS_KEY = "tabor_parking_spots_v1";

/** Pracovní kopie parkovišť (edituje se lokálně, ukládá se najednou). */
let working = [];
/** ID parkovišť, která existují v DB (kvůli mazání odebraných při uložení). */
let originalIds = new Set();
let selectedId = null;
let dirty = false;

/* ---------- DOM ---------- */
const el = {};
[
  "connStatus", "overlay", "mapWrap",
  "saveDb", "exportBtn", "importBtn", "reloadBtn", "importFile", "dirtyState",
  "propPanel", "propTitle", "pName", "pMax", "pLower", "pDelete", "pDone", "deselect",
  "pinGate", "pinInput", "pinOk", "pinErr", "toast",
].forEach((id) => (el[id] = document.getElementById(id)));

/* ---------- Pomocné ---------- */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const show = (n) => n.classList.remove("hidden");
const hide = (n) => n.classList.add("hidden");

let toastTimer = null;
function toast(msg) {
  el.toast.textContent = msg;
  show(el.toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hide(el.toast), 2400);
}
function setConn(kind, text) {
  el.connStatus.className = "conn-badge " + kind;
  el.connStatus.textContent = text;
}
function markDirty() {
  dirty = true;
  el.dirtyState.textContent = "● Neuložené změny";
  el.dirtyState.className = "dirty-state dirty";
}
function markClean() {
  dirty = false;
  el.dirtyState.textContent = "Uloženo";
  el.dirtyState.className = "dirty-state clean";
}

/* ---------- Data ---------- */
async function fetchFromDb() {
  const { data, error } = await supabase
    .from("parking_spots")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) { console.error(error); return null; }
  return data || [];
}

function setWorking(rows) {
  working = rows.map((s) => ({ ...s }));
  originalIds = new Set(rows.map((s) => s.id));
  selectedId = null;
  hide(el.propPanel);
  render();
}

/* ---------- Vykreslení ---------- */
function render() {
  el.overlay.innerHTML = "";
  for (const s of working) {
    const d = document.createElement("div");
    const selected = s.id === selectedId;
    d.className = "spot " + (s.is_lower ? "warn" : "free") + (selected ? " selected-edit" : "");
    d.dataset.id = s.id;
    d.style.left = s.x * 100 + "%";
    d.style.top = s.y * 100 + "%";
    d.style.width = s.w * 100 + "%";
    d.style.height = s.h * 100 + "%";
    d.innerHTML =
      `<span class="spot-name">${escapeHtml(s.name)}</span>` +
      `<span class="spot-count">max ${toInt(s.max_cars)}${s.is_lower ? " · dole" : ""}</span>`;
    if (selected) {
      const h = document.createElement("div");
      h.className = "handle";
      d.appendChild(h);
    }
    el.overlay.appendChild(d);
  }
}

/* ---------- Výběr + panel vlastností ---------- */
function selectSpot(id) {
  selectedId = id;
  const s = working.find((x) => x.id === id);
  if (!s) { hide(el.propPanel); return; }
  el.propTitle.textContent = s.name || "Parkoviště";
  el.pName.value = s.name || "";
  el.pMax.value = toInt(s.max_cars);
  el.pLower.checked = !!s.is_lower;
  show(el.propPanel);
  document.body.classList.add("panel-open");
  render();
  // odrolovat vybrané parkoviště nad panel, ať je vždy přístupné (i pro úchyt)
  const node = el.overlay.querySelector(`.spot[data-id="${id}"]`);
  if (node) node.scrollIntoView({ block: "center" });
}
function deselect() {
  selectedId = null;
  hide(el.propPanel);
  document.body.classList.remove("panel-open");
  render();
}
function selectedSpot() {
  return working.find((x) => x.id === selectedId);
}

/* ---------- Interakce s mapou (kreslení / přesun / velikost) ---------- */
let mode = null; // 'draw' | 'move' | 'resize'
let start = null; // {fx, fy, orig}
let tempNode = null;

function relCoords(e) {
  const r = el.overlay.getBoundingClientRect();
  return {
    fx: clamp((e.clientX - r.left) / r.width, 0, 1),
    fy: clamp((e.clientY - r.top) / r.height, 0, 1),
  };
}

function onPointerDown(e) {
  // Capture nastavíme HNED — jinak by následné překreslení (render) smazalo
  // element pod prstem a prohlížeč by tažení zrušil (pointercancel).
  el.overlay.setPointerCapture(e.pointerId);
  const { fx, fy } = relCoords(e);
  const handle = e.target.classList.contains("handle");
  const spotEl = e.target.closest(".spot");

  if (handle && selectedId) {
    const s = selectedSpot();
    mode = "resize";
    start = { fx, fy, orig: { x: s.x, y: s.y, w: s.w, h: s.h } };
  } else if (spotEl && spotEl.dataset.id === selectedId) {
    // druhý stisk na už vybrané parkoviště = přesun
    const s = selectedSpot();
    mode = "move";
    start = { fx, fy, orig: { x: s.x, y: s.y, w: s.w, h: s.h } };
  } else if (spotEl) {
    // první stisk na jiné parkoviště = jen vybrat (a odrolovat nad panel)
    selectSpot(spotEl.dataset.id);
  } else {
    deselect();
    mode = "draw";
    start = { fx, fy };
    tempNode = document.createElement("div");
    tempNode.className = "temp-rect";
    el.overlay.appendChild(tempNode);
  }
}

function onPointerMove(e) {
  if (!mode) return;
  const { fx, fy } = relCoords(e);

  if (mode === "draw") {
    const x = Math.min(start.fx, fx), y = Math.min(start.fy, fy);
    const w = Math.abs(fx - start.fx), h = Math.abs(fy - start.fy);
    Object.assign(tempNode.style, {
      left: x * 100 + "%", top: y * 100 + "%", width: w * 100 + "%", height: h * 100 + "%",
    });
    tempNode._rect = { x, y, w, h };
  } else if (mode === "move") {
    const s = selectedSpot();
    if (!s) return;
    const dx = fx - start.fx, dy = fy - start.fy;
    s.x = clamp(start.orig.x + dx, 0, 1 - s.w);
    s.y = clamp(start.orig.y + dy, 0, 1 - s.h);
    markDirty();
    render();
  } else if (mode === "resize") {
    const s = selectedSpot();
    if (!s) return;
    const dx = fx - start.fx, dy = fy - start.fy;
    s.w = clamp(start.orig.w + dx, 0.02, 1 - s.x);
    s.h = clamp(start.orig.h + dy, 0.02, 1 - s.y);
    markDirty();
    render();
  }
}

function onPointerUp() {
  if (mode === "draw" && tempNode) {
    const rect = tempNode._rect;
    tempNode.remove();
    tempNode = null;
    if (rect && rect.w >= 0.02 && rect.h >= 0.02) {
      const s = {
        id: crypto.randomUUID(),
        name: "Parkoviště",
        x: rect.x, y: rect.y, w: rect.w, h: rect.h,
        current_cars: 0, max_cars: 10, is_lower: true,
        sort_order: working.length,
      };
      working.push(s);
      markDirty();
      selectSpot(s.id);
      el.pName.focus();
      el.pName.select();
    }
  }
  mode = null;
  start = null;
}

/* ---------- Ukládání ---------- */
async function saveToDb() {
  if (working.some((s) => !s.name || !s.name.trim())) {
    // dovol prázdné, doplní se default; nic neblokujeme
  }
  if (remoteOk) {
    try {
      const rows = working.map((s, i) => ({
        id: s.id,
        name: (s.name || "Parkoviště").trim(),
        x: s.x, y: s.y, w: s.w, h: s.h,
        max_cars: toInt(s.max_cars),
        is_lower: !!s.is_lower,
        sort_order: i,
      }));
      if (rows.length) {
        const { error } = await supabase.from("parking_spots").upsert(rows);
        if (error) throw error;
      }
      const removed = [...originalIds].filter((id) => !working.some((s) => s.id === id));
      if (removed.length) {
        const { error } = await supabase.from("parking_spots").delete().in("id", removed);
        if (error) throw error;
      }
      originalIds = new Set(working.map((s) => s.id));
      markClean();
      toast("Uloženo do databáze ✅");
    } catch (err) {
      console.error(err);
      toast("Chyba ukládání do DB — zkontroluj připojení a tabulku");
    }
  } else {
    // Lokální režim (bez DB) — uloží do prohlížeče, ať jde otestovat náhled.
    const rows = working.map((s, i) => ({
      ...s, sort_order: i,
      current_cars: s.current_cars ?? 0,
      updated_at: s.updated_at || new Date().toISOString(),
      updated_by: null,
    }));
    try { localStorage.setItem(LS_KEY, JSON.stringify(rows)); } catch (_) {}
    markClean();
    toast("Uloženo lokálně (bez DB) ✅");
  }
}

/* ---------- Export / Import JSON ---------- */
function exportJson() {
  const data = working.map((s, i) => ({
    name: (s.name || "Parkoviště").trim(),
    x: s.x, y: s.y, w: s.w, h: s.h,
    max_cars: toInt(s.max_cars),
    is_lower: !!s.is_lower,
    sort_order: i,
  }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "parkoviste.json";
  a.click();
  URL.revokeObjectURL(url);
  toast("Vyexportováno do parkoviste.json");
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const arr = JSON.parse(reader.result);
      if (!Array.isArray(arr)) throw new Error("JSON není pole");
      working = arr.map((s, i) => ({
        id: crypto.randomUUID(),
        name: String(s.name || "Parkoviště"),
        x: Number(s.x) || 0, y: Number(s.y) || 0,
        w: Number(s.w) || 0.05, h: Number(s.h) || 0.05,
        current_cars: 0,
        max_cars: toInt(s.max_cars) || 10,
        is_lower: !!s.is_lower,
        sort_order: i,
      }));
      selectedId = null;
      hide(el.propPanel);
      markDirty();
      render();
      toast(`Naimportováno ${working.length} parkovišť (ulož do DB)`);
    } catch (err) {
      console.error(err);
      toast("Nepodařilo se načíst JSON");
    }
  };
  reader.readAsText(file);
}

/* ---------- Reload z DB ---------- */
async function reloadFromDb() {
  if (dirty && !confirm("Máš neuložené změny. Opravdu je zahodit a načíst z databáze?")) return;
  if (remoteOk) {
    const rows = await fetchFromDb();
    if (rows) { setWorking(rows); markClean(); toast("Načteno z databáze"); }
    else toast("Chyba načtení z DB");
  } else {
    try {
      const raw = localStorage.getItem(LS_KEY);
      setWorking(raw ? JSON.parse(raw) : []);
    } catch (_) { setWorking([]); }
    markClean();
    toast("Načteno lokálně");
  }
}

/* ---------- PIN zámek (volitelný) ---------- */
function checkPin() {
  if (!EDITOR_PIN) return true; // bez zámku
  if (sessionStorage.getItem("editor_unlocked") === "1") return true;
  show(el.pinGate);
  el.pinInput.focus();
  return false;
}
function tryUnlock() {
  if (el.pinInput.value === EDITOR_PIN) {
    sessionStorage.setItem("editor_unlocked", "1");
    hide(el.pinGate);
    el.pinErr.textContent = "";
    boot();
  } else {
    el.pinErr.textContent = "Špatný PIN.";
    el.pinInput.value = "";
    el.pinInput.focus();
  }
}

/* ---------- Napojení ovládání ---------- */
function wireUi() {
  el.overlay.addEventListener("pointerdown", onPointerDown);
  el.overlay.addEventListener("pointermove", onPointerMove);
  el.overlay.addEventListener("pointerup", onPointerUp);
  el.overlay.addEventListener("pointercancel", () => {
    if (tempNode) { tempNode.remove(); tempNode = null; }
    mode = null; start = null;
  });

  el.pName.addEventListener("input", () => {
    const s = selectedSpot(); if (!s) return;
    s.name = el.pName.value; el.propTitle.textContent = s.name || "Parkoviště";
    markDirty(); render();
  });
  el.pMax.addEventListener("input", () => {
    const s = selectedSpot(); if (!s) return;
    s.max_cars = toInt(el.pMax.value); markDirty(); render();
  });
  el.pLower.addEventListener("change", () => {
    const s = selectedSpot(); if (!s) return;
    s.is_lower = el.pLower.checked; markDirty(); render();
  });
  el.pDelete.addEventListener("click", () => {
    const s = selectedSpot(); if (!s) return;
    if (!confirm(`Smazat parkoviště "${s.name || "Parkoviště"}"?`)) return;
    working = working.filter((x) => x.id !== s.id);
    markDirty(); deselect();
  });
  el.pDone.addEventListener("click", deselect);
  el.deselect.addEventListener("click", deselect);

  el.saveDb.addEventListener("click", saveToDb);
  el.exportBtn.addEventListener("click", exportJson);
  el.importBtn.addEventListener("click", () => el.importFile.click());
  el.importFile.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importJson(f);
    e.target.value = "";
  });
  el.reloadBtn.addEventListener("click", reloadFromDb);

  el.pinOk.addEventListener("click", tryUnlock);
  el.pinInput.addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });

  // varuj před opuštěním s neuloženými změnami
  window.addEventListener("beforeunload", (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });
}

/* ---------- Start ---------- */
async function boot() {
  if (usingSupabase) {
    try {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const rows = await fetchFromDb();
      if (rows === null) throw new Error("Nepodařilo se načíst data ze Supabase");
      remoteOk = true;
      setConn("ok", "🟢 Připojeno");
      setWorking(rows);
    } catch (err) {
      console.error("Supabase se nepodařilo načíst, přepínám na lokální režim:", err);
      remoteOk = false;
      setConn("err", "Bez spojení (lokálně)");
      try {
        const raw = localStorage.getItem(LS_KEY);
        setWorking(raw ? JSON.parse(raw) : []);
      } catch (_) { setWorking([]); }
    }
  } else {
    setConn("local", "Náhled (bez DB)");
    try {
      const raw = localStorage.getItem(LS_KEY);
      setWorking(raw ? JSON.parse(raw) : []);
    } catch (_) { setWorking([]); }
  }
  markClean();
}

function init() {
  wireUi();
  if (checkPin()) boot();
}

init();
