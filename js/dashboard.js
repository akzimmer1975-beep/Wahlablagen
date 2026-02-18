// ============================
// CONFIG
// ============================
const apiFiles    = "https://nexrcloud-backend-2-1.onrender.com/api/files";
const apiUpload   = "https://nexrcloud-backend-2-1.onrender.com/api/upload";
const apiStatus   = "https://nexrcloud-backend-2-1.onrender.com/api/status";
const apiBetriebe = "https://nexrcloud-backend-2-1.onrender.com/api/betriebe-json";

// Hilfsfunktion
function $(id) { return document.getElementById(id); }

// ============================
// GLOBALS
// ============================
let betriebData = [];
let statusData  = [];
let filterBezirk = "";
let filterAmpel  = "";

// ============================
// LOAD BETRIEBE.JSON
// ============================
async function loadBetriebeNamen() {
  try {
    const res = await fetch(apiBetriebe);
    if (!res.ok) throw new Error(res.status);
    betriebData = await res.json();
  } catch (err) {
    console.error("betriebe.json nicht geladen:", err);
    betriebData = [];
  }
}

// ============================
// EXISTING FILES
// ============================
let refreshTimer = null;

function refreshFileListDebounced() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(loadExistingFiles, 300);
}

async function loadExistingFiles() {
  const bezirkEl = $("bezirk");
  const bkzEl    = $("bkz");
  const target   = $("existing-files");

  if (!bezirkEl || !bkzEl || !target) return;

  const bezirk = bezirkEl.value;
  const bkz    = bkzEl.value.trim();

  if (!bezirk || !bkz) {
    target.textContent = "Bitte Bezirk und BKZ auswählen";
    return;
  }

  try {
    const res = await fetch(`${apiFiles}?bezirk=${encodeURIComponent(bezirk)}&bkz=${encodeURIComponent(bkz)}`);
    const files = await res.json();

    if (!files.length) {
      target.textContent = "Keine Dateien vorhanden";
      return;
    }

    files.sort((a,b) => new Date(b.lastModified) - new Date(a.lastModified));

    target.innerHTML = `<ul>${files.map(f => `
      <li>
        ${f.name}<br>
        <small>${new Date(f.lastModified).toLocaleString("de-DE")}</small>
      </li>`).join("")}</ul>`;

  } catch (err) {
    console.error("Fehler beim Laden der Dateien", err);
    target.textContent = "Fehler beim Laden der Dateien";
  }
}

// ============================
// DRAG & DROP
// ============================
const containers = [
  { dropId: "drop-wahlausschreiben", filetype: "wahlausschreiben", prog: "prog-wahlausschreiben", status: "status-wahlausschreiben", list: "list-wahlausschreiben" },
  { dropId: "drop-niederschrift",   filetype: "niederschrift",   prog: "prog-niederschrift",   status: "status-niederschrift",   list: "list-niederschrift" },
  { dropId: "drop-wahlvorschlag",   filetype: "wahlvorschlag",   prog: "prog-wahlvorschlag",   status: "status-wahlvorschlag",   list: "list-wahlvorschlag" }
];

function setupDrops() {
  document.addEventListener("dragover", e => e.preventDefault());
  document.addEventListener("drop", e => e.preventDefault());

  containers.forEach(c => {
    const el = $(c.dropId);
    if (!el) return;

    let input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);

    el.addEventListener("dragover", e => {
      e.preventDefault();
      el.classList.add("hover");
    });

    el.addEventListener("dragleave", () => el.classList.remove("hover"));

    el.addEventListener("drop", e => {
      e.preventDefault();
      el.classList.remove("hover");
      handleFiles(c, e.dataTransfer.files);
    });

    el.addEventListener("click", () => input.click());

    input.addEventListener("change", e => handleFiles(c, e.target.files));
  });
}

function handleFiles(container, files) {
  const el = $(container.dropId);
  const status = $(container.status);
  const prog = $(container.prog);
  const list = $(container.list);

  if (!el) return;
  el._files = files;

  if (list) list.innerHTML = "";

  for (let f of files) {
    const div = document.createElement("div");
    div.textContent = `📄 ${f.name} (${Math.round(f.size/1024)} KB)`;
    list && list.appendChild(div);
  }

  if (status) status.textContent = `${files.length} Datei(en) bereit`;
  if (prog) {
    prog.value = 0;
    prog.style.display = "none";
  }

  updateUploadButton();
}

function updateUploadButton() {
  const btn = $("upload-btn");
  if (!btn) return;

  const hasFiles = containers.some(c => {
    const el = $(c.dropId);
    return el && el._files && el._files.length > 0;
  });

  btn.disabled = !hasFiles;
}

// ============================
// UPLOAD
// ============================
function uploadSingleFile(file, filetype, container) {
  return new Promise((resolve, reject) => {
    const bezirkEl = $("bezirk");
    const bkzEl = $("bkz");

    if (!bezirkEl || !bkzEl) {
      reject("Bezirk/BKZ fehlt");
      return;
    }

    const form = new FormData();
    form.append("bezirk", bezirkEl.value);
    form.append("bkz", bkzEl.value);
    form.append("containers", filetype);
    form.append("files", file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUpload);

    const progEl = $(container.prog);
    const statusEl = $(container.status);

    xhr.upload.onprogress = e => {
      if (e.lengthComputable && progEl && statusEl) {
        const p = Math.round((e.loaded / e.total) * 100);
        progEl.style.display = "block";
        progEl.value = p;
        statusEl.textContent = `Upload: ${p}%`;
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        if (statusEl) statusEl.textContent = "✓ Erfolgreich hochgeladen";
        refreshFileListDebounced();
        resolve(true);
      } else {
        if (statusEl) statusEl.textContent = `❌ Fehler (${xhr.status})`;
        reject(xhr.status);
      }
    };

    xhr.onerror = () => {
      if (statusEl) statusEl.textContent = "❌ Netzwerkfehler";
      reject("network");
    };

    xhr.send(form);
  });
}

async function uploadAll() {
  const btn = $("upload-btn");
  if (!btn) return;

  btn.disabled = true;

  let total = 0;
  let success = 0;

  containers.forEach(c => {
    const el = $(c.dropId);
    if (el && el._files) total += el._files.length;
  });

  if (total === 0) {
    btn.disabled = false;
    return;
  }

  for (let c of containers) {
    const el = $(c.dropId);
    if (!el || !el._files) continue;

    for (let file of el._files) {
      try {
        await uploadSingleFile(file, c.filetype, c);
        success++;
      } catch(e) {
        console.error("Uploadfehler:", file.name, e);
      }
    }
  }

  if (success === total) {
    alert("Alle Dateien erfolgreich hochgeladen.");
    resetUploadUI();
    btn.disabled = true;
  } else {
    alert(`${success} von ${total} Dateien erfolgreich.`);
    btn.disabled = false;
  }
}

function resetUploadUI() {
  containers.forEach(c => {
    const el = $(c.dropId);
    const list = $(c.list);
    const status = $(c.status);
    const prog = $(c.prog);

    if (el) el._files = null;
    if (list) list.innerHTML = "";
    if (status) status.textContent = "";
    if (prog) {
      prog.value = 0;
      prog.style.display = "none";
    }
  });

  updateUploadButton();
}

// ============================
// STATUS / DASHBOARD
// ============================
async function loadStatus() {
  const container = $("status-list");
  if (!container) return;

  try {
    const res = await fetch(apiStatus);
    if (!res.ok) throw new Error(res.status);
    statusData = await res.json();

    populateBezirkDropdown();
    renderStatus();

  } catch (err) {
    console.error("Status konnte nicht geladen werden:", err);
    container.innerHTML = "<p>Fehler beim Laden der Statusdaten</p>";
  }
}

function renderStatus() {
  const container = $("status-list");
  if (!container) return;

  container.innerHTML = "";

  let data = [...statusData];

  if (filterBezirk) data = data.filter(e => e.bezirk === filterBezirk);
  if (filterAmpel)  data = data.filter(e => e.ampel === filterAmpel);

  data.sort((a,b) => (a.bezirk || "").localeCompare(b.bezirk || "") || (a.bkz || "").localeCompare(b.bkz || ""));

  let currentBezirk = null;

  data.forEach(entry => {

    if (entry.bezirk !== currentBezirk) {
      currentBezirk = entry.bezirk;
      const h = document.createElement("div");
      h.className = "bezirk-header";
      h.textContent = currentBezirk || "–";
      container.appendChild(h);
    }

    const card = document.createElement("div");
    card.className = "card";

    const color = entry.ampel === "gruen" ? "green" :
                  entry.ampel === "gelb"  ? "gold"  : "red";

    const betrieb = betriebData.find(b => b.bkz === entry.bkz);
    const name = betrieb ? betrieb.betrieb : "–";

    card.innerHTML = `
      <div class="bkz-link">
        <a href="marker.html?bkz=${entry.bkz}&bezirk=${encodeURIComponent(entry.bezirk)}" target="_blank">
          <span class="ampel" style="background:${color}"></span> ${entry.bkz}
        </a>
      </div>
      <div class="betrieb">${name}</div>
      <div class="files">${entry.files} / ${entry.bezirk}</div>
    `;

    container.appendChild(card);
  });
}

// ============================
// FILTERS
// ============================
function populateBezirkDropdown() {
  const select = $("bezirkFilter");
  if (!select) return;

  const bezirke = [...new Set(statusData.map(s => s.bezirk).filter(b => b))].sort();

  select.innerHTML = `<option value="">Alle Bezirke</option>`;

  bezirke.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    select.appendChild(opt);
  });
}

function setupFilters() {
  const bezirkSelect = $("bezirkFilter");
  if (bezirkSelect) {
    bezirkSelect.addEventListener("change", e => {
      filterBezirk = e.target.value;
      renderStatus();
    });
  }

  document.querySelectorAll(".ampel-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ampel-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      filterAmpel = btn.dataset.filter || "";
      renderStatus();
    });
  });
}

// ============================
// INIT
// ============================
document.addEventListener("DOMContentLoaded", async () => {
  await loadBetriebeNamen();
  setupDrops();
  setupFilters();
  await loadStatus();

  const uploadBtn = $("upload-btn");
  if (uploadBtn) uploadBtn.addEventListener("click", uploadAll);

  const params = new URLSearchParams(window.location.search);

  if (params.get("bezirk")) {
    const bf = $("bezirkFilter");
    if (bf) bf.value = params.get("bezirk");
  }

  if (params.get("bkz")) {
    const bkzInput = $("bkz");
    if (bkzInput) bkzInput.value = params.get("bkz");
  }

  const bf = $("bezirkFilter");
  if (bf) bf.addEventListener("change", refreshFileListDebounced);

  const bkz = $("bkz");
  if (bkz) bkz.addEventListener("input", refreshFileListDebounced);

  refreshFileListDebounced();
  setInterval(loadStatus, 30000);
});
