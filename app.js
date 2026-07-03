import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

/* ------------------------------------------------------------------ *
 *  Parkování tábor — VEŘEJNÁ aplikace (prohlížení + zadání počtu aut)
 *  Definice parkovišť (obdélníků) se dělá v odděleném editoru
 *  (editor.html), který není součástí veřejné appky.
 *
 *  Data se sdílí přes Supabase; když není dostupné, appka jen zobrazí
 *  poslední lokálně známý stav (režim náhledu).
 * ------------------------------------------------------------------ */

const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
let supabase = null;
let remoteOk = false; // true až po úspěšném připojení k Supabase

const LS_KEY = "tabor_parking_spots_v1";

/** Pole, ze kterého se vykresluje. */
let spots = [];

/* ---------- DOM ---------- */
const el = {};
[
  "connStatus", "banner", "overlay",
  "countModal", "countTitle", "curInput", "maxInput", "occPreview", "lastUpd", "saveCount",
  "toast",
].forEach((id) => (el[id] = document.getElementById(id)));

/* ---------- Pomocné ---------- */
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

/* ---------- Načítání dat ---------- */
function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    spots = raw ? JSON.parse(raw) : [];
  } catch (_) { spots = []; }
}

async function loadFromSupabase() {
  const { data, error } = await supabase
    .from("parking_spots")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) { setConn("err", "Chyba dat"); console.error(error); return false; }
  spots = data || [];
  return true;
}

/* ---------- Uložení počtu aut ---------- */
async function updateCount(id, current, max) {
  const s = spots.find((x) => x.id === id);
  if (s) { s.current_cars = current; s.max_cars = max; s.updated_at = new Date().toISOString(); }
  render();
  if (remoteOk) {
    const { error } = await supabase
      .from("parking_spots")
      .update({ current_cars: current, max_cars: max, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast("Chyba uložení"); console.error(error); }
  } else {
    try { localStorage.setItem(LS_KEY, JSON.stringify(spots)); } catch (_) {}
  }
}

/* ---------- Vykreslení ---------- */
function render() {
  renderBanner();
  el.overlay.innerHTML = "";
  for (const s of spots) {
    const d = document.createElement("div");
    d.className = "spot " + occClass(s);
    d.style.left = s.x * 100 + "%";
    d.style.top = s.y * 100 + "%";
    d.style.width = s.w * 100 + "%";
    d.style.height = s.h * 100 + "%";
    d.innerHTML =
      `<span class="spot-name">${escapeHtml(s.name)}</span>` +
      `<span class="spot-count">${s.current_cars}/${s.max_cars}</span>`;
    d.addEventListener("click", () => openCount(s.id));
    el.overlay.appendChild(d);
  }
}

function renderBanner() {
  const b = el.banner;
  if (spots.length === 0) {
    b.className = "banner banner-neutral";
    b.textContent = "Zatím nejsou zadaná žádná parkoviště.";
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

/* ---------- Modal: počet aut ---------- */
let countTargetId = null;
function openCount(id) {
  const s = spots.find((x) => x.id === id);
  if (!s) return;
  countTargetId = id;
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
  await updateCount(countTargetId, toInt(el.curInput.value), toInt(el.maxInput.value));
  hide(el.countModal);
  toast("Uloženo ✅");
}

/* ---------- Napojení ovládacích prvků ---------- */
function wireUi() {
  el.saveCount.addEventListener("click", saveCount);

  document.querySelectorAll("[data-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.dataset.step === "current" ? el.curInput : el.maxInput;
      input.value = Math.max(0, toInt(input.value) + parseInt(btn.dataset.delta, 10));
      updateOccPreview();
    });
  });
  el.curInput.addEventListener("input", updateOccPreview);
  el.maxInput.addEventListener("input", updateOccPreview);

  el.countModal.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => hide(el.countModal)));
  el.countModal.addEventListener("click", (e) => { if (e.target === el.countModal) hide(el.countModal); });
}

/* ---------- Start ---------- */
async function init() {
  wireUi();
  if (usingSupabase) {
    try {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const ok = await loadFromSupabase();
      if (!ok) throw new Error("Nepodařilo se načíst data ze Supabase (existuje tabulka?)");
      remoteOk = true;
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
      console.error("Supabase se nepodařilo načíst, přepínám na náhled:", err);
      remoteOk = false;
      setConn("err", "Bez spojení");
      loadLocal();
    }
  } else {
    loadLocal();
    setConn("local", "Náhled (bez DB)");
  }
  render();
}

init();
