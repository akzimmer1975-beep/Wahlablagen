// ../js/qr.js

let qrCanvas = null;
let stickerCanvas = null;

// Autofill-Logik: wenn Nutzer Feld manuell ändert, überschreiben wir nicht mehr automatisch
let overrideBetrieb = false;
let overrideAnschrift = false;

let betriebMap = new Map(); // bkz -> { name, anschrift, raw }
let betrLoaded = false;

function getWahlFromContext() {
  const params = new URLSearchParams(window.location.search);
  return params.get("wahl") || localStorage.getItem("wahlId") || "";
}

function setPageTitle() {
  const wahl = getWahlFromContext();
  const el = document.getElementById("pageTitle");
  if (!el) return;
  el.textContent = wahl ? `QR-Generator – "${wahl}"` : "QR-Generator";
}

function $(id){ return document.getElementById(id); }

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
  // Zielseite bei dir:
  const baseurl = "https://akzimmer1975-beep.github.io/Dashboard/pages/wahl2.html";

  const v = getFormValues();
  const url =
    `${baseurl}?wahl=${encodeURIComponent(v.wahl)}`
    + `&bkz=${encodeURIComponent(v.bkz)}`
    + `&betrieb=${encodeURIComponent(v.betrieb)}`
    + `&vorsitz=${encodeURIComponent(v.vorsitz)}`
    + `&anschrift=${encodeURIComponent(v.anschrift)}`
    + `&email=${encodeURIComponent(v.email)}`;

  return url;
}

function setStatus(msg){
  const el = $("qrStatus");
  if (el) el.textContent = msg || "";
}

function clearQr() {
  const wrap = $("qrcode");
  if (wrap) wrap.innerHTML = "";
  qrCanvas = null;
}

function waitForCanvas(container, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const c = container.querySelector("canvas");
      if (c) return resolve(c);
      if (Date.now() - start > timeoutMs) return reject(new Error("QR canvas not found"));
      requestAnimationFrame(tick);
    };
    tick();
  });
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

  const pad = Math.round(size * 0.12);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x - pad, y - pad, size + pad * 2, size + pad * 2);

  ctx.drawImage(img, x, y, size, size);
}

/* ===========================
   BETRIEBE (BKZ -> Betrieb/Anschrift)
   nutzt core.js getBetriebe()
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
    const list = await window.getBetriebe(); // Array aus Backend
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

  // Betrieb nur setzen wenn nicht manuell übersteuert oder leer
  const betrEl = $("betrieb");
  if (betrEl && (!overrideBetrieb || !betrEl.value.trim())){
    if (found.name) betrEl.value = found.name;
    overrideBetrieb = false; // Autofill zählt nicht als user override
  }

  const anschEl = $("anschrift");
  if (anschEl && (!overrideAnschrift || !anschEl.value.trim())){
    if (found.anschrift) anschEl.value = found.anschrift;
    overrideAnschrift = false;
  }
}

/* ===========================
   QR GENERATION (mit Logo + Level H)
=========================== */

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
    const canvas = await waitForCanvas(wrap);
    await drawLogoIntoQr(canvas);
    qrCanvas = canvas;
    setStatus("QR-Code bereit ✅");
  } catch (e) {
    console.error(e);
    setStatus("QR-Code erzeugt (ohne Logo) ⚠️");
    qrCanvas = wrap.querySelector("canvas");
  }

  await buildStickerPreview();
}

function refreshPage(){
  // Refresh soll nicht alles löschen – sondern neu rendern
  generateQRCode();
}

function downloadPNG() {
  if (!qrCanvas) {
    alert("Bitte zuerst einen QR-Code erstellen!");
    return;
  }
  const v = getFormValues();
  const link = document.createElement("a");
  link.href = qrCanvas.toDataURL("image/png");
  link.download = `qrcode_${v.wahl || "wahl"}_${v.bkz || "ohneBKZ"}.png`;
  link.click();
}

async function downloadPDF() {
  if (!qrCanvas) {
    alert("Bitte zuerst einen QR-Code erstellen!");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const v = getFormValues();
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
  if (!stickerCanvas) {
    alert("Bitte zuerst einen QR-Code erstellen (Sticker wird daraus gebaut).");
    return;
  }
  const v = getFormValues();
  const link = document.createElement("a");
  link.href = stickerCanvas.toDataURL("image/png");
  link.download = `qr_sticker_${v.wahl || "wahl"}_${v.bkz || "ohneBKZ"}_90x55.png`;
  link.click();
}

async function downloadStickerPDF() {
  if (!stickerCanvas) {
    alert("Bitte zuerst einen QR-Code erstellen (Sticker wird daraus gebaut).");
    return;
  }

  const { jsPDF } = window.jspdf;
  const v = getFormValues();

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [90, 55] });
  const imgData = stickerCanvas.toDataURL("image/png");
  pdf.addImage(imgData, "PNG", 0, 0, 90, 55);

  pdf.save(`qr_sticker_${v.wahl || "wahl"}_${v.bkz || "ohneBKZ"}_90x55.pdf`);
}

/* ===========================
   A4 MULTI-STICKER (2×5 pro Seite)
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

  const c = await waitForCanvas(tmp);
  try { await drawLogoIntoQr(c); } catch {}
  tmp.remove();
  return c;
}

async function makeStickerCanvasForValues(values){
  const url =
    `https://akzimmer1975-beep.github.io/Dashboard/pages/wahl2.html`
    + `?wahl=${encodeURIComponent(values.wahl)}`
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

  // Fallback: aktuelle BKZ
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

  // Layout: 2×5 pro Seite, Sticker 90×55mm
  const stickerW = 90, stickerH = 55;
  const cols = 2, rows = 5;
  const pageW = 210, pageH = 297;

  const gapX = (pageW - cols * stickerW) / (cols + 1);
  const gapY = (pageH - rows * stickerH) / (rows + 1);

  const base = getFormValues(); // nimmt aktuelle Werte (vorsitz/email etc.)
  let idx = 0;

  while (idx < items.length) {
    for (let r=0; r<rows; r++){
      for (let c=0; c<cols; c++){
        if (idx >= items.length) break;

        const bkz = items[idx++];

        // Betrieb/Anschrift aus Map (wenn vorhanden), sonst aktuelle
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
    // Sticker-Preview live updaten, falls QR schon da
    if (qrCanvas) buildStickerPreview();
  });

  $("btn-generate")?.addEventListener("click", generateQRCode);
  $("btn-refresh")?.addEventListener("click", refreshPage);

  $("btn-png")?.addEventListener("click", downloadPNG);
  $("btn-pdf")?.addEventListener("click", downloadPDF);

  $("btn-sticker-png")?.addEventListener("click", downloadStickerPNG);
  $("btn-sticker-pdf")?.addEventListener("click", downloadStickerPDF);

  $("btn-a4")?.addEventListener("click", downloadA4StickerPDF);

  // Optional: Live-Update Sticker, wenn du Eingaben änderst
  ["betrieb","vorsitz","anschrift","email"].forEach(id => {
    $(id)?.addEventListener("input", () => {
      if (qrCanvas) buildStickerPreview();
    });
  });

  // Optional: wenn BKZ aus URL kam -> direkt generieren
  if (bkzUrl) generateQRCode();
});

// Für alte inline onclick-Fälle (falls irgendwo noch benutzt)
window.generateQRCode = generateQRCode;
window.downloadPNG = downloadPNG;
window.downloadPDF = downloadPDF;