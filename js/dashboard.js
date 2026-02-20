// js/dashboard.js
// Multiwahl Dashboard: rendert sofort aus LocalStorage, refresht danach leise im Hintergrund

function $(id) { return document.getElementById(id); }

let betriebMap = {};      // bkz -> betrieb
let statusData = [];      // [{bezirk,bkz,ampel,files}]
let filterBezirk = "";
let filterAmpel = "";

// ----------------------------
// UI Helpers
// ----------------------------
function showOverlay(show) {
  const o = $("overlay");
  if (!o) return;
  o.style.display = show ? "flex" : "none";
}

function setTitle() {
  const h = $("pageTitle");
  if (!h) return;
  const wName = (typeof getWahlName === "function" ? getWahlName() : "") || "";
  const wId = (typeof getWahlId === "function" ? getWahlId() : "") || "";
  h.textContent = wName ? `Dashboard – ${wName}` : `Dashboard – ${wId || ""}`;
}

// ----------------------------
// Data helpers
// ----------------------------
function buildBetriebMap(betriebeArr) {
  const map = {};
  for (const b of (betriebeArr || [])) {
    const bkz = String(b.bkz || "").trim();
    if (!bkz) continue;
    map[bkz] = String(b.betrieb || "").trim();
  }
  return map;
}

function sortStatus(arr) {
  return [...arr].sort((a, b) => {
    const bz = (a.bezirk || "").localeCompare((b.bezirk || ""), "de");
    if (bz !== 0) return bz;
    // numerisch sortieren wenn möglich
    const na = parseInt(a.bkz, 10), nb = parseInt(b.bkz, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a.bkz || "").localeCompare(String(b.bkz || ""), "de");
  });
}

// ----------------------------
// Bezirk dropdown: aus STATUS (weil Excel-Bezirk oft leer ist)
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
// Render list grouped by Bezirk
// ----------------------------
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

    const card = document.createElement("div");
    card.className = "card";

    const color =
      entry.ampel === "gruen" ? "#43a047" :
      entry.ampel === "gelb"  ? "#fbc02d" :
      "#e53935";

    const bkz = String(entry.bkz || "").trim();
    const betriebName = betriebMap[bkz] || "–";

    // Link zur Ablage (marker -> ablage)
    const link = `ablage.html?bezirk=${encodeURIComponent(entry.bezirk || "")}&bkz=${encodeURIComponent(bkz)}`;

    card.innerHTML = `
      <div class="bkz-link">
        <a href="${link}" target="_blank" rel="noopener">
          <span class="ampel" style="background-color:${color}"></span>
          BKZ ${bkz}
        </a>
      </div>
      <div class="betrieb">${betriebName}</div>
      <div class="files">${entry.files} / ${entry.bezirk}</div>
    `;

    container.appendChild(card);
  }

  renderSummary(filtered);
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
// Load: 1) sofort aus Cache rendern, 2) dann refresh im Hintergrund
// ----------------------------
async function loadAndRenderFastThenRefresh() {
  const wahlId = requireWahlOrRedirect();
  if (!wahlId) return;

  setTitle();
  setupFilters();

  // 1) Schnell: aus LocalStorage (via core.js helper getStatus/getBetriebe -> nutzt Cache)
  showOverlay(true);

  try {
    const [betriebe, status] = await Promise.all([
      getBetriebe(),       // cached or refresh
      getStatus(wahlId)    // cached first if fresh
    ]);

    betriebMap = buildBetriebMap(betriebe || []);
    statusData = Array.isArray(status) ? status : [];

    populateBezirkDropdown();
    renderStatus();

  } finally {
    showOverlay(false);
  }

  // 2) Leiser Refresh (erzwingt Netz, aber ohne UI block)
  async function refresh() {
    try {
      // loadStatusFresh ist in core.js vorhanden (wenn du es so übernommen hast)
      // Falls nicht: nimm getStatus(wahlId) – das refreshed nach TTL automatisch.
      if (typeof loadStatusFresh === "function") {
        const fresh = await loadStatusFresh(wahlId);
        statusData = Array.isArray(fresh) ? fresh : statusData;
      } else {
        const maybe = await getStatus(wahlId);
        statusData = Array.isArray(maybe) ? maybe : statusData;
      }

      // Betriebe selten ändern – optional refresh nur über TTL
      const betr = await getBetriebe();
      betriebMap = buildBetriebMap(betr || []);

      populateBezirkDropdown();
      renderStatus();
    } catch (e) {
      // kein harter Fehler – UI bleibt mit Cache
      console.warn("Refresh fehlgeschlagen:", e);
    }
  }

  // Sofortiger Background refresh + alle 30 Sekunden
  refresh();
  setInterval(refresh, 30_000);
}

document.addEventListener("DOMContentLoaded", loadAndRenderFastThenRefresh);