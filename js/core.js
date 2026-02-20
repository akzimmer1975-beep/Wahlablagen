// js/core.js
// Zentrale Konfiguration + LocalStorage Wahl-Context + Preload

const API_BASE = "https://nexrcloud-backend-2-1.onrender.com"; // <-- anpassen

const LS_KEYS = {
  wahlId: "wahlId",
  wahlName: "wahlName",
  status: (wahlId) => `status:${wahlId}`,
  statusTime: (wahlId) => `statusTime:${wahlId}`,
  betr: "betriebe",
  betrTime: "betriebeTime",
};

const TTL = {
  statusMs: 30_000,          // entspricht deinem Backend-Cache
  betrMs: 15 * 60_000,       // 15 min
};

// ---------- Helpers ----------
function lsGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function lsSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function now() { return Date.now(); }

function api(path) {
  // path beginnt mit /api/...
  return `${API_BASE}${path}`;
}

// ---------- Wahl Context ----------
function setWahlContext({ id, name }) {
  lsSet(LS_KEYS.wahlId, id);
  lsSet(LS_KEYS.wahlName, name);
}
function getWahlId() {
  return lsGet(LS_KEYS.wahlId, "");
}
function getWahlName() {
  return lsGet(LS_KEYS.wahlName, "");
}
function requireWahlOrRedirect() {
  const id = getWahlId();
  if (!id) {
    // zurück zur Startseite (Repo-Root)
    window.location.href = "../index.html";
    return null;
  }
  return id;
}

// ---------- API Calls ----------
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function loadWahlen() {
  return await fetchJson(api("/api/wahlen")); // [{id,name}]
}

async function loadBetriebeFresh() {
  const data = await fetchJson(api("/api/stammdaten/betriebe"));
  lsSet(LS_KEYS.betr, data);
  lsSet(LS_KEYS.betrTime, now());
  return data;
}

async function getBetriebe() {
  const t = lsGet(LS_KEYS.betrTime, 0);
  const cached = lsGet(LS_KEYS.betr, []);
  if (cached.length && now() - t < TTL.betrMs) return cached;
  try {
    return await loadBetriebeFresh();
  } catch {
    // fallback cached
    return cached;
  }
}

async function loadStatusFresh(wahlId) {
  const data = await fetchJson(api(`/api/${encodeURIComponent(wahlId)}/status`));
  lsSet(LS_KEYS.status(wahlId), data);
  lsSet(LS_KEYS.statusTime(wahlId), now());
  return data;
}

async function getStatus(wahlId) {
  const t = lsGet(LS_KEYS.statusTime(wahlId), 0);
  const cached = lsGet(LS_KEYS.status(wahlId), []);
  if (cached.length && now() - t < TTL.statusMs) return cached;
  try {
    return await loadStatusFresh(wahlId);
  } catch {
    return cached;
  }
}

// ---------- Preload ----------
async function preloadForWahl(wahlId) {
  // Parallel: Status + Betriebe
  await Promise.allSettled([
    loadStatusFresh(wahlId),
    getBetriebe(), // cached/refresh
  ]);
}