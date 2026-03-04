// js/ablage.js (Multiwahl)

function $(id) { return document.getElementById(id); }

const containers = [
  { dropId: "drop-wahlvorschlag",   filetype: "wahlvorschlag",   prog: "prog-wahlvorschlag",   status: "status-wahlvorschlag",   list: "list-wahlvorschlag" },
  { dropId: "drop-wahlausschreiben", filetype: "wahlausschreiben", prog: "prog-wahlausschreiben", status: "status-wahlausschreiben", list: "list-wahlausschreiben" },
  { dropId: "drop-niederschrift",   filetype: "niederschrift",   prog: "prog-niederschrift",   status: "status-niederschrift",   list: "list-niederschrift" },
  { dropId: "drop-bekanntmachung",  filetype: "bekanntmachung",  prog: "prog-bekanntmachung",  status: "status-bekanntmachung",  list: "list-bekanntmachung" },
  { dropId: "drop-sonstige",        filetype: "sonstige",        prog: "prog-sonstige",        status: "status-sonstige",        list: "list-sonstige" }
];

let refreshTimer = null;
function refreshFileListDebounced() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(loadExistingFiles, 300);
}

function apiFilesUrl() {
  const wahlId = requireWahlOrRedirect();
  return `${API_BASE}/api/${encodeURIComponent(wahlId)}/files`;
}
function apiUploadUrl() {
  const wahlId = requireWahlOrRedirect();
  return `${API_BASE}/api/${encodeURIComponent(wahlId)}/upload`;
}

// ============================
// EXISTIERENDE DATEIEN LADEN
// ============================
async function loadExistingFiles() {
  const bezirk = $("bezirk")?.value;
  const bkz    = $("bkz")?.value.trim();

  const overview = $("existing-files");

  // Ziel-Listen je Container (Uploadboxen)
  const perContainerTargets = {
    wahlvorschlag: $("list-wahlvorschlag"),
    wahlausschreiben: $("list-wahlausschreiben"),
    niederschrift: $("list-niederschrift"),
    bekanntmachung: $("list-bekanntmachung"),
    sonstige: $("list-sonstige"),
  };

  // Reihenfolge wie gewünscht
  const ORDER = ["wahlvorschlag", "wahlausschreiben", "niederschrift", "bekanntmachung", "sonstige"];
  const LABEL = {
    wahlvorschlag: "Wahlvorschlag",
    wahlausschreiben: "Wahlausschreiben",
    niederschrift: "Niederschrift",
    bekanntmachung: "Bekanntmachung",
    sonstige: "Sonstige Unterlagen",
  };

  // Clear targets
  if (overview) overview.textContent = "";
  Object.values(perContainerTargets).forEach(t => { if (t) t.innerHTML = ""; });

  if (!bezirk || !bkz) {
    if (overview) overview.textContent = "Bitte Bezirk und BKZ auswählen";
    return;
  }

  // Hilfsfunktionen
  const toLocal = (ts) => {
    try { return new Date(ts).toLocaleString("de-DE"); } catch { return ""; }
  };

  const normalizeContainer = (f) => {
    // bevorzugt explizite Felder
    const raw =
      (f.container ?? f.containers ?? f.filetype ?? f.type ?? f.category ?? "")
        .toString().toLowerCase().trim();

    const map = {
      "wahlvorschlag": "wahlvorschlag",
      "wahlausschreiben": "wahlausschreiben",
      "niederschrift": "niederschrift",
      "bekanntmachung": "bekanntmachung",
      "sonstige": "sonstige",
      "sonstigeunterlagen": "sonstige",
      "sonstige_unterlagen": "sonstige",
      "sonstige-unterlagen": "sonstige",
      "other": "sonstige",
      "misc": "sonstige",
    };
    if (map[raw]) return map[raw];

    // Fallback: aus Pfad/Ordner ableiten
    const path = (f.path ?? f.folder ?? f.relativePath ?? "").toString().toLowerCase();
    for (const key of ORDER) {
      if (path.includes(key)) return key;
    }
    return "sonstige";
  };

  const renderUl = (files) => {
    const ul = document.createElement("ul");
    files.forEach(f => {
      const li = document.createElement("li");

      // Wenn URL vorhanden: Link, sonst Text
      if (f.url) {
        const a = document.createElement("a");
        a.href = f.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = f.name || "(ohne Name)";
        li.appendChild(a);
      } else {
        li.appendChild(document.createTextNode(f.name || "(ohne Name)"));
      }

      const br = document.createElement("br");
      li.appendChild(br);

      const small = document.createElement("small");
      small.textContent = toLocal(f.lastModified);
      li.appendChild(small);

      ul.appendChild(li);
    });
    return ul;
  };

  try {
    const url = `${apiFilesUrl()}?bezirk=${encodeURIComponent(bezirk)}&bkz=${encodeURIComponent(bkz)}`;
    const res = await fetch(url);
    const files = await res.json();

    if (!Array.isArray(files) || files.length === 0) {
      if (overview) overview.textContent = "Keine Dateien vorhanden";
      return;
    }

    // sortiere neueste zuerst
    files.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    // gruppieren
    const grouped = {};
    ORDER.forEach(k => grouped[k] = []);
    files.forEach(f => {
      const k = normalizeContainer(f);
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(f);
    });

    // 1) In die Uploadboxen schreiben (ohne Überschrift)
    ORDER.forEach(k => {
      const target = perContainerTargets[k];
      if (!target) return;
      const arr = grouped[k] || [];
      if (arr.length === 0) {
        target.innerHTML = `<span class="muted">—</span>`;
        return;
      }
      target.appendChild(renderUl(arr));
    });

    // 2) Rechte Übersicht gruppiert mit Überschriften
    if (overview) {
      overview.innerHTML = "";
      ORDER.forEach(k => {
        const arr = grouped[k] || [];

        const h4 = document.createElement("h4");
        h4.className = "existing-group";
        h4.textContent = `${LABEL[k]} (${arr.length})`;
        overview.appendChild(h4);

        if (arr.length === 0) {
          const div = document.createElement("div");
          div.className = "muted";
          div.textContent = "—";
          overview.appendChild(div);
        } else {
          overview.appendChild(renderUl(arr));
        }
      });
    }
  } catch (err) {
    console.error("Fehler beim Laden vorhandener Dateien:", err);
    if (overview) overview.textContent = "Fehler beim Laden vorhandener Dateien";
  }
}

// ============================
// DRAG & DROP SETUP
// ============================
function setupDrops() {
  document.addEventListener("dragover", e => e.preventDefault());
  document.addEventListener("drop", e => e.preventDefault());

  containers.forEach(c => {
    const el = $(c.dropId);
    if (!el) return;

    // verstecktes Input-Feld
    let input = $(`file-${c.filetype}`);
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = `file-${c.filetype}`;
      input.multiple = true;
      input.style.display = "none";
      document.body.appendChild(input);
    }

    el.addEventListener("dragover", e => { e.preventDefault(); el.classList.add("hover"); });
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
  const el     = $(container.dropId);
  const status = $(container.status);
  const prog   = $(container.prog);
  const list   = $(container.list);

  if (!el) return;
  el._files = files;

  if (list) list.innerHTML = "";
  for (let f of files) {
    const div = document.createElement("div");
    div.textContent = `📄 ${f.name} (${Math.round(f.size / 1024)} KB)`;
    list?.appendChild(div);
  }

  if (status) status.textContent = `${files.length} Datei(en) bereit`;
  if (prog) {
    prog.value = 0;
    prog.style.display = "none";
  }

  updateUploadButton();
}

// ============================
// UPLOAD BUTTON
// ============================
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
// DATEISTEMPEL (nur für "sonstige")
// ============================
function stampFilenameWithDate(originalName) {
  // Lokalzeit (nicht UTC), Format: YYYY-MM-DD
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const stamp = `${yyyy}-${mm}-${dd}`;

  // fügt _YYYY-MM-DD vor der Dateiendung ein
  return originalName.replace(/(\.[^/.]+)$/, `_${stamp}$1`);
}

// ============================
// EINZELDATEI-UPLOAD
// ============================
function uploadSingleFile(file, filetype, container) {
  return new Promise((resolve, reject) => {
    const bezirk = $("bezirk")?.value;
    const bkz    = $("bkz")?.value;

    if (!bezirk || !bkz) {
      reject("Bezirk/BKZ fehlt");
      return;
    }

    const form = new FormData();
    form.append("bezirk", bezirk);
    form.append("bkz", bkz);
    form.append("containers", filetype);
    const uploadName = (filetype === "sonstige") ? stampFilenameWithDate(file.name) : file.name;
    form.append("files", file, uploadName);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUploadUrl());

    const progEl   = $(container.prog);
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
        statusEl && (statusEl.textContent = "✓ Erfolgreich hochgeladen");
        refreshFileListDebounced();
        resolve(true);
      } else {
        statusEl && (statusEl.textContent = `❌ Fehler (${xhr.status})`);
        reject(xhr.status);
      }
    };

    xhr.onerror = () => {
      statusEl && (statusEl.textContent = "❌ Netzwerkfehler");
      reject("network");
    };

    xhr.send(form);
  });
}

// ============================
// ALLE UPLOADS
// ============================
async function uploadAll() {
  const btn = $("upload-btn");
  if (!btn) return;

  btn.disabled = true;

  let totalCount = 0;
  let successCount = 0;

  containers.forEach(c => {
    const el = $(c.dropId);
    if (el && el._files) totalCount += el._files.length;
  });

  if (totalCount === 0) {
    btn.disabled = false;
    return;
  }

  for (let c of containers) {
    const el = $(c.dropId);
    if (!el || !el._files) continue;

    for (let file of el._files) {
      try {
        await uploadSingleFile(file, c.filetype, c);
        successCount++;
      } catch (err) {
        console.error("Fehler bei Datei:", file.name, err);
      }
    }
  }

  if (successCount === totalCount) {
    resetUploadUI();
    alert("Alle Dateien wurden erfolgreich hochgeladen.");
    btn.disabled = true;
  } else {
    alert(`Upload abgeschlossen mit Fehlern.\n${successCount} von ${totalCount} Dateien erfolgreich.`);
    btn.disabled = false;
  }
}

// ============================
// RESET UI
// ============================
function resetUploadUI() {
  containers.forEach(c => {
    const el     = $(c.dropId);
    const list   = $(c.list);
    const status = $(c.status);
    const prog   = $(c.prog);

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
// INIT
// ============================
document.addEventListener("DOMContentLoaded", () => {
  const wahlId = requireWahlOrRedirect();
  if (!wahlId) return;

  const title = $("pageTitle");
  if (title) title.textContent = `Betrieb anlegen / bearbeiten – ${getWahlName() || wahlId}`;

  setupDrops();
  $("upload-btn")?.addEventListener("click", uploadAll);

  // Felder automatisch aus URL vorausfüllen
  const params = new URLSearchParams(window.location.search);
  const bezirkEl = $("bezirk");
  const bkzEl    = $("bkz");

  if (params.get("bezirk") && bezirkEl) bezirkEl.value = params.get("bezirk");
  if (params.get("bkz") && bkzEl)       bkzEl.value = params.get("bkz");

  // Event-Listener für automatische Dateiliste
  if (bezirkEl) bezirkEl.addEventListener("change", refreshFileListDebounced);
  if (bkzEl)    bkzEl.addEventListener("input", refreshFileListDebounced);

  // Initial Dateiliste laden
  refreshFileListDebounced();

  // Upload-Button prüfen
  updateUploadButton();
});