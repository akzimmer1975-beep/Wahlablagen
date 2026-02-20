// js/index.js
// Erwartet: js/core.js stellt bereit:
// - loadWahlen()
// - getWahlId()
// - setWahlContext({id,name})
// - preloadForWahl(wahlId)
// - getStatus(wahlId)
// - API_BASE (oder die Funktionen nutzen intern API_BASE)

(() => {
  const wahlSelect = document.getElementById("wahlSelect");
  const dashboardBtn = document.getElementById("dashboardBtn");
  const ablageBtn = document.getElementById("ablageBtn");
  const qrBtn = document.getElementById("qrBtn");
  const overlay = document.getElementById("overlay");
  const wahlInfo = document.getElementById("wahlInfo");

  function showOverlay(show) {
    if (!overlay) return;
    overlay.style.display = show ? "block" : "none";
  }

  function navigate(page) {
    window.location.href = `pages/${page}.html`;
  }

  function setButtonsForSelection(enabled) {
    // Ablage + QR sollen nach Wahl immer möglich sein
    ablageBtn.disabled = !enabled;
    qrBtn.disabled = !enabled;

    // Dashboard wird separat je nach Dateistand gesetzt
    if (!enabled) dashboardBtn.disabled = true;
  }

  function setDashboardEnabled(enabled) {
    dashboardBtn.disabled = !enabled;
  }

  dashboardBtn.addEventListener("click", () => navigate("dashboard"));
  ablageBtn.addEventListener("click", () => navigate("ablage"));
  qrBtn.addEventListener("click", () => navigate("qr"));

  async function refreshDashboardAvailability(wahlId) {
    // Dashboard nur aktivieren, wenn im Wahlordner mindestens 1 Datei existiert
    try {
      const status = await getStatus(wahlId);

      const hasAnyFiles =
        Array.isArray(status) &&
        status.some(e => Number(e.files || 0) > 0);

      setDashboardEnabled(hasAnyFiles);

      if (!hasAnyFiles) {
        // optionaler Hinweis
        wahlInfo.textContent = wahlInfo.textContent.replace(/\s*\|\s*Dashboard:.*/, "");
        wahlInfo.textContent += " | Dashboard: keine Dateien";
      } else {
        wahlInfo.textContent = wahlInfo.textContent.replace(/\s*\|\s*Dashboard:.*/, "");
        wahlInfo.textContent += " | Dashboard: verfügbar";
      }
    } catch (e) {
      // Wenn Status nicht geladen werden kann: Dashboard vorsichtshalber aus
      setDashboardEnabled(false);
      wahlInfo.textContent = wahlInfo.textContent.replace(/\s*\|\s*Dashboard:.*/, "");
      wahlInfo.textContent += " | Dashboard: Status-Fehler";
    }
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

    // Sicherheit: "liste" niemals anzeigen
    wahlen = (Array.isArray(wahlen) ? wahlen : []).filter(w => w && w.id && w.id !== "liste");

    wahlSelect.innerHTML =
      `<option value="">Bitte auswählen…</option>` +
      wahlen.map(w => `<option value="${w.id}">${w.name}</option>`).join("");

    // Falls bereits gewählt -> setzen, preload, Buttons aktiv
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

    // Change: set context, preload, Buttons
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

  document.addEventListener("DOMContentLoaded", init);
})();