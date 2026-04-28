/**
 * FIX: tmImage is not defined
 * - Pastikan file ini dipanggil setelah:
 *   1) tfjs
 *   2) teachablemachine-image
 * - index.html di atas sudah benar urutannya
 */

const MODEL_BASE_URL = "https://teachablemachine.withgoogle.com/models/26JGgdRQl/";

// ===== DOM =====
const startBtn = document.getElementById("startBtn");
const upload = document.getElementById("upload");
const preview = document.getElementById("preview");
const hasil = document.getElementById("hasil");
const barWrap = document.getElementById("bar");
const webcamContainer = document.getElementById("webcam-container");

let model = null;
let modelLoading = null;

let stream = null;
let videoEl = null;
let running = false;

function setStatus(text) {
  hasil.textContent = text;
}

function setBar(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  barWrap.innerHTML = `<div class="bar" style="width:${p}%"></div>`;
}

function prettyError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message) return err.message;
  return String(err);
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
    setStatus("⏳ Memuat model...");
    setBar(0);

    try {
      await ensureModelFilesReachable();

      const modelURL = MODEL_BASE_URL + "model.json";
      const metadataURL = MODEL_BASE_URL + "metadata.json";
      model = await window.tmImage.load(modelURL, metadataURL);

      setStatus("✅ Model siap");
      return model;
    } catch (err) {
      console.error("❌ Model gagal dimuat:", err);
      setStatus("❌ Model gagal dimuat");
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

    setStatus("⏳ Mengakses kamera...");

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
    setStatus("✅ Kamera aktif");
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
  setStatus("Kamera berhenti");
  setBar(0);
}

// ===== DETECT LOOP =====
async function detectLoop() {
  if (!running || !model || !videoEl) return;

  try {
    const predictions = await model.predict(videoEl);

    if (!predictions?.length) {
      setStatus("Tidak ada objek");
      setBar(0);
      return requestAnimationFrame(detectLoop);
    }

    const best = predictions.reduce((a, b) =>
      a.probability > b.probability ? a : b
    );

    const percent = best.probability * 100;
    setStatus(`${best.className} (${percent.toFixed(1)}%)`);
    setBar(percent);
  } catch (err) {
    console.error("❌ Predict error:", err);
  }

  requestAnimationFrame(detectLoop);
}

// ===== UPLOAD =====
upload.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    if (running) stopCamera();

    await loadModelOnce();

    setStatus("⏳ Memuat gambar...");
    setBar(0);

    const objectUrl = window.URL.createObjectURL(file);
    preview.src = objectUrl;

    await new Promise((resolve, reject) => {
      preview.onload = () => resolve();
      preview.onerror = () => reject(new Error("Gagal memuat gambar (preview)."));
    });

    setStatus("⏳ Mendeteksi...");
    const predictions = await model.predict(preview);

    if (!predictions?.length) {
      setStatus("Tidak ada objek");
      setBar(0);
      return;
    }

    const best = predictions.reduce((a, b) =>
      a.probability > b.probability ? a : b
    );

    const percent = best.probability * 100;
    setStatus(`${best.className} (${percent.toFixed(1)}%)`);
    setBar(percent);

    window.URL.revokeObjectURL(objectUrl);
  } catch (err) {
    console.error("❌ Upload/predict error:", err);
    alert(prettyError(err));
    setStatus("❌ Gagal memproses gambar");
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

// ===== INIT =====
window.addEventListener("DOMContentLoaded", () => {
  setStatus("Siap. Klik tombol kamera atau upload gambar.");
  setBar(0);
});