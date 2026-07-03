import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

/* ------------------------------------------------------------------ *
 *  Parkování tábor — aplikační logika
 *  Data se sdílí přes Supabase (pokud je nastavené v config.js),
 *  jinak běží DEMO režim s uložením v prohlížeči (localStorage).
 * ------------------------------------------------------------------ */

const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
let supabase = null;

const LS_KEY = "tabor_parking_spots_v1";

/** Jediné pole, ze kterého se vykresluje. Prvky:
 *  {id,name,x,y,w,h,current_cars,max_cars,is_lower,sort_order,updated_at,updated_by} */
let spots = [];
let editMode = false;
let selectedEditId = null;

/* ---------- DOM ---------- */
const el = {};
[
  "connStatus", "editToggle", "banner", "mapWrap", "overlay", "drawHint",
  "countModal", "countTitle", "curInput", "maxInput", "occPreview", "lastUpd", "saveCount",
  "editModal", "editName", "editMax", "editLower", "deleteSpot", "saveEdit", "toast",
].forEach((id) => (el[id] = document.getElementById(id)));

/* ---------- Pomocné ---------- */
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function show(node) { node.classList.remove("hidden"); }
function hide(node) { node.classList.add("hidden"); }

let toastTimer = null;
function toast(msg) {
  el.toast.textContent = msg;
  show(el.toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hide(el.toast), 2200);
}

function setConn(kind, text) {
  el.connStatus.className = "conn-badge " + kind;
  el.connStatus.textContent = text;
}

function occClass(s) {
  const r = s.max_cars > 0 ? s.current_cars / s.max_cars : 1;
  if (r >= 1) return "full";
  if (r >= 0.7) return "warn";
  return "free";
}

function lastUpdText(s) {
  if (!s.updated_at) return "";
  const d = new Date(s.updated_at);
  const diff = (Date.now() - d.getTime()) / 1000;
  let rel;
  if (diff < 60) rel = "před chvílí";
  else if (diff < 3600) rel = "před " + Math.floor(diff / 60) + " min";
  else if (diff < 86400) rel = "před " + Math.floor(diff / 3600) + " h";
  else rel = d.toLocaleString("cs-CZ");
  return "Naposledy upraveno " + rel;
}

/* ---------- Ukládání dat ---------- */
function persistLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(spots)); } catch (_) {}
}
function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    spots = raw ? JSON.parse(raw) : [];
  } catch (_) { spots = []; }
  if (spots.length === 0) seedDemo();
}
function seedDemo() {
  spots = [
    { id: crypto.randomUUID(), name: "U tábora", x: 0.30, y: 0.35, w: 0.16, h: 0.06,
      current_cars: 2, max_cars: 8, is_lower: false, sort_order: 0,
      updated_at: new Date().toISOString(), updated_by: null },
    { id: crypto.randomUUID(), name: "Dole u cesty", x: 0.10, y: 0.60, w: 0.15, h: 0.06,
      current_cars: 5, max_cars: 6, is_lower: true, sort_order: 1,
      updated_at: new Date().toISOString(), updated_by: null },
  ];
  persistLocal();
}

async function loadFromSupabase() {
  const { data, error } = await supabase
    .from("parking_spots")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) { setConn("err", "Chyba dat"); console.error(error); return; }
  spots = data || [];
}

function applyPatch(id, patch) {
  const s = spots.find((x) => x.id === id);
  if (s) Object.assign(s, patch);
}

async function opCreate(spot) {
  if (usingSupabase) {
    const { data, error } = await supabase.from("parking_spots").insert(spot).select().single();
    if (error) { toast("Chyba uložení"); console.error(error); return null; }
    await loadFromSupabase();
    render();
    return data;
  }
  const s = { ...spot, id: crypto.randomUUID() };
  spots.push(s);
  persistLocal();
  render();
  return s;
}

async function opUpdate(id, patch) {
  applyPatch(id, patch); // optimistické zobrazení
  render();
  if (usingSupabase) {
    const { error } = await supabase.from("parking_spots").update(patch).eq("id", id);
    if (error) { toast("Chyba uložení"); console.error(error); }
  } else {
    persistLocal();
  }
}

async function opRemove(id) {
  spots = spots.filter((s) => s.id !== id);
  render();
  if (usingSupabase) {
    const { error } = await supabase.from("parking_spots").delete().eq("id", id);
    if (error) { toast("Chyba mazání"); console.error(error); }
  } else {
    persistLocal();
  }
}

/* ---------- Vykreslení ---------- */
function render() {
  renderBanner();
  el.overlay.innerHTML = "";
  for (const s of spots) {
    const d = document.createElement("div");
    d.className = "spot " + occClass(s);
    if (editMode && s.id === selectedEditId) d.classList.add("selected-edit");
    d.style.left = s.x * 100 + "%";
    d.style.top = s.y * 100 + "%";
    d.style.width = s.w * 100 + "%";
    d.style.height = s.h * 100 + "%";
    d.innerHTML =
      `<span class="spot-name">${escapeHtml(s.name)}</span>` +
      `<span class="spot-count">${s.current_cars}/${s.max_cars}</span>`;
    d.addEventListener("click", (e) => { e.stopPropagation(); onSpotClick(s.id); });
    el.overlay.appendChild(d);
  }
}

function renderBanner() {
  const b = el.banner;
  if (spots.length === 0) {
    b.className = "banner banner-neutral";
    b.textContent = "Zatím žádná parkoviště. Přidej je tlačítkem ✏️ Upravit.";
    return;
  }
  const lower = spots.filter((s) => s.is_lower);
  if (lower.length === 0) {
    b.className = "banner banner-neutral";
    b.textContent = "Žádné parkoviště není označené u spodní cesty.";
    return;
  }
  let free = 0;
  for (const s of lower) free += Math.max(0, s.max_cars - s.current_cars);

  if (free <= 0) {
    b.className = "banner banner-full";
    b.innerHTML = '🚫 <span>Spodní parkoviště jsou <span class="big">PLNÁ</span> → jeď <span class="big">HORNÍ</span> cestou.</span>';
  } else if (free <= 3) {
    b.className = "banner banner-warn";
    b.innerHTML = `⚠️ <span>Dole už skoro plno — volno jen <strong>${free}</strong>. Zvaž horní cestu.</span>`;
  } else {
    b.className = "banner banner-ok";
    b.innerHTML = `✅ <span>Dole je <strong>${free}</strong> volných míst — můžeš jet <strong>spodní</strong> cestou.</span>`;
  }
}

/* ---------- Klik na parkoviště ---------- */
function onSpotClick(id) {
  const s = spots.find((x) => x.id === id);
  if (!s) return;
  if (editMode) openEdit(s);
  else openCount(s);
}

/* ---------- Modal: počet aut ---------- */
let countTargetId = null;
function openCount(s) {
  countTargetId = s.id;
  el.countTitle.textContent = s.name;
  el.curInput.value = s.current_cars;
  el.maxInput.value = s.max_cars;
  el.lastUpd.textContent = lastUpdText(s);
  updateOccPreview();
  show(el.countModal);
}
function updateOccPreview() {
  const cur = toInt(el.curInput.value);
  const max = toInt(el.maxInput.value);
  const ratio = max > 0 ? Math.min(1, cur / max) : 1;
  const color = ratio >= 1 ? "var(--red)" : ratio >= 0.7 ? "var(--amber)" : "var(--green)";
  el.occPreview.innerHTML = `<div class="fill" style="width:${ratio * 100}%;background:${color}"></div>`;
}
async function saveCount() {
  if (!countTargetId) return;
  await opUpdate(countTargetId, {
    current_cars: toInt(el.curInput.value),
    max_cars: toInt(el.maxInput.value),
    updated_at: new Date().toISOString(),
  });
  hide(el.countModal);
  toast("Uloženo ✅");
}

/* ---------- Modal: editace parkoviště ---------- */
let editTargetId = null;
function openEdit(s) {
  editTargetId = s.id;
  selectedEditId = s.id;
  el.editName.value = s.name;
  el.editMax.value = s.max_cars;
  el.editLower.checked = !!s.is_lower;
  render();
  show(el.editModal);
}
function closeEdit() {
  hide(el.editModal);
  selectedEditId = null;
  editTargetId = null;
  render();
}
async function saveEdit() {
  if (!editTargetId) return;
  const name = el.editName.value.trim() || "Parkoviště";
  const max = toInt(el.editMax.value);
  await opUpdate(editTargetId, { name, max_cars: max, is_lower: el.editLower.checked });
  closeEdit();
  toast("Uloženo ✅");
}
async function removeSpot() {
  if (!editTargetId) return;
  if (!confirm("Opravdu smazat toto parkoviště?")) return;
  const id = editTargetId;
  closeEdit();
  await opRemove(id);
  toast("Smazáno");
}

/* ---------- Režim úprav + kreslení ---------- */
function setEditMode(on) {
  editMode = on;
  el.editToggle.classList.toggle("active", on);
  el.editToggle.textContent = on ? "✅ Hotovo" : "✏️ Upravit";
  el.mapWrap.classList.toggle("editing", on);
  el.drawHint.classList.toggle("hidden", !on);
  selectedEditId = null;
  render();
}

let drawing = null;
function initDrawing() {
  el.overlay.addEventListener("pointerdown", (e) => {
    if (!editMode || e.target !== el.overlay) return;
    const r = el.overlay.getBoundingClientRect();
    drawing = {
      sx: clamp01((e.clientX - r.left) / r.width),
      sy: clamp01((e.clientY - r.top) / r.height),
      rect: null,
      node: null,
    };
    el.overlay.setPointerCapture(e.pointerId);
  });

  el.overlay.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const r = el.overlay.getBoundingClientRect();
    const cx = clamp01((e.clientX - r.left) / r.width);
    const cy = clamp01((e.clientY - r.top) / r.height);
    const x = Math.min(drawing.sx, cx), y = Math.min(drawing.sy, cy);
    const w = Math.abs(cx - drawing.sx), h = Math.abs(cy - drawing.sy);
    drawing.rect = { x, y, w, h };
    if (!drawing.node) {
      drawing.node = document.createElement("div");
      drawing.node.className = "temp-rect";
      el.overlay.appendChild(drawing.node);
    }
    Object.assign(drawing.node.style, {
      left: x * 100 + "%", top: y * 100 + "%", width: w * 100 + "%", height: h * 100 + "%",
    });
  });

  const finishDraw = async () => {
    if (!drawing) return;
    const rect = drawing.rect;
    if (drawing.node) drawing.node.remove();
    drawing = null;
    if (!rect || rect.w < 0.02 || rect.h < 0.02) return; // moc malé — ignoruj
    const created = await opCreate({
      name: "Parkoviště",
      x: rect.x, y: rect.y, w: rect.w, h: rect.h,
      current_cars: 0, max_cars: 10, is_lower: true,
      sort_order: spots.length,
      updated_at: new Date().toISOString(), updated_by: null,
    });
    if (created) {
      const s = spots.find((x) => x.id === created.id) || created;
      openEdit(s);
    }
  };
  el.overlay.addEventListener("pointerup", finishDraw);
  el.overlay.addEventListener("pointercancel", () => {
    if (drawing?.node) drawing.node.remove();
    drawing = null;
  });
}

/* ---------- Napojení ovládacích prvků ---------- */
function wireUi() {
  el.editToggle.addEventListener("click", () => setEditMode(!editMode));
  el.saveCount.addEventListener("click", saveCount);
  el.saveEdit.addEventListener("click", saveEdit);
  el.deleteSpot.addEventListener("click", removeSpot);

  // krokovací tlačítka +/−
  document.querySelectorAll("[data-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.dataset.step === "current" ? el.curInput : el.maxInput;
      const next = Math.max(0, toInt(input.value) + parseInt(btn.dataset.delta, 10));
      input.value = next;
      updateOccPreview();
    });
  });
  el.curInput.addEventListener("input", updateOccPreview);
  el.maxInput.addEventListener("input", updateOccPreview);

  // zavírání modalů
  el.countModal.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => hide(el.countModal)));
  el.editModal.querySelectorAll("[data-close-edit]").forEach((b) => b.addEventListener("click", closeEdit));
  el.countModal.addEventListener("click", (e) => { if (e.target === el.countModal) hide(el.countModal); });
  el.editModal.addEventListener("click", (e) => { if (e.target === el.editModal) closeEdit(); });

  initDrawing();
}

/* ---------- Start ---------- */
async function init() {
  wireUi();
  if (usingSupabase) {
    try {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      await loadFromSupabase();
      supabase
        .channel("parking-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "parking_spots" }, async () => {
          await loadFromSupabase();
          render();
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") setConn("ok", "🟢 Živě");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConn("err", "Bez spojení");
        });
      setConn("ok", "Připojeno");
    } catch (err) {
      console.error("Supabase se nepodařilo načíst, přepínám na demo:", err);
      setConn("err", "Chyba připojení");
      loadLocal();
    }
  } else {
    loadLocal();
    setConn("local", "Demo (lokálně)");
  }
  render();
}

init();
