// ../js/qr.js
// QR-Generator + Logo2 (GDL) + Sticker + Multi-Sticker Sammlung (Queue) + A4 Export
// Voraussetzung: core.js lädt VORHER und stellt window.getBetriebe() bereit.

let qrCanvas = null;
let stickerCanvas = null;

// Autofill: wenn Nutzer Feld manuell ändert, überschreiben wir nicht mehr automatisch
let overrideBetrieb = false;
let overrideAnschrift = false;

let betriebMap = new Map(); // bkz -> { name, anschrift, raw }
let betrLoaded = false;

// Sammlung (persistiert im Browser je Wahl)
let collection = []; // [{key, wahl, bkz, betrieb, dataUrl}]
const COLLECTION_LS_PREFIX = "qr_sticker_collection:";

function $(id) { return document.getElementById(id); }

function getWahlFromContext() {
  const params = new URLSearchParams(window.location.search);
  return params.get("wahl") || localStorage.getItem("wahlId") || "";
}

function setPageTitle() {
  const wahl = getWahlFromContext();
  const el = document.getElementById("wahlTitle");
  if (!el) return;

  if (wahl) {
    el.textContent = wahl.toUpperCase();
    el.style.display = "inline-block";
  } else {
    el.textContent = "";
    el.style.display = "none";
  }
}

function setStatus(msg) {
  const el = $("qrStatus");
  if (el) el.textContent = msg || "";
}

function getFormValues() {
  return {
    wahl: getWahlFromContext(),
    bkz: $("bkz")?.value?.trim() || "",
    betrieb: $("betrieb")?.value?.trim() || "[Wahlbetrieb]",
    vorsitz: $("vorsitz")?.value?.trim() || "[Wahlvorstand]",
    anschrift: $("anschrift")?.value?.trim() || "[Anschrift]",
    email: $("email")?.value?.trim() || "wahlvorstand@firma.de",
  };
}

/* ===========================
   QR URL (komprimierter Payload)
   -> wahl2.html?p=...
=========================== */
function buildQrUrlFromValues(values) {
  const baseurl = "https://akzimmer1975-beep.github.io/Wahlablagen/pages/wahl2.html";

  const payload = {
    w: values.wahl,
    b: values.bkz,
    n: values.betrieb,
    v: values.vorsitz,
    a: values.anschrift,
    e: values.email
  };

  const json = JSON.stringify(payload);
  const packed = LZString.compressToEncodedURIComponent(json);
  return `${baseurl}?p=${packed}`;
}

function buildQrUrl() {
  return buildQrUrlFromValues(getFormValues());
}

/* ===========================
   QR DOM HELPER: canvas ODER img
=========================== */
function waitForQrElement(container, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const c = container.querySelector("canvas");
      if (c) return resolve({ type: "canvas", el: c });

      const img = container.querySelector("img");
      if (img && img.complete && img.naturalWidth > 0) return resolve({ type: "img", el: img });

      if (Date.now() - start > timeoutMs) return reject(new Error("QR element not found (canvas/img)"));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function imgToCanvas(img) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || 260;
  c.height = img.naturalHeight || 260;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/* ===========================
   LOGO in QR (logo2.png = GDL Schriftzug)
   WICHTIG: logo2.png im Repo-Root
   QR-Seite liegt in /pages -> daher ../logo2.png
   -> KEIN fetch(), nur Image() mit cache-bust
=========================== */
async function drawLogoIntoQr(canvas) {
  const logoUrl = new URL("../logo2.png", window.location.href).href;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = `${logoUrl}?v=${Date.now()}`; // cache bust

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error(`Logo konnte nicht geladen werden: ${img.src}`));
  });

  const ctx = canvas.getContext("2d");

  // GDL ist breit → proportional in die Mitte einpassen
  const maxW = Math.round(canvas.width * 0.42);
  const maxH = Math.round(canvas.height * 0.18);
  const scale = Math.min(maxW / img.width, maxH / img.height);

  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const x = Math.round((canvas.width - w) / 2);
  const y = Math.round((canvas.height - h) / 2);

  const pad = Math.round(Math.max(w, h) * 0.12);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2);

  ctx.drawImage(img, x, y, w, h);
}

/* ===========================
   BETRIEBE (BKZ -> Betrieb/Anschrift)
=========================== */
function normalizeBkz(x) {
  return String(x ?? "").trim();
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]).trim();
  }
  return "";
}

async function ensureBetriebeLoaded() {
  if (betrLoaded) return;

  if (typeof window.getBetriebe !== "function") {
    console.warn("getBetriebe() nicht gefunden. core.js muss vor qr.js geladen werden.");
    betrLoaded = true;
    return;
  }

  try {
    const list = await window.getBetriebe();
    const dl = $("bkzList");
    if (dl) dl.innerHTML = "";

    (Array.isArray(list) ? list : []).forEach((item) => {
      const bkz = normalizeBkz(pick(item, ["bkz", "BKZ", "Bkz", "id", "ID"]));
      if (!bkz) return;

      const name = pick(item, ["betrieb", "Betrieb", "name", "Name", "betriebsname", "Betriebsname"]);
      const anschrift = pick(item, ["anschrift", "Anschrift", "adresse", "Adresse", "ort", "Ort"]);

      betriebMap.set(bkz, { name, anschrift, raw: item });

      if (dl) {
        const opt = document.createElement("option");
        opt.value = bkz;
        opt.label = name ? `${bkz} – ${name}` : bkz;
        dl.appendChild(opt);
      }
    });
  } catch (e) {
    console.warn("Betriebe konnten nicht geladen werden:", e);
  } finally {
    betrLoaded = true;
  }
}

function applyBetriebFromBkz(bkz) {
  if (!bkz) return;
  const found = betriebMap.get(bkz);
  if (!found) return;

  const betrEl = $("betrieb");
  if (betrEl && (!overrideBetrieb || !betrEl.value.trim())) {
    if (found.name) betrEl.value = found.name;
    overrideBetrieb = false;
  }

  const anschEl = $("anschrift");
  if (anschEl && (!overrideAnschrift || !anschEl.value.trim())) {
    if (found.anschrift) anschEl.value = found.anschrift;
    overrideAnschrift = false;
  }
}

/* ===========================
   QR GENERATION
=========================== */
function clearQr() {
  const wrap = $("qrcode");
  if (wrap) wrap.innerHTML = "";
  qrCanvas = null;
}

async function generateQRCode() {
  clearQr();
  setStatus("Erzeuge QR-Code…");

  const wrap = $("qrcode");
  if (!wrap) return;

  // Guard 1: Libraries vorhanden?
  if (typeof QRCode === "undefined") {
    setStatus("❌ QRCode-Library nicht geladen.");
    return;
  }
  if (typeof LZString === "undefined") {
    setStatus("❌ LZString nicht geladen.");
    return;
  }

  let url;
  try {
    url = buildQrUrl();
  } catch (e) {
    console.error(e);
    setStatus("❌ Fehler beim Erstellen der QR-URL.");
    return;
  }

  try {
    new QRCode(wrap, {
      text: url,
      width: 260,
      height: 260,
      correctLevel: QRCode.CorrectLevel.H,
    });
  } catch (e) {
    console.error(e);
    setStatus("❌ QR-Code konnte nicht generiert werden (zu lang?).");
    return;
  }

  try {
    const qrEl = await waitForQrElement(wrap);
    let canvas = qrEl.type === "canvas" ? qrEl.el : imgToCanvas(qrEl.el);

    await drawLogoIntoQr(canvas);

    wrap.innerHTML = "";
    wrap.appendChild(canvas);

    qrCanvas = canvas;
    setStatus("QR-Code bereit ✅ (Logo eingefügt)");
  } catch (e) {
    console.error(e);
    setStatus("QR ohne Logo ⚠️");

    const c = wrap.querySelector("canvas");
    if (c) qrCanvas = c;
  }

  await buildStickerPreview();
}
// Refresh: QR verschwinden lassen + Sticker-Preview leeren. Sammlung bleibt!
function refreshPage() {
  clearQr();
  setStatus("");
  const preview = $("stickerPreview");
  if (preview) preview.innerHTML = "";
  stickerCanvas = null;
}

/* ===========================
   DOWNLOAD QR PNG / PDF
=========================== */
function downloadPNG() {
  if (!qrCanvas) return alert("Bitte zuerst einen QR-Code erstellen!");
  const v = getFormValues();

  const link = document.createElement("a");
  link.href = qrCanvas.toDataURL("image/png");
  link.download = `qrcode_${v.wahl || "wahl"}_${v.bkz || "ohneBKZ"}.png`;
  link.click();
}

async function downloadPDF() {
  if (!qrCanvas) return alert("Bitte zuerst einen QR-Code erstellen!");
  const { jsPDF } = window.jspdf;

  const v = getFormValues();
  const pdf = new jsPDF();

  const imgData = qrCanvas.toDataURL("image/png");
  pdf.setFontSize(16);
  pdf.text(`QR-Code – ${v.wahl || "Wahl"}`, 20, 20);
  pdf.addImage(imgData, "PNG", 45, 35, 120, 120);

  pdf.save(`qrcode_${v.wahl || "wahl"}_${v.bkz || "ohneBKZ"}.pdf`);
}

/* ===========================
   STICKER (90×55 mm)
=========================== */
function createStickerCanvas() {
  const W = 900;
  const H = 550;

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, W - 24, H - 24);

  return c;
}

async function drawStickerLogo(ctx) {
  const logoUrl = new URL("../logo2.png", window.location.href).href;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = `${logoUrl}?v=${Date.now()}`;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const maxW = 220;
  const maxH = 80;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  ctx.drawImage(img, 900 - w - 28, 28, w, h);
}

async function buildStickerPreview() {
  const preview = $("stickerPreview");
  if (!preview) return;

  if (!qrCanvas) {
    preview.innerHTML = "<div style='color:#333;font-weight:600;'>Erstelle zuerst einen QR-Code.</div>";
    stickerCanvas = null;
    return;
  }

  const v = getFormValues();
  const sticker = createStickerCanvas();
  const ctx = sticker.getContext("2d");

  ctx.fillStyle = "#000";
  ctx.font = "bold 32px Arial";
  ctx.fillText(v.wahl || "Wahl", 28, 60);

  ctx.font = "bold 28px Arial";
  ctx.fillText(v.betrieb, 28, 105);

  ctx.font = "20px Arial";
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  if (v.bkz) ctx.fillText(`BKZ: ${v.bkz}`, 28, 140);
  ctx.fillText(v.vorsitz, 28, 170);
  ctx.fillText(v.email, 28, 200);

  try { await drawStickerLogo(ctx); } catch {}

  const qrSize = 320;
  const qrX = Math.round((sticker.width - qrSize) / 2);
  const qrY = 210;
  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.font = "18px Arial";
  ctx.fillText("Scan → Briefwahlanforderung", 28, 520);

  preview.innerHTML = "";
  const img = new Image();
  img.src = sticker.toDataURL("image/png");
  img.style.maxWidth = "100%";
  img.style.height = "auto";
  preview.appendChild(img);

  stickerCanvas = sticker;
}

function downloadStickerPNG() {
  if (!stickerCanvas) return alert("Bitte zuerst einen QR-Code erstellen!");
  const v = getFormValues();

  const link = document.createElement("a");
  link.href = stickerCanvas.toDataURL("image/png");
  link.download = `qr_sticker_${v.wahl || "wahl"}_${v.bkz || "ohneBKZ"}_90x55.png`;
  link.click();

  addCurrentStickerToCollection();
}

async function downloadStickerPDF() {
  if (!stickerCanvas) return alert("Bitte zuerst einen QR-Code erstellen!");
  const { jsPDF } = window.jspdf;
  const v = getFormValues();

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [90, 55] });
  const imgData = stickerCanvas.toDataURL("image/png");
  pdf.addImage(imgData, "PNG", 0, 0, 90, 55);
  pdf.save(`qr_sticker_${v.wahl || "wahl"}_${v.bkz || "ohneBKZ"}_90x55.pdf`);

  addCurrentStickerToCollection();
}

/* ===========================
   SAMMLUNG (Queue) – je WahlId
=========================== */
function collectionKey() {
  const w = getWahlFromContext() || "default";
  return `${COLLECTION_LS_PREFIX}${w}`;
}

function loadCollection() {
  try {
    const raw = localStorage.getItem(collectionKey());
    collection = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(collection)) collection = [];
  } catch {
    collection = [];
  }
  renderCollectionUI();
}

function saveCollection() {
  localStorage.setItem(collectionKey(), JSON.stringify(collection));
  renderCollectionUI();
}

function addCurrentStickerToCollection() {
  if (!stickerCanvas) return alert("Bitte zuerst einen QR + Sticker erzeugen!");

  const v = getFormValues();
  const dataUrl = stickerCanvas.toDataURL("image/png");
  const key = `${v.wahl}|${v.bkz}|${v.betrieb}`;

  const exists = collection.some((x) => x.key === key);
  if (exists) {
    setStatus("Schon in der Sammlung (Duplikat) ⚠️");
    return;
  }

  collection.push({
    key,
    wahl: v.wahl,
    bkz: v.bkz,
    betrieb: v.betrieb,
    dataUrl,
  });

  saveCollection();
  setStatus("Zum Multi-Sticker hinzugefügt ✅");
}

function removeFromCollection(idx) {
  collection.splice(idx, 1);
  saveCollection();
}

function clearCollection() {
  if (!confirm("Sammlung wirklich leeren?")) return;
  collection = [];
  saveCollection();
}

function renderCollectionUI() {
  const list = $("collectionList");
  const count = $("collectionCount");
  if (count) count.textContent = String(collection.length);

  if (!list) return;
  list.innerHTML = "";

  if (collection.length === 0) {
    list.innerHTML = "<div style='color:#0b1f10;opacity:.75;font-weight:700;'>Noch keine Sticker gesammelt.</div>";
    return;
  }

  collection.forEach((item, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "collection-item";

    const img = document.createElement("img");
    img.className = "collection-thumb";
    img.src = item.dataUrl;
    img.alt = "Sticker";

    const info = document.createElement("div");
    info.className = "collection-info";
    info.innerHTML = `
      <div class="t1">${item.bkz ? `BKZ ${item.bkz}` : "Ohne BKZ"}</div>
      <div class="t2">${(item.betrieb || "").slice(0, 40)}</div>
    `;

    const btn = document.createElement("button");
    btn.className = "btn-secondary";
    btn.type = "button";
    btn.textContent = "Entfernen";
    btn.onclick = () => removeFromCollection(idx);

    wrap.appendChild(img);
    wrap.appendChild(info);
    wrap.appendChild(btn);
    list.appendChild(wrap);
  });
}

/* ===========================
   A4 aus SAMMLUNG drucken (2×5 pro Seite)
=========================== */
async function downloadA4FromCollection() {
  if (!collection.length) return alert("Sammlung ist leer.");

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });

  const stickerW = 90, stickerH = 55;
  const cols = 2, rows = 5;
  const pageW = 210, pageH = 297;

  const gapX = (pageW - cols * stickerW) / (cols + 1);
  const gapY = (pageH - rows * stickerH) / (rows + 1);

  let idx = 0;
  while (idx < collection.length) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (idx >= collection.length) break;

        const item = collection[idx++];
        const x = gapX + c * (stickerW + gapX);
        const y = gapY + r * (stickerH + gapY);

        pdf.addImage(item.dataUrl, "PNG", x, y, stickerW, stickerH);
      }
    }
    if (idx < collection.length) pdf.addPage("a4");
  }

  const w = getWahlFromContext() || "wahl";
  pdf.save(`A4_Sticker_Sammlung_${w}_${collection.length}x.pdf`);
}

/* ===========================
   INIT
=========================== */
document.addEventListener("DOMContentLoaded", async () => {
  setPageTitle();

  loadCollection();

  $("betrieb")?.addEventListener("input", () => { overrideBetrieb = true; });
  $("anschrift")?.addEventListener("input", () => { overrideAnschrift = true; });

  ensureBetriebeLoaded();

  const params = new URLSearchParams(window.location.search);
  const bkzUrl = params.get("bkz");
  if (bkzUrl && $("bkz")) {
    $("bkz").value = bkzUrl;
    await ensureBetriebeLoaded();
    applyBetriebFromBkz(bkzUrl.trim());
  }

  $("bkz")?.addEventListener("input", async () => {
    await ensureBetriebeLoaded();
    applyBetriebFromBkz($("bkz").value.trim());
    if (qrCanvas) buildStickerPreview();
  });

  $("btn-generate")?.addEventListener("click", generateQRCode);
  $("btn-refresh")?.addEventListener("click", refreshPage);

  $("btn-png")?.addEventListener("click", downloadPNG);
  $("btn-pdf")?.addEventListener("click", downloadPDF);

  $("btn-sticker-png")?.addEventListener("click", downloadStickerPNG);
  $("btn-sticker-pdf")?.addEventListener("click", downloadStickerPDF);

  $("btn-add-to-collection")?.addEventListener("click", addCurrentStickerToCollection);

  $("btn-a4-from-collection")?.addEventListener("click", downloadA4FromCollection);
  $("btn-clear-collection")?.addEventListener("click", clearCollection);

  ["betrieb", "vorsitz", "anschrift", "email"].forEach((id) => {
    $(id)?.addEventListener("input", () => {
      if (qrCanvas) buildStickerPreview();
    });
  });

  if (bkzUrl) generateQRCode();
});

// Für alte inline onclick-Fälle
window.generateQRCode = generateQRCode;
window.downloadPNG = downloadPNG;
window.downloadPDF = downloadPDF;
window.downloadStickerPNG = downloadStickerPNG;
window.downloadStickerPDF = downloadStickerPDF;
window.downloadA4FromCollection = downloadA4FromCollection;