// ../js/qr.js

let qrCanvas = null;
let stickerCanvas = null;

// Autofill-Logik: wenn Nutzer Feld manuell ändert, überschreiben wir nicht mehr automatisch
let overrideBetrieb = false;
let overrideAnschrift = false;

let betriebMap = new Map(); // bkz -> { name, anschrift, raw }
let betrLoaded = false;

// Sammlung (persistiert im Browser)
let collection = []; // [{key, wahl, bkz, betrieb, dataUrl}]
const COLLECTION_LS_PREFIX = "qr_sticker_collection:";

function $(id){ return document.getElementById(id); }

function getWahlFromContext() {
  const params = new URLSearchParams(window.location.search);
  return params.get("wahl") || localStorage.getItem("wahlId") || "";
}

function setPageTitle() {
  const wahl = getWahlFromContext();
  const el = $("pageTitle");
  if (!el) return;
  el.textContent = wahl ? `QR-Generator – "${wahl}"` : "QR-Generator";
}

function setStatus(msg){
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
    email: $("email")?.value?.trim() || "wahlvorstand@firma.de"
  };
}

function buildQrUrl() {
  const baseurl = "https://akzimmer1975-beep.github.io/Dashboard/pages/wahl2.html";
  const v = getFormValues();

  return `${baseurl}?wahl=${encodeURIComponent(v.wahl)}`
    + `&bkz=${encodeURIComponent(v.bkz)}`
    + `&betrieb=${encodeURIComponent(v.betrieb)}`
    + `&vorsitz=${encodeURIComponent(v.vorsitz)}`
    + `&anschrift=${encodeURIComponent(v.anschrift)}`
    + `&email=${encodeURIComponent(v.email)}`;
}

/* ===========================
   QR DOM HELPER: canvas ODER img
=========================== */
function waitForQrElement(container, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const c = container.querySelector("canvas");
      if (c) return resolve({ type: "canvas", el: c });

      const img = container.querySelector("img");
      if (img && img.complete && img.naturalWidth > 0) return resolve({ type: "img", el: img });

      if (Date.now() - start > timeoutMs) return reject(new Error("QR element not found"));
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

async function drawLogoIntoQr(canvas) {
  const logoUrl = "../logo.png";
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = logoUrl;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const ctx = canvas.getContext("2d");
  const size = Math.round(canvas.width * 0.22);
  const x = Math.round((canvas.width - size) / 2);
  const y = Math.round((canvas.height - size) / 2);

  // weißes Feld unter Logo
  const pad = Math.round(size * 0.12);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x - pad, y - pad, size + pad * 2, size + pad * 2);

  ctx.drawImage(img, x, y, size, size);
}

/* ===========================
   BETRIEBE (BKZ -> Betrieb/Anschrift)
=========================== */
function normalizeBkz(x){
  return String(x ?? "").trim();
}
function pick(obj, keys){
  for (const k of keys){
    if (obj && obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]).trim();
  }
  return "";
}

async function ensureBetriebeLoaded(){
  if (betrLoaded) return;

  if (typeof window.getBetriebe !== "function") {
    console.warn("getBetriebe() nicht gefunden. core.js muss vor qr.js geladen werden.");
    betrLoaded = true;
    return;
  }

  try{
    const list = await window.getBetriebe();
    const dl = $("bkzList");
    if (dl) dl.innerHTML = "";

    (Array.isArray(list) ? list : []).forEach(item => {
      const bkz = normalizeBkz(pick(item, ["bkz","BKZ","Bkz","id","ID"]));
      if (!bkz) return;

      const name = pick(item, ["betrieb","Betrieb","name","Name","betriebsname","Betriebsname"]);
      const anschrift = pick(item, ["anschrift","Anschrift","adresse","Adresse","ort","Ort"]);

      betriebMap.set(bkz, { name, anschrift, raw: item });

      if (dl){
        const opt = document.createElement("option");
        opt.value = bkz;
        opt.label = name ? `${bkz} – ${name}` : bkz;
        dl.appendChild(opt);
      }
    });

  } catch(e){
    console.warn("Betriebe konnten nicht geladen werden:", e);
  } finally {
    betrLoaded = true;
  }
}

function applyBetriebFromBkz(bkz){
  if (!bkz) return;
  const found = betriebMap.get(bkz);
  if (!found) return;

  const betrEl = $("betrieb");
  if (betrEl && (!overrideBetrieb || !betrEl.value.trim())){
    if (found.name) betrEl.value = found.name;
    overrideBetrieb = false;
  }

  const anschEl = $("anschrift");
  if (anschEl && (!overrideAnschrift || !anschEl.value.trim())){
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

  const url = buildQrUrl();

  new QRCode(wrap, {
    text: url,
    width: 260,
    height: 260,
    correctLevel: QRCode.CorrectLevel.H
  });

  try {
    const qrEl = await waitForQrElement(wrap);
    let canvas = (qrEl.type === "canvas") ? qrEl.el : imgToCanvas(qrEl.el);

    await drawLogoIntoQr(canvas);

    // Anzeige immer als Canvas mit Logo
    wrap.innerHTML = "";
    wrap.appendChild(canvas);

    qrCanvas = canvas;
    setStatus("QR-Code bereit ✅");
  } catch (e) {
    console.error(e);
    setStatus("QR-Code erzeugt (ohne Logo) ⚠️");
    // best effort:
    const c = wrap.querySelector("canvas");
    if (c) qrCanvas = c;
  }

  await buildStickerPreview();
}

// Refresh: QR verschwinden lassen + Sticker-Preview leeren. Sammlung bleibt!
function refreshPage(){
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
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = "../logo.png";

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const w = 180;
  const h = Math.round((img.height / img.width) * w);
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

  // OPTIONAL: beim Speichern automatisch sammeln (hier: JA)
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

  // OPTIONAL: beim Speichern automatisch sammeln (hier: JA)
  addCurrentStickerToCollection();
}

/* ===========================
   SAMMLUNG (Queue)
=========================== */
function collectionKey(){
  const w = getWahlFromContext() || "default";
  return `${COLLECTION_LS_PREFIX}${w}`;
}

function loadCollection(){
  try{
    const raw = localStorage.getItem(collectionKey());
    collection = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(collection)) collection = [];
  } catch {
    collection = [];
  }
  renderCollectionUI();
}

function saveCollection(){
  localStorage.setItem(collectionKey(), JSON.stringify(collection));
  renderCollectionUI();
}

function addCurrentStickerToCollection(){
  if (!stickerCanvas) return alert("Bitte zuerst einen QR + Sticker erzeugen!");

  const v = getFormValues();
  const dataUrl = stickerCanvas.toDataURL("image/png");
  const key = `${v.wahl}|${v.bkz}|${v.betrieb}`;

  // Duplikat-Schutz: gleiche Wahl+BKZ+Betrieb nicht doppelt
  const exists = collection.some(x => x.key === key);
  if (exists){
    setStatus("Schon in der Sammlung (Duplikat) ⚠️");
    return;
  }

  collection.push({
    key,
    wahl: v.wahl,
    bkz: v.bkz,
    betrieb: v.betrieb,
    dataUrl
  });

  saveCollection();
  setStatus("Zum Multi-Sticker hinzugefügt ✅");
}

function removeFromCollection(idx){
  collection.splice(idx, 1);
  saveCollection();
}

function clearCollection(){
  if (!confirm("Sammlung wirklich leeren?")) return;
  collection = [];
  saveCollection();
}

function renderCollectionUI(){
  const list = $("collectionList");
  const count = $("collectionCount");
  if (count) count.textContent = String(collection.length);

  if (!list) return;
  list.innerHTML = "";

  if (collection.length === 0){
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
   A4 aus SAMMLUNG drucken
=========================== */
async function downloadA4FromCollection(){
  if (!collection.length) return alert("Sammlung ist leer.");

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });

  // 2×5 pro Seite, Sticker 90×55mm
  const stickerW = 90, stickerH = 55;
  const cols = 2, rows = 5;
  const pageW = 210, pageH = 297;

  const gapX = (pageW - cols * stickerW) / (cols + 1);
  const gapY = (pageH - rows * stickerH) / (rows + 1);

  let idx = 0;
  while (idx < collection.length) {
    for (let r=0; r<rows; r++){
      for (let c=0; c<cols; c++){
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
   A4 aus BKZ-Liste (bleibt)
=========================== */
function parseBkzList(raw){
  return raw
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

// erzeugt QR canvas für eine URL (offscreen), inkl. Logo
async function makeQrCanvasForUrl(url){
  const tmp = document.createElement("div");
  tmp.style.position = "fixed";
  tmp.style.left = "-9999px";
  tmp.style.top = "-9999px";
  document.body.appendChild(tmp);

  new QRCode(tmp, {
    text: url,
    width: 260,
    height: 260,
    correctLevel: QRCode.CorrectLevel.H
  });

  const qrEl = await waitForQrElement(tmp);
  let canvas = (qrEl.type === "canvas") ? qrEl.el : imgToCanvas(qrEl.el);

  try { await drawLogoIntoQr(canvas); } catch {}
  tmp.remove();
  return canvas;
}

async function makeStickerCanvasForValues(values){
  const baseurl = "https://akzimmer1975-beep.github.io/Dashboard/pages/wahl2.html";
  const url =
    `${baseurl}?wahl=${encodeURIComponent(values.wahl)}`
    + `&bkz=${encodeURIComponent(values.bkz)}`
    + `&betrieb=${encodeURIComponent(values.betrieb)}`
    + `&vorsitz=${encodeURIComponent(values.vorsitz)}`
    + `&anschrift=${encodeURIComponent(values.anschrift)}`
    + `&email=${encodeURIComponent(values.email)}`;

  const qrc = await makeQrCanvasForUrl(url);

  const sticker = createStickerCanvas();
  const ctx = sticker.getContext("2d");

  ctx.fillStyle = "#000";
  ctx.font = "bold 32px Arial";
  ctx.fillText(values.wahl || "Wahl", 28, 60);

  ctx.font = "bold 28px Arial";
  ctx.fillText(values.betrieb || "[Wahlbetrieb]", 28, 105);

  ctx.font = "20px Arial";
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  if (values.bkz) ctx.fillText(`BKZ: ${values.bkz}`, 28, 140);
  ctx.fillText(values.vorsitz || "[Wahlvorstand]", 28, 170);
  ctx.fillText(values.email || "wahlvorstand@firma.de", 28, 200);

  try { await drawStickerLogo(ctx); } catch {}

  const qrSize = 320;
  const qrX = Math.round((sticker.width - qrSize) / 2);
  const qrY = 210;
  ctx.drawImage(qrc, qrX, qrY, qrSize, qrSize);

  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.font = "18px Arial";
  ctx.fillText("Scan → Briefwahlanforderung", 28, 520);

  return sticker;
}

async function downloadA4StickerPDF(){
  await ensureBetriebeLoaded();

  const raw = $("batchBkz")?.value?.trim() || "";
  let items = raw ? parseBkzList(raw) : [];

  if (items.length === 0) {
    const cur = $("bkz")?.value?.trim();
    if (cur) items = [cur];
  }

  if (items.length === 0) {
    alert("Bitte mindestens eine BKZ eintragen (oder oben eine BKZ setzen).");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });

  const stickerW = 90, stickerH = 55;
  const cols = 2, rows = 5;
  const pageW = 210, pageH = 297;

  const gapX = (pageW - cols * stickerW) / (cols + 1);
  const gapY = (pageH - rows * stickerH) / (rows + 1);

  const base = getFormValues();
  let idx = 0;

  while (idx < items.length) {
    for (let r=0; r<rows; r++){
      for (let c=0; c<cols; c++){
        if (idx >= items.length) break;

        const bkz = items[idx++];

        const found = betriebMap.get(bkz);
        const betrieb = (found?.name || base.betrieb || "[Wahlbetrieb]");
        const anschrift = (found?.anschrift || base.anschrift || "[Anschrift]");

        const sticker = await makeStickerCanvasForValues({
          ...base,
          bkz,
          betrieb,
          anschrift
        });

        const img = sticker.toDataURL("image/png");
        const x = gapX + c * (stickerW + gapX);
        const y = gapY + r * (stickerH + gapY);

        pdf.addImage(img, "PNG", x, y, stickerW, stickerH);
      }
    }
    if (idx < items.length) pdf.addPage("a4");
  }

  pdf.save(`A4_Sticker_${base.wahl || "wahl"}_${items.length}x.pdf`);
}

/* ===========================
   INIT
=========================== */
document.addEventListener("DOMContentLoaded", async () => {
  setPageTitle();

  // Sammlung laden (wahl-spezifisch)
  loadCollection();

  // Override detection (manuelles Überschreiben)
  $("betrieb")?.addEventListener("input", () => { overrideBetrieb = true; });
  $("anschrift")?.addEventListener("input", () => { overrideAnschrift = true; });

  // Betriebe laden + Datalist füllen
  ensureBetriebeLoaded();

  // URL Parameter BKZ übernehmen
  const params = new URLSearchParams(window.location.search);
  const bkzUrl = params.get("bkz");
  if (bkzUrl && $("bkz")) {
    $("bkz").value = bkzUrl;
    await ensureBetriebeLoaded();
    applyBetriebFromBkz(bkzUrl.trim());
  }

  // BKZ Input => Autofill Vorschlag
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

  $("btn-a4")?.addEventListener("click", downloadA4StickerPDF);

  // Optional: wenn BKZ aus URL kam -> direkt generieren
  if (bkzUrl) generateQRCode();
});

// Für alte inline onclick-Fälle (falls irgendwo noch benutzt)
window.generateQRCode = generateQRCode;