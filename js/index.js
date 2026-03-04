// js/index.js
// Erwartet: js/core.js stellt bereit:
// - loadWahlen()
// - getWahlId()
// - setWahlContext({id,name})
// - preloadForWahl(wahlId)
// - getStatus(wahlId)
// - API_BASE

(() => {
  const wahlSelect = document.getElementById("wahlSelect");
  const dashboardBtn = document.getElementById("dashboardBtn");
  const ablageBtn = document.getElementById("ablageBtn");
  const qrBtn = document.getElementById("qrBtn");
  const overlay = document.getElementById("overlay");
  const wahlInfo = document.getElementById("wahlInfo");
  const coldstart = document.getElementById("coldstart");

  function showOverlay(show) {
    if (!overlay) return;
    overlay.style.display = show ? "block" : "none";
  }

  function navigate(page) {
    window.location.href = `pages/${page}.html`;
  }

  function setButtonsForSelection(enabled) {
    ablageBtn.disabled = !enabled;
    qrBtn.disabled = !enabled;

    if (!enabled) dashboardBtn.disabled = true;
  }

  function setDashboardEnabled(enabled) {
    dashboardBtn.disabled = !enabled;
  }

  dashboardBtn.addEventListener("click", () => navigate("dashboard"));
  ablageBtn.addEventListener("click", () => navigate("ablage"));
  qrBtn.addEventListener("click", () => navigate("qr"));

  async function refreshDashboardAvailability(wahlId) {
    try {
      const status = await getStatus(wahlId);

      const hasAnyFiles =
        Array.isArray(status) &&
        status.some(e => Number(e.files || 0) > 0);

      setDashboardEnabled(hasAnyFiles);

      if (!hasAnyFiles) {
        wahlInfo.textContent = wahlInfo.textContent.replace(/\s*\|\s*Dashboard:.*/, "");
        wahlInfo.textContent += " | Dashboard: keine Dateien";
      } else {
        wahlInfo.textContent = wahlInfo.textContent.replace(/\s*\|\s*Dashboard:.*/, "");
        wahlInfo.textContent += " | Dashboard: verfügbar";
      }
    } catch (e) {
      setDashboardEnabled(false);
      wahlInfo.textContent = wahlInfo.textContent.replace(/\s*\|\s*Dashboard:.*/, "");
      wahlInfo.textContent += " | Dashboard: Status-Fehler";
    }
  }

  // ---- Backend Cold Start erkennen ----

  async function waitForBackend() {
    const start = Date.now();
    let shown = false;

    while (Date.now() - start < 35000) {
      try {
        const res = await fetch(`${API_BASE}/health`);
        if (res.ok) return true;
      } catch {}

      if (!shown && Date.now() - start > 1500) {
        if (coldstart) coldstart.style.display = "block";
        shown = true;
      }

      await new Promise(r => setTimeout(r, 1500));
    }

    if (coldstart) {
      coldstart.textContent = "Backend nicht erreichbar – bitte Seite neu laden.";
      coldstart.style.display = "block";
    }

    return false;
  }

  async function init() {
    setButtonsForSelection(false);
    showOverlay(false);

    let wahlen = [];

    try {
      wahlen = await loadWahlen();
    } catch (e) {
      wahlSelect.innerHTML = `<option value="">Fehler: /api/wahlen nicht erreichbar</option>`;
      return;
    }

    wahlen = (Array.isArray(wahlen) ? wahlen : []).filter(w => w && w.id && w.id !== "liste");

    wahlSelect.innerHTML =
      `<option value="">Bitte auswählen…</option>` +
      wahlen.map(w => `<option value="${w.id}">${w.name}</option>`).join("");

    const savedId = getWahlId && getWahlId();

    if (savedId && wahlen.some(w => w.id === savedId)) {
      const wObj = wahlen.find(w => w.id === savedId);
      wahlSelect.value = savedId;

      setWahlContext(wObj);
      setButtonsForSelection(true);

      wahlInfo.textContent = `Aktiv: ${wObj.name} (${wObj.id})`;

      showOverlay(true);
      await preloadForWahl(savedId);
      showOverlay(false);

      await refreshDashboardAvailability(savedId);
    } else {
      wahlInfo.textContent = "";
    }

    wahlSelect.addEventListener("change", async () => {
      const id = wahlSelect.value;

      if (!id) {
        setButtonsForSelection(false);
        wahlInfo.textContent = "";
        return;
      }

      const wObj = wahlen.find(w => w.id === id);
      setWahlContext(wObj);

      wahlInfo.textContent = `Aktiv: ${wObj.name} (${wObj.id})`;
      setButtonsForSelection(true);

      showOverlay(true);
      await preloadForWahl(id);
      showOverlay(false);

      await refreshDashboardAvailability(id);
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const ok = await waitForBackend();
    if (!ok) return;
    init();
  });

})();