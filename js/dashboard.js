// js/dashboard.js
// Multiwahl Dashboard: liest WahlId aus localStorage, nutzt cache/preload aus core.js

function $(id) { return document.getElementById(id); }

let betriebMap = {};   // bkz -> betrieb
let statusData = [];   // vom Backend
let filterBezirk = "";
let filterAmpel = "";

function showOverlay(show) {
  const o = $("overlay");
  if (o) o.style.display = show ? "flex" : "none";
}

function buildBetriebMap(betriebeArr) {
  const map = {};
  for (const b of betriebeArr || []) {
    map[String(b.bkz)] = String(b.betrieb || "").trim();
  }
  return map;
}

function populateBezirkDropdown(fromStatus) {
  const select = $("bezirkFilter");
  if (!select) return;

  const bezirke = [...new Set((fromStatus || []).map(s => s.bezirk).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, "de"));

  const current = select.value || "";

  select.innerHTML = `<option value="">Alle Bezirke</option>` +
    bezirke.map(b => `<option value="${b}">${b}</option>`).join("");

  if (bezirke.includes(current)) select.value = current;
}

function setSummary(filtered) {
  const el = $("summary");
  if (!el) return;

  const g = filtered.filter(b => b.ampel === "gruen").length;
  const y = filtered.filter(b => b.ampel === "gelb").length;
  const r = filtered.filter(b => b.ampel === "rot").length;

  el.textContent = `Gesamt: ${filtered.length} | 🟢 ${g} | 🟡 ${y} | 🔴 ${r}`;
}

function setupAblageButton(wahlId) {
  const btn = $("openAblageBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    // optional: aktuellen Filter übernehmen
    const bez = $("bezirkFilter")?.value || "";
    const url = `ablage.html?wahl=${encodeURIComponent(wahlId)}&bezirk=${encodeURIComponent(bez)}`;
    window.location.href = url;
  });
}

function render(wahlId) {
  const list = $("status-list");
  if (!list) return;

  let filtered = [...statusData];

  if (filterBezirk) filtered = filtered.filter(x => x.bezirk === filterBezirk);
  if (filterAmpel) filtered = filtered.filter(x => x.ampel === filterAmpel);

  list.innerHTML = "";

  let currentBezirk = null;

  for (const entry of filtered) {
    if (entry.bezirk !== currentBezirk) {
      currentBezirk = entry.bezirk;
      const header = document.createElement("div");
      header.className = "bezirk-header";
      header.textContent = currentBezirk || "–";
      list.appendChild(header);
    }

    const card = document.createElement("div");
    card.className = "card";

    const color = entry.ampel === "gruen"
      ? "#43a047"
      : entry.ampel === "gelb"
        ? "#fbc02d"
        : "#e53935";

    const bkz = String(entry.bkz);
    const betriebName = betriebMap[bkz] || "–";

    // Links
    const ablageLink =
      `ablage.html?wahl=${encodeURIComponent(wahlId)}&bezirk=${encodeURIComponent(entry.bezirk)}&bkz=${encodeURIComponent(bkz)}`;

    const qrLink =
      `qr.html?wahl=${encodeURIComponent(wahlId)}&bezirk=${encodeURIComponent(entry.bezirk)}&bkz=${encodeURIComponent(bkz)}`;

    card.innerHTML = `
      <div class="left">
        <div class="bkz-link">
          <a href="${ablageLink}" target="_blank" rel="noopener">
            <span class="ampel" style="background-color:${color}"></span>
            BKZ ${bkz}
          </a>
        </div>

        <button class="qr-row-btn" type="button" data-qrlink="${qrLink}">
          🔳 QR
        </button>
      </div>

      <div class="betrieb">${betriebName}</div>
      <div class="files">${entry.files} / ${entry.bezirk}</div>
    `;

    // QR Button Click
    card.querySelector(".qr-row-btn")?.addEventListener("click", (e) => {
      const link = e.currentTarget.getAttribute("data-qrlink");
      window.open(link, "_blank", "noopener");
    });

    list.appendChild(card);
  }

  setSummary(filtered);
}

function initFilters(wahlId) {
  const bezSel = $("bezirkFilter");
  if (bezSel) {
    bezSel.addEventListener("change", () => {
      filterBezirk = bezSel.value;
      render(wahlId);
    });
  }

  document.querySelectorAll(".ampel-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ampel-btn").forEach(b => b.classList.remove("active"));

      const val = btn.dataset.filter || "";
      filterAmpel = val;

      if (val) btn.classList.add("active");
      render(wahlId);
    });
  });
}

async function loadAll() {
  const wahlId = requireWahlOrRedirect();
  if (!wahlId) return;

  const title = $("pageTitle");
  if (title) title.textContent = `Dashboard – ${getWahlName() || wahlId}`;

  setupAblageButton(wahlId);

  showOverlay(true);

  // 1) Stammdaten
  const betr = await getBetriebe();
  betriebMap = buildBetriebMap(betr);

  // 2) Status (wahlabhängig)
  statusData = await getStatus(wahlId);

  populateBezirkDropdown(statusData);

  initFilters(wahlId);
  render(wahlId);

  showOverlay(false);

  // Auto refresh
  setInterval(async () => {
    statusData = await getStatus(wahlId);
    populateBezirkDropdown(statusData);
    render(wahlId);
  }, 30_000);
}

document.addEventListener("DOMContentLoaded", loadAll);