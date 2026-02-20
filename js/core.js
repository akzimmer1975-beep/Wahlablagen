// ===============================
// GLOBAL APP CONTEXT
// ===============================
window.APP = {
  wahl: null,     // BR | JAV | SVP
  jahr: null,     // z.B. 2026
  apiBase: null,
  cache: {
    status: null,
    betriebe: null,
    timestamp: 0
  }
};

// ===============================
// CONFIG
// ===============================
const API_ROOT = "https://nexrcloud-backend-2-1.onrender.com/api";
const CACHE_TTL = 30 * 1000; // 30 Sekunden

// ===============================
// CONTEXT SETTER
// ===============================
function setContext(wahl, jahr) {
  APP.wahl = wahl;
  APP.jahr = jahr;
  APP.apiBase = `${API_ROOT}/${wahl}/${jahr}`;

  sessionStorage.setItem("appContext", JSON.stringify({
    wahl,
    jahr
  }));

  console.log("🌍 Context gesetzt:", APP);
}

// ===============================
// CONTEXT LOADER
// ===============================
function loadContext() {
  const ctx = sessionStorage.getItem("appContext");
  if (!ctx) return false;

  const data = JSON.parse(ctx);
  APP.wahl = data.wahl;
  APP.jahr = data.jahr;
  APP.apiBase = `${API_ROOT}/${APP.wahl}/${APP.jahr}`;

  console.log("♻ Context geladen:", APP);
  return true;
}

// ===============================
// PRELOAD API DATA
// ===============================
async function preloadData() {
  try {
    const now = Date.now();
    if (APP.cache.status && now - APP.cache.timestamp < CACHE_TTL) {
      console.log("⚡ Cache aktiv – kein Reload");
      return;
    }

    console.log("📡 Preload API Daten...");

    const [statusRes, betrRes] = await Promise.all([
      fetch(`${APP.apiBase}/status`),
      fetch(`${APP.apiBase}/betriebe-json`)
    ]);

    if (!statusRes.ok || !betrRes.ok) throw new Error("API Fehler");

    APP.cache.status = await statusRes.json();
    APP.cache.betriebe = await betrRes.json();
    APP.cache.timestamp = Date.now();

    sessionStorage.setItem("apiCache", JSON.stringify(APP.cache));

    console.log("✅ Preload fertig");

  } catch (err) {
    console.error("❌ Preload Fehler:", err);
  }
}

// ===============================
// CACHE LOADER
// ===============================
function loadCache() {
  const cache = sessionStorage.getItem("apiCache");
  if (!cache) return false;

  const data = JSON.parse(cache);
  APP.cache = data;
  console.log("♻ Cache geladen");
  return true;
}

// ===============================
// API HELPERS
// ===============================
function api(path) {
  return `${APP.apiBase}${path}`;
}

// ===============================
// AUTO INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {

  // 1) Context laden
  const hasContext = loadContext();

  // 2) Cache laden
  loadCache();

  // 3) Wenn Context vorhanden → preload
  if (hasContext) {
    await preloadData();
  }

});
