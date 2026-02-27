// ../js/qr.js

let qrCanvas = null;
let stickerCanvas = null;

function getWahlFromContext() {
  const params = new URLSearchParams(window.location.search);
  return params.get("wahl") || localStorage.getItem("wahlId") || "";
}

function setPageTitle() {
  const wahl = getWahlFromContext();
  const el = document.getElementById("pageTitle");
  if (!el) return;
  el.textContent = wahl ? `QR-Generator – ${wahl}` : "QR-Generator";
}

function $(id){ return document.getElementById(id); }

function getFormValues() {
  return {
    wahl: getWahlFromContext(),
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
  // Wahl wird mitgegeben (damit sie auf Zielseite angezeigt werden kann)
  const url = `${baseurl}?wahl=${encodeURIComponent(v.wahl)}&betrieb=${encodeURIComponent(v.betrieb)}&vorsitz=${encodeURIComponent(v.vorsitz)}&anschrift=${encodeURIComponent(v.anschrift)}&email=${encodeURIComponent(v.email)}`;
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
  // Logo mittig in QR zeichnen
  const logoUrl = "../logo.png";
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = logoUrl;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const ctx = canvas.getContext("2d");
  const size = Math.round(canvas.width * 0.22); // 22% -> scanbar
  const x = Math.round((canvas.width - size) / 2);
  const y = Math.round((canvas.height - size) / 2);

  // Weißer Hintergrund (Quiet Zone fürs Logo)
  const pad = Math.round(size * 0.12);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x - pad, y - pad, size + pad * 2, size + pad * 2);

  ctx.drawImage(img, x, y, size, size);
}

async function generateQRCode() {
  clearQr();
  setStatus("Erzeuge QR-Code…");

  const wrap = $("qrcode");
  if (!wrap) return;

  const url = buildQrUrl();

  // QR mit hoher Fehlerkorrektur (wichtig für Logo im QR!)
  // qrcodejs unterstützt CorrectLevel:
  // QRCode.CorrectLevel.L/M/Q/H
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

  // Sticker-Preview ebenfalls aktualisieren
  buildStickerPreview();
}

function refreshPage(){
  // QR neu generieren mit aktuellen Eingaben
  generateQRCode();
}

function downloadPNG() {
  if (!qrCanvas) {
    alert("Bitte zuerst einen QR-Code erstellen!");
    return;
  }
  const link = document.createElement("a");
  link.href = qrCanvas.toDataURL("image/png");
  link.download = "qrcode.png";
  link.click();
}

async function downloadPDF() {
  if (!qrCanvas) {
    alert("Bitte zuerst einen QR-Code erstellen!");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const imgData = qrCanvas.toDataURL("image/png");
  pdf.setFontSize(16);
  pdf.text("QR-Code", 20, 20);
  pdf.addImage(imgData, "PNG", 45, 35, 120, 120);

  pdf.save("qrcode.pdf");
}

/* ===========================
   STICKER (Aufkleber)
   - erstellt ein Canvas mit:
     Kopfzeile (Wahl + Betrieb)
     QR mittig
     kleine Zeilen darunter
=========================== */

function createStickerCanvas() {
  // Sticker Größe: 90mm x 55mm @ 300dpi -> 1063 x 650 px (ungefähr)
  // Wir nehmen etwas moderater: 900 x 550 (reicht gut)
  const W = 900;
  const H = 550;

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");

  // Hintergrund
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Rahmen
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

  // Logo klein oben rechts
  const w = 180;
  const h = Math.round((img.height / img.width) * w);
  ctx.drawImage(img, 900 - w - 28, 28, w, h);
}

async function buildStickerPreview() {
  const preview = $("stickerPreview");
  if (!preview) return;

  // Wenn kein QR existiert, Preview leeren
  if (!qrCanvas) {
    preview.innerHTML = "<div style='color:#333;font-weight:600;'>Erstelle zuerst einen QR-Code.</div>";
    return;
  }

  // Sticker bauen
  const v = getFormValues();
  const sticker = createStickerCanvas();
  const ctx = sticker.getContext("2d");

  // Text links oben
  ctx.fillStyle = "#000";
  ctx.font = "bold 32px Arial";
  ctx.fillText(v.wahl || "Wahl", 28, 60);

  ctx.font = "bold 28px Arial";
  ctx.fillText(v.betrieb, 28, 105);

  ctx.font = "20px Arial";
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.fillText(v.vorsitz, 28, 145);
  ctx.fillText(v.email, 28, 175);

  // Logo oben rechts (optional)
  try { await drawStickerLogo(ctx); } catch {}

  // QR mittig
  const qrSize = 320;
  const qrX = Math.round((sticker.width - qrSize) / 2);
  const qrY = 200;
  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  // Footer
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.font = "18px Arial";
  ctx.fillText("Scan → Briefwahlanforderung", 28, 520);

  // Preview anzeigen
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
  const link = document.createElement("a");
  link.href = stickerCanvas.toDataURL("image/png");
  link.download = "qr_sticker.png";
  link.click();
}

async function downloadStickerPDF() {
  if (!stickerCanvas) {
    alert("Bitte zuerst einen QR-Code erstellen (Sticker wird daraus gebaut).");
    return;
  }

  const { jsPDF } = window.jspdf;
  // Landscape Sticker
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [90, 55] });

  const imgData = stickerCanvas.toDataURL("image/png");
  pdf.addImage(imgData, "PNG", 0, 0, 90, 55);

  pdf.save("qr_sticker.pdf");
}

/* ===========================
   INIT
=========================== */
document.addEventListener("DOMContentLoaded", () => {
  setPageTitle();

  $("btn-generate")?.addEventListener("click", generateQRCode);
  $("btn-refresh")?.addEventListener("click", refreshPage);

  $("btn-png")?.addEventListener("click", downloadPNG);
  $("btn-pdf")?.addEventListener("click", downloadPDF);

  $("btn-sticker-png")?.addEventListener("click", downloadStickerPNG);
  $("btn-sticker-pdf")?.addEventListener("click", downloadStickerPDF);

  // Optional: Live-Update Sticker, wenn du Eingaben änderst
  ["betrieb","vorsitz","anschrift","email"].forEach(id => {
    $(id)?.addEventListener("input", () => {
      if (qrCanvas) buildStickerPreview();
    });
  });
});

// Für alte inline onclick-Fälle (falls irgendwo noch benutzt)
window.generateQRCode = generateQRCode;
window.downloadPNG = downloadPNG;
window.downloadPDF = downloadPDF;