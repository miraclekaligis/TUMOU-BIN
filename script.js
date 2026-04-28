const URL = "https://teachablemachine.withgoogle.com/models/26JGgdRQl/";

const startBtn = document.getElementById("startBtn");
const upload = document.getElementById("upload");
const preview = document.getElementById("preview");

let model;
let video;
let running = false;

// ===== LOAD MODEL =====
async function loadModel() {
  try {
    document.getElementById("hasil").innerText = "⏳ Memuat model...";
    model = await tmImage.load(URL + "model.json", URL + "metadata.json");
    console.log("✅ Model loaded");
  } catch (err) {
    console.error("❌ Model gagal:", err);
    alert("Model gagal dimuat! Cek internet / link model.");
    throw err;
  }
}

// ===== START CAMERA =====
startBtn.addEventListener("click", async () => {
  try {
    if (running) return;

    await loadModel();

    document.getElementById("hasil").innerText = "⏳ Mengakses kamera...";

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });

    video = document.createElement("video");
    video.srcObject = stream;
    video.setAttribute("playsinline", true);

    await video.play();

    // pastikan video benar-benar ready
    await new Promise(resolve => {
      video.onloadeddata = () => resolve();
    });

    const container = document.getElementById("webcam-container");
    container.innerHTML = "";
    container.appendChild(video);

    running = true;

    document.getElementById("hasil").innerText = "✅ Kamera aktif";

    detectLoop();

  } catch (err) {
    console.error("❌ Kamera error:", err);
    alert("Gagal akses kamera!\n\nPastikan:\n- Pakai Live Server\n- Izinkan kamera\n- Tidak dipakai aplikasi lain");
  }
});

// ===== DETECTION LOOP =====
async function detectLoop() {
  if (!running || !model || !video) return;

  try {
    const prediction = await model.predict(video);

    if (!prediction || prediction.length === 0) {
      document.getElementById("hasil").innerText = "Tidak ada objek";
      requestAnimationFrame(detectLoop);
      return;
    }

    let best = prediction.reduce((a, b) =>
      a.probability > b.probability ? a : b
    );

    const persen = (best.probability * 100).toFixed(1);

    document.getElementById("hasil").innerText =
      `${best.className} (${persen}%)`;

    document.getElementById("bar").innerHTML =
      `<div class="bar" style="width:${persen}%"></div>`;

  } catch (err) {
    console.error("❌ Predict error:", err);
  }

  requestAnimationFrame(detectLoop);
}

// ===== UPLOAD =====
upload.addEventListener("change", async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;

    preview.src = URL.createObjectURL(file);

    preview.onload = async () => {
      if (!model) await loadModel();

      const prediction = await model.predict(preview);

      let best = prediction.reduce((a, b) =>
        a.probability > b.probability ? a : b
      );

      const persen = (best.probability * 100).toFixed(1);

      document.getElementById("hasil").innerText =
        `${best.className} (${persen}%)`;

      document.getElementById("bar").innerHTML =
        `<div class="bar" style="width:${persen}%"></div>`;
    };

  } catch (err) {
    console.error("❌ Upload error:", err);
  }
});