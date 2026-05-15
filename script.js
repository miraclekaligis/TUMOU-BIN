/**
 * FIX: tmImage is not defined
 * - Pastikan file ini dipanggil setelah:
 *   1) tfjs
 *   2) teachablemachine-image
 * - index.html di atas sudah benar urutannya
 */

const MODEL_BASE_URL = "https://teachablemachine.withgoogle.com/models/26JGgdRQl/";
const HISTORY_LIMIT = 5;

const WASTE_INFO = {
  organik: {
    title: "🍃 Organik",
    desc: "Sampah mudah terurai seperti sisa makanan, daun, dan kulit buah.",
    tip: "🌱 Eco Tip: Ubah sampah organik jadi kompos untuk pupuk alami.",
  },
  anorganik: {
    title: "♻️ Anorganik",
    desc: "Sampah non-hayati seperti plastik, kaca, dan kaleng yang bisa didaur ulang.",
    tip: "🔁 Eco Tip: Bersihkan kemasan sebelum didaur ulang agar kualitas material tetap baik.",
  },
  b3: {
    title: "⚠️ B3 (Berbahaya)",
    desc: "Sampah berbahaya seperti baterai, lampu, obat, dan limbah kimia rumah tangga.",
    tip: "🧤 Eco Tip: Simpan terpisah dan buang ke tempat penampungan limbah B3 resmi.",
  },
  unknown: {
    title: "🧠 Kategori belum pasti",
    desc: "Model belum yakin dengan kategori sampah. Coba foto lebih terang atau lebih dekat.",
    tip: "📸 Eco Tip: Gunakan gambar fokus dengan pencahayaan cukup untuk hasil lebih akurat.",
  },
};

// ===== DOM =====
const startBtn = document.getElementById("startBtn");
const upload = document.getElementById("upload");
const preview = document.getElementById("preview");
const hasil = document.getElementById("hasil");
const barWrap = document.getElementById("bar");
const webcamContainer = document.getElementById("webcam-container");
const modeCameraBtn = document.getElementById("modeCameraBtn");
const modeUploadBtn = document.getElementById("modeUploadBtn");
const cameraCard = document.getElementById("cameraCard");
const uploadCard = document.getElementById("uploadCard");
const loading = document.getElementById("loading");
const loadingText = document.getElementById("loadingText");
const statusBadge = document.getElementById("statusBadge");
const confidenceDetails = document.getElementById("confidenceDetails");
const categoryTitle = document.getElementById("categoryTitle");
const categoryDesc = document.getElementById("categoryDesc");
const ecoTip = document.getElementById("ecoTip");
const historyList = document.getElementById("historyList");
const themeToggle = document.getElementById("themeToggle");

let model = null;
let modelLoading = null;

let stream = null;
let videoEl = null;
let running = false;
let currentMode = "camera";
const historyData = [];

function setStatus(text, tone = "idle") {
  hasil.textContent = text;
  statusBadge.className = `status-badge ${tone}`;
  statusBadge.textContent =
    tone === "loading"
      ? "⏳ Loading"
      : tone === "active"
      ? "✅ Aktif"
      : tone === "error"
      ? "❌ Error"
      : "⏸️ Idle";
}

function setBar(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  barWrap.innerHTML = `<div class="bar" style="width:${p}%"></div>`;
}

function setLoading(active, text = "Memproses...") {
  loading.classList.toggle("hidden", !active);
  loadingText.textContent = text;
  if (active) setStatus(text, "loading");
}

function prettyError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.name === "NotAllowedError") return "Izin kamera ditolak. Izinkan kamera lalu coba lagi.";
  if (err.name === "NotFoundError") return "Kamera tidak ditemukan di perangkat ini.";
  if (err.message) return err.message;
  return String(err);
}

function classifyCategory(className) {
  const value = String(className || "").toLowerCase();
  if (value.includes("b3") || value.includes("berbahaya") || value.includes("toxic")) return "b3";
  if (value.includes("organik") || value.includes("organic")) return "organik";
  if (value.includes("anorganik") || value.includes("plastic") || value.includes("kaca") || value.includes("kaleng")) {
    return "anorganik";
  }
  return "unknown";
}

function renderConfidence(predictions = []) {
  if (!predictions.length) {
    confidenceDetails.innerHTML = "";
    return;
  }

  const topPredictions = [...predictions]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3);

  confidenceDetails.innerHTML = topPredictions
    .map((item) => {
      const pct = (item.probability * 100).toFixed(1);
      return `<div class="conf-row"><span>${item.className}</span><strong>${pct}%</strong></div>`;
    })
    .join("");
}

function updateInsights(best, source) {
  const percent = best.probability * 100;
  const categoryKey = classifyCategory(best.className);
  const info = WASTE_INFO[categoryKey] || WASTE_INFO.unknown;

  setStatus(`${best.className} terdeteksi (${percent.toFixed(1)}%) via ${source}`, "active");
  setBar(percent);
  categoryTitle.textContent = `🧠 Kategori Sampah: ${info.title}`;
  categoryDesc.textContent = info.desc;
  ecoTip.textContent = info.tip;

  historyData.unshift({
    label: best.className,
    confidence: percent.toFixed(1),
    source,
    at: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  });

  if (historyData.length > HISTORY_LIMIT) historyData.pop();

  historyList.innerHTML = historyData
    .map((item) => `<li>${item.at} • ${item.source} • ${item.label} (${item.confidence}%)</li>`)
    .join("");
}

function switchMode(mode) {
  currentMode = mode;
  const cameraMode = mode === "camera";

  modeCameraBtn.classList.toggle("active", cameraMode);
  modeUploadBtn.classList.toggle("active", !cameraMode);
  modeCameraBtn.setAttribute("aria-selected", String(cameraMode));
  modeUploadBtn.setAttribute("aria-selected", String(!cameraMode));

  cameraCard.classList.toggle("hidden", !cameraMode);
  uploadCard.classList.toggle("hidden", cameraMode);

  if (!cameraMode && running) stopCamera();

  setStatus(
    cameraMode
      ? "Mode kamera aktif. Klik mulai kamera untuk deteksi real-time."
      : "Mode upload aktif. Pilih gambar untuk dideteksi.",
    "idle"
  );
}

function toggleTheme() {
  const darkEnabled = document.body.classList.toggle("dark");
  themeToggle.textContent = darkEnabled ? "☀️ Mode Terang" : "🌙 Mode Gelap";
}

// ===== Pastikan library kebaca =====
function assertLibraries() {
  if (typeof window.tf === "undefined") {
    throw new Error("TensorFlow.js (tf) belum termuat. Cek script CDN tfjs di index.html.");
  }
  if (typeof window.tmImage === "undefined") {
    throw new Error(
      "TeachableMachine Image (tmImage) belum termuat.\n" +
        "Pastikan pakai:\n" +
        "https://cdn.jsdelivr.net/npm/@teachablemachine/image@latest/dist/teachablemachine-image.min.js"
    );
  }
}

// ===== MODEL CHECK (supaya ketahuan 403/404) =====
async function ensureModelFilesReachable() {
  const modelURL = MODEL_BASE_URL + "model.json";
  const metadataURL = MODEL_BASE_URL + "metadata.json";

  const [rModel, rMeta] = await Promise.all([
    fetch(modelURL, { cache: "no-store" }),
    fetch(metadataURL, { cache: "no-store" }),
  ]);

  if (!rModel.ok || !rMeta.ok) {
    throw new Error(
      [
        "Model file tidak bisa diakses:",
        `- model.json: ${rModel.status} ${rModel.statusText}`,
        `- metadata.json: ${rMeta.status} ${rMeta.statusText}`,
        "",
        "Coba buka langsung di browser:",
        modelURL,
        metadataURL,
      ].join("\n")
    );
  }
}

// ===== LOAD MODEL (sekali) =====
async function loadModelOnce() {
  assertLibraries();

  if (model) return model;
  if (modelLoading) return modelLoading;

  modelLoading = (async () => {
    setLoading(true, "Memuat model AI...");
    setBar(0);

    try {
      await ensureModelFilesReachable();

      const modelURL = MODEL_BASE_URL + "model.json";
      const metadataURL = MODEL_BASE_URL + "metadata.json";
      model = await window.tmImage.load(modelURL, metadataURL);

      setLoading(false);
      setStatus("✅ Model siap digunakan", "idle");
      return model;
    } catch (err) {
      console.error("❌ Model gagal dimuat:", err);
      setLoading(false);
      setStatus("❌ Model gagal dimuat", "error");
      model = null;
      modelLoading = null;
      throw err;
    }
  })();

  return modelLoading;
}

// ===== CAMERA START/STOP =====
async function startCamera() {
  if (running) return;

  startBtn.disabled = true;

  try {
    await loadModelOnce();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Browser tidak mendukung getUserMedia (akses kamera).");
    }

    setLoading(true, "Mengakses kamera...");

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    videoEl = document.createElement("video");
    videoEl.srcObject = stream;
    videoEl.setAttribute("playsinline", "true");
    videoEl.muted = true;

    webcamContainer.innerHTML = "";
    webcamContainer.appendChild(videoEl);

    await videoEl.play();
    await new Promise((resolve) => {
      if (videoEl.readyState >= 2) return resolve();
      videoEl.onloadeddata = () => resolve();
    });

    running = true;
    startBtn.textContent = "⏹️ Hentikan Kamera";
    setLoading(false);
    setStatus("✅ Kamera aktif. Sedang mendeteksi...", "active");
    requestAnimationFrame(detectLoop);
  } finally {
    startBtn.disabled = false;
  }
}

function stopCamera() {
  running = false;

  if (videoEl) {
    try {
      videoEl.pause();
    } catch {}
    videoEl.srcObject = null;
    videoEl.remove();
    videoEl = null;
  }

  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  webcamContainer.innerHTML = "";
  startBtn.textContent = "🎥 Mulai Kamera";
  setStatus("Kamera berhenti", "idle");
  setBar(0);
}

// ===== DETECT LOOP =====
async function detectLoop() {
  if (!running || !model || !videoEl) return;

  try {
    const predictions = await model.predict(videoEl);

    if (!predictions?.length) {
      setStatus("Tidak ada objek", "idle");
      setBar(0);
      renderConfidence([]);
      return requestAnimationFrame(detectLoop);
    }

    const best = predictions.reduce((a, b) => (a.probability > b.probability ? a : b));
    renderConfidence(predictions);
    updateInsights(best, "kamera");
  } catch (err) {
    console.error("❌ Predict error:", err);
    setStatus("❌ Prediksi kamera gagal", "error");
  }

  requestAnimationFrame(detectLoop);
}

// ===== UPLOAD =====
upload.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  let objectUrl = "";

  try {
    if (running) stopCamera();

    await loadModelOnce();

    setLoading(true, "Memuat gambar...");
    setBar(0);

    objectUrl = window.URL.createObjectURL(file);
    preview.src = objectUrl;
    preview.style.display = "block";

    await new Promise((resolve, reject) => {
      preview.onload = () => resolve();
      preview.onerror = () => reject(new Error("Gagal memuat gambar (preview)."));
    });

    setLoading(true, "Mendeteksi gambar...");
    const predictions = await model.predict(preview);

    if (!predictions?.length) {
      setStatus("Tidak ada objek", "idle");
      setBar(0);
      renderConfidence([]);
      return;
    }

    const best = predictions.reduce((a, b) => (a.probability > b.probability ? a : b));
    renderConfidence(predictions);
    updateInsights(best, "upload");
  } catch (err) {
    console.error("❌ Upload/predict error:", err);
    alert(prettyError(err));
    setStatus("❌ Gagal memproses gambar", "error");
  } finally {
    setLoading(false);
    if (objectUrl) window.URL.revokeObjectURL(objectUrl);
  }
});

// ===== BUTTON =====
startBtn.addEventListener("click", async () => {
  try {
    if (running) stopCamera();
    else await startCamera();
  } catch (err) {
    console.error("❌ Kamera/model error:", err);
    alert("Kamera/model error:\n\n" + prettyError(err));
    stopCamera();
  }
});

modeCameraBtn.addEventListener("click", () => switchMode("camera"));
modeUploadBtn.addEventListener("click", () => switchMode("upload"));
themeToggle.addEventListener("click", toggleTheme);

// ===== INIT =====
window.addEventListener("DOMContentLoaded", () => {
  switchMode(currentMode);
  setBar(0);
  renderConfidence([]);
});
