// js/dashboard.js
function $(id) { return document.getElementById(id); }

// Endpoints (Status ist Multiwahl, Betriebe sind bei dir aktuell global –
// ich mache beides möglich: erst /api/:wahlId/betriebe-json, dann Fallback /api/betriebe-json)
function getWahlIdSafe() {
  try { return (typeof getWahlId === "function" ? getWahlId() : "") || localStorage.getItem("wahlId") || ""; }
  catch { return localStorage.getItem("wahlId") || ""; }
}

let betriebMap = new Map();  // BKZ -> Betrieb
let statusData = [];
let filterBezirk = "";
let filterAmpel = "";

// ----------------------------
// UI
// ----------------------------
function showOverlay(show) {
  const o = $("overlay");
  if (!o) return;
  o.style.display = show ? "flex" : "none";
}

function setTitle() {
  const h = $("pageTitle");
  if (!h) return;
  const name = (typeof getWahlName === "function" ? getWahlName() : "") || localStorage.getItem("wahlName") || "";
  const id = getWahlIdSafe();
  h.textContent = name ? `Dashboard – ${name}` : `Dashboard – ${id || ""}`;
}

// ----------------------------
// Helper: BKZ normalisieren
// ----------------------------
function normBkz(v) {
  // Status liefert meist "1".."999", Excel auch "1" etc.
  // Wir trimmen und entfernen führende Nullen NUR für Lookup-Vergleich
  const s = String(v ?? "").trim();
  if (!s) return "";
  // "001" -> "1"
  return String(parseInt(s, 10)) === "NaN" ? s : String(parseInt(s, 10));
}

// ----------------------------
// Betriebe laden (wahlabhängig ODER global)
// ----------------------------
async function loadBetriebe() {
  const wahlId = getWahlIdSafe();
  const urlTry1 = `${API_BASE}/api/${encodeURIComponent(wahlId)}/betriebe-json`;
  const urlTry2 = `${API_BASE}/api/betriebe-json`;

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
    return await res.json();
  }

  let data = null;
  try {
    if (wahlId) data = await fetchJson(urlTry1);
  } catch (e) {
    // fallback
  }

  if (!data) {
    try {
      data = await fetchJson(urlTry2);
    } catch (e) {
      console.warn("betriebe-json konnte nicht geladen werden:", e);
      data = [];
    }
  }

  // Map bauen: BKZ -> Betrieb
  const map = new Map();
  if (Array.isArray(data)) {
    for (const row of data) {
      const bkzKey = normBkz(row.bkz);
      const betr = String(row.betrieb ?? "").trim();
      if (bkzKey && betr) map.set(bkzKey, betr);
    }
  }

  betriebMap = map;

  // Debug
  console.log("✅ Betriebe gemappt:", betriebMap.size);
}

// ----------------------------
// Status laden
// ----------------------------
async function loadStatus() {
  const wahlId = requireWahlOrRedirect(); // aus core.js
  const container = $("status-list");
  if (!container) return;

  try {
    const data = await getStatus(wahlId); // aus core.js (cache + refresh)
    statusData = Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Status konnte nicht geladen werden:", e);
    statusData = [];
  }
}

// ----------------------------
// Bezirk Dropdown aus STATUS
// ----------------------------
function populateBezirkDropdown() {
  const select = $("bezirkFilter");
  if (!select) return;

  const current = select.value || "";
  const bezirke = [...new Set(statusData.map(s => s.bezirk).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "de"));

  select.innerHTML = `<option value="">Alle Bezirke</option>` +
    bezirke.map(b => `<option value="${b}">${b}</option>`).join("");

  if (current && bezirke.includes(current)) select.value = current;
}

// ----------------------------
// Summary
// ----------------------------
function renderSummary(filtered) {
  const el = $("summary");
  if (!el) return;

  const g = filtered.filter(b => b.ampel === "gruen").length;
  const y = filtered.filter(b => b.ampel === "gelb").length;
  const r = filtered.filter(b => b.ampel === "rot").length;

  el.textContent = `Gesamt: ${filtered.length} | 🟢 ${g} | 🟡 ${y} | 🔴 ${r}`;
}

// ----------------------------
// Render
// ----------------------------
function sortStatus(arr) {
  return [...arr].sort((a, b) => {
    const bz = (a.bezirk || "").localeCompare((b.bezirk || ""), "de");
    if (bz !== 0) return bz;
    const na = parseInt(a.bkz, 10), nb = parseInt(b.bkz, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a.bkz || "").localeCompare(String(b.bkz || ""), "de");
  });
}

function renderStatus() {
  const container = $("status-list");
  if (!container) return;

  let filtered = [...statusData];

  if (filterBezirk) filtered = filtered.filter(e => e.bezirk === filterBezirk);
  if (filterAmpel) filtered = filtered.filter(e => e.ampel === filterAmpel);

  filtered = sortStatus(filtered);

  container.innerHTML = "";
  let currentBezirk = null;

  for (const entry of filtered) {
    if (entry.bezirk !== currentBezirk) {
      currentBezirk = entry.bezirk;
      const header = document.createElement("div");
      header.className = "bezirk-header";
      header.textContent = currentBezirk || "–";
      container.appendChild(header);
    }

    const bkzRaw = String(entry.bkz ?? "").trim();
    const bkzKey = normBkz(bkzRaw);
    const betriebName = betriebMap.get(bkzKey) || "–";

    const color =
      entry.ampel === "gruen" ? "#43a047" :
      entry.ampel === "gelb"  ? "#fbc02d" :
      "#e53935";

    const link = `ablage.html?bezirk=${encodeURIComponent(entry.bezirk || "")}&bkz=${encodeURIComponent(bkzRaw)}`;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="bkz-link">
        <a href="${link}">
          <span class="ampel" style="background-color:${color}"></span>
          BKZ ${bkzRaw}
        </a>
      </div>
      <div class="betrieb">${betriebName}</div>
      <div class="files">${entry.files} / ${entry.bezirk}</div>
    `;
    container.appendChild(card);
  }

  renderSummary(filtered);

  // Debug sichtbar, wenn du willst:
  // console.log("renderStatus:", { shown: filtered.length, betriebMap: betriebMap.size });
}

// ----------------------------
// Filters
// ----------------------------
function setupFilters() {
  const bezSel = $("bezirkFilter");
  if (bezSel) {
    bezSel.addEventListener("change", () => {
      filterBezirk = bezSel.value;
      renderStatus();
    });
  }

  document.querySelectorAll(".ampel-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ampel-btn").forEach(b => b.classList.remove("active"));

      const val = btn.dataset.filter || "";
      filterAmpel = val;

      if (val) btn.classList.add("active");
      renderStatus();
    });
  });
}

// ----------------------------
// Init
// ----------------------------
async function initDashboard() {
  const wahlId = requireWahlOrRedirect();
  if (!wahlId) return;

  setTitle();
  setupFilters();

  showOverlay(true);

  // Wichtig: erst Betriebe + Status laden, dann rendern
  await Promise.all([
    loadBetriebe(),
    loadStatus()
  ]);

  populateBezirkDropdown();
  renderStatus();

  showOverlay(false);

  // Hintergrund-Refresh alle 30 Sekunden
  setInterval(async () => {
    await loadStatus();
    populateBezirkDropdown();
    renderStatus();
  }, 30_000);
}

document.addEventListener("DOMContentLoaded", initDashboard);