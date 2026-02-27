// ../js/qr.js

let qrInstance = null;

function getWahlFromContext() {
  const params = new URLSearchParams(window.location.search);
  return params.get("wahl") || localStorage.getItem("wahlId") || "";
}

function setPageTitle() {
  const wahl = getWahlFromContext();
  const h1 = document.getElementById("pageTitle");
  if (!h1) return;

  const base = "GDL: stark – unbestechlich – erfolgreich";
  h1.textContent = wahl ? `${base} – ${wahl}` : base;
}

function getFormValues() {
  const betrieb = document.getElementById("betrieb")?.value || "[Wahlbetrieb]";
  const vorsitz = document.getElementById("vorsitz")?.value || "[Vorsitzender]";
  const anschrift = document.getElementById("anschrift")?.value || "[Anschrift]";
  const email = document.getElementById("email")?.value || "wahlvorstand@firma.de";

  return { betrieb, vorsitz, anschrift, email };
}

function buildQrUrl() {
  const { betrieb, vorsitz, anschrift, email } = getFormValues();
  const wahl = getWahlFromContext();

  // Deine bisherige Zielseite:
  const baseurl = "https://akzimmer1975-beep.github.io/Dashboard/pages/wahl2.html";

  // Wahl wird mitgegeben (falls du sie später auswerten willst)
  const url = `${baseurl}?wahl=${encodeURIComponent(wahl)}&betrieb=${encodeURIComponent(betrieb)}&vorsitz=${encodeURIComponent(vorsitz)}&anschrift=${encodeURIComponent(anschrift)}&email=${encodeURIComponent(email)}`;

  return url;
}

function clearQr() {
  const qrContainer = document.getElementById("qrcode");
  if (qrContainer) qrContainer.innerHTML = "";
  qrInstance = null;
}

function generateQRCode() {
  const qrContainer = document.getElementById("qrcode");
  if (!qrContainer) return;

  const url = buildQrUrl();
  qrContainer.innerHTML = ""; // vorherigen QR-Code löschen

  // QR erstellen (ohne Link darunter)
  qrInstance = new QRCode(qrContainer, {
    text: url,
    width: 220,
    height: 220
  });

  // Optional: kleine Beschriftung unter dem QR (kein Link!)
  const note = document.createElement("div");
  note.style.marginTop = "10px";
  note.style.fontSize = "0.95em";
  note.style.color = "#333";
  note.style.wordBreak = "break-word";
  note.textContent = "QR-Code erzeugt ✅";
  qrContainer.appendChild(note);
}

function downloadPNG() {
  const canvas = document.querySelector("#qrcode canvas");
  if (!canvas) {
    alert("Bitte zuerst einen QR-Code erstellen!");
    return;
  }
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = "qrcode.png";
  link.click();
}

async function downloadPDF() {
  const canvas = document.querySelector("#qrcode canvas");
  if (!canvas) {
    alert("Bitte zuerst einen QR-Code erstellen!");
    return;
  }

  const imgData = canvas.toDataURL("image/png");
  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF();
  pdf.setFontSize(16);
  pdf.text("QR-Code zur Briefwahlanforderung", 20, 20);
  pdf.addImage(imgData, "PNG", 50, 40, 120, 120);
  pdf.save("qrcode.pdf");
}

function refreshPage() {
  // optional: Eingaben behalten? Dann nicht clearen.
  // Wenn du alles leeren willst, entkommentieren:
  // document.getElementById("betrieb").value = "";
  // document.getElementById("vorsitz").value = "";
  // document.getElementById("anschrift").value = "";
  // document.getElementById("email").value = "";
  clearQr();
  generateQRCode(); // neu erzeugen (mit aktuellen Werten)
}

document.addEventListener("DOMContentLoaded", () => {
  setPageTitle();

  // Buttons verdrahten
  document.getElementById("btn-generate")?.addEventListener("click", generateQRCode);
  document.getElementById("btn-png")?.addEventListener("click", downloadPNG);
  document.getElementById("btn-pdf")?.addEventListener("click", downloadPDF);
  document.getElementById("btn-refresh")?.addEventListener("click", refreshPage);

  // optional: automatisch erzeugen, wenn Parameter vorhanden sind
  // generateQRCode();
});

// Für inline onclick-Kompatibilität (falls du noch alte Buttons hast)
window.generateQRCode = generateQRCode;
window.downloadPNG = downloadPNG;
window.downloadPDF = downloadPDF;
window.refreshPage = refreshPage;