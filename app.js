const els = {
  status: document.querySelector("#cameraStatus"),
  restart: document.querySelector("#restartCamera"),
  video: document.querySelector("#cameraView"),
  canvas: document.querySelector("#snapshotCanvas"),
  overlay: document.querySelector("#cameraOverlay"),
  typeSelect: document.querySelector("#typeSelect"),
  vendorSelect: document.querySelector("#vendorSelect"),
  kindButtons: Array.from(document.querySelectorAll(".kind-button")),
  capture: document.querySelector("#captureButton"),
  fallback: document.querySelector("#fallbackButton"),
  fallbackInput: document.querySelector("#fallbackInput"),
  filenamePreview: document.querySelector("#filenamePreview"),
  recentPanel: document.querySelector("#recentPanel"),
  recentList: document.querySelector("#recentList"),
};

const storageKey = "shipping-photo-selection";
const recentLimit = 3;

const state = {
  groups: [],
  selectedType: "",
  selectedVendor: "",
  selectedKind: "1",
  stream: null,
  cameraReady: false,
  recent: [],
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function timestamp(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function cleanPart(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ");
}

function currentFilename(date = new Date()) {
  const vendor = cleanPart(state.selectedVendor);
  const kind = cleanPart(state.selectedKind);
  return `${vendor}_${kind}_${timestamp(date)}.jpg`;
}

function setStatus(message, tone = "normal") {
  els.status.textContent = message;
  els.status.classList.toggle("ready", tone === "ready");
  els.status.classList.toggle("error", tone === "error");
}

function showOverlay(message) {
  els.overlay.textContent = message;
  els.overlay.classList.remove("is-hidden");
}

function hideOverlay() {
  els.overlay.classList.add("is-hidden");
}

function saveSelection() {
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      selectedType: state.selectedType,
      selectedVendor: state.selectedVendor,
      selectedKind: state.selectedKind,
    }),
  );
}

function readSelection() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "{}");
  } catch {
    return {};
  }
}

function groupByName(name) {
  return state.groups.find((group) => group.name === name);
}

function setSelectedKind(kind) {
  state.selectedKind = String(kind);
  for (const button of els.kindButtons) {
    button.setAttribute("aria-checked", String(button.dataset.kind === state.selectedKind));
  }
  saveSelection();
  updateFilenamePreview();
}

function updateFilenamePreview() {
  if (!state.selectedVendor) {
    els.filenamePreview.textContent = "請先選擇廠商";
    return;
  }
  els.filenamePreview.textContent = currentFilename();
}

function populateTypes() {
  els.typeSelect.replaceChildren(
    ...state.groups.map((group) => {
      const option = document.createElement("option");
      option.value = group.name;
      option.textContent = group.name;
      return option;
    }),
  );
}

function populateVendors(typeName, preferredVendor = "") {
  const group = groupByName(typeName) || state.groups[0];
  const vendors = group?.vendors || [];
  els.vendorSelect.replaceChildren(
    ...vendors.map((vendor) => {
      const option = document.createElement("option");
      option.value = vendor;
      option.textContent = vendor;
      return option;
    }),
  );
  state.selectedType = group?.name || "";
  state.selectedVendor = vendors.includes(preferredVendor) ? preferredVendor : vendors[0] || "";
  els.typeSelect.value = state.selectedType;
  els.vendorSelect.value = state.selectedVendor;
  saveSelection();
  updateFilenamePreview();
}

async function loadVendors() {
  const response = await fetch("./vendors.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("vendor-list");
  }
  const data = await response.json();
  state.groups = Array.isArray(data.types) ? data.types : [];
  if (!state.groups.length) {
    throw new Error("empty-vendor-list");
  }

  const saved = readSelection();
  const defaultType = groupByName(saved.selectedType) ? saved.selectedType : data.defaultType || state.groups[0].name;
  const configuredKind = ["1", "2", "3", "4"].includes(data.defaultKind) ? data.defaultKind : "1";
  const defaultKind = ["1", "2", "3", "4"].includes(saved.selectedKind) ? saved.selectedKind : configuredKind;

  populateTypes();
  populateVendors(defaultType, saved.selectedVendor || data.defaultVendor || "");
  setSelectedKind(defaultKind);
}

function stopCamera() {
  if (!state.stream) {
    return;
  }
  for (const track of state.stream.getTracks()) {
    track.stop();
  }
  state.stream = null;
  state.cameraReady = false;
}

function updateCameraFrameRatio() {
  const { videoWidth, videoHeight } = els.video;
  if (!videoWidth || !videoHeight) {
    return;
  }
  els.video.closest(".camera-stage")?.style.setProperty("--camera-aspect", `${videoWidth} / ${videoHeight}`);
}

async function startCamera() {
  stopCamera();
  state.cameraReady = false;
  els.capture.hidden = false;
  els.capture.disabled = true;
  els.fallback.hidden = true;
  showOverlay("等待相機權限");
  setStatus("啟動相機中");

  if (!navigator.mediaDevices?.getUserMedia) {
    showFallback("此瀏覽器不支援即時相機");
    return;
  }

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    els.video.srcObject = state.stream;
    await els.video.play();
    updateCameraFrameRatio();
    state.cameraReady = true;
    els.capture.hidden = false;
    els.capture.disabled = !state.selectedVendor;
    hideOverlay();
    setStatus("相機已就緒", "ready");
  } catch (error) {
    stopCamera();
    showFallback(error?.name === "NotAllowedError" ? "相機權限未開啟" : "無法啟動相機");
  }
}

function showFallback(message) {
  state.cameraReady = false;
  els.capture.hidden = true;
  els.capture.disabled = true;
  els.fallback.hidden = false;
  showOverlay(message);
  setStatus(`${message}，可改用拍照選取`, "error");
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("snapshot-failed"));
        }
      },
      "image/jpeg",
      0.92,
    );
  });
}

function drawVideoToCanvas() {
  const { videoWidth, videoHeight } = els.video;
  if (!videoWidth || !videoHeight) {
    throw new Error("camera-not-ready");
  }
  els.canvas.width = videoWidth;
  els.canvas.height = videoHeight;
  const context = els.canvas.getContext("2d", { alpha: false });
  context.drawImage(els.video, 0, 0, videoWidth, videoHeight);
  return els.canvas;
}

async function drawImageFileToCanvas(file) {
  if (window.createImageBitmap) {
    const bitmap = await createImageBitmap(file);
    els.canvas.width = bitmap.width;
    els.canvas.height = bitmap.height;
    const context = els.canvas.getContext("2d", { alpha: false });
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return els.canvas;
  }

  const image = await loadImageFile(file);
  els.canvas.width = image.naturalWidth;
  els.canvas.height = image.naturalHeight;
  const context = els.canvas.getContext("2d", { alpha: false });
  context.drawImage(image, 0, 0);
  return els.canvas;
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image-load-failed"));
    };
    image.src = url;
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function addRecent(blob, filename) {
  const url = URL.createObjectURL(blob);
  state.recent.unshift({ url, filename, blob });
  while (state.recent.length > recentLimit) {
    const item = state.recent.pop();
    URL.revokeObjectURL(item.url);
  }
  renderRecent();
}

function renderRecent() {
  els.recentPanel.hidden = state.recent.length === 0;
  els.recentList.replaceChildren(
    ...state.recent.map((item) => {
      const row = document.createElement("div");
      row.className = "recent-item";

      const image = document.createElement("img");
      image.src = item.url;
      image.alt = item.filename;

      const name = document.createElement("span");
      name.textContent = item.filename;

      const download = document.createElement("button");
      download.type = "button";
      download.className = "recent-download";
      download.setAttribute("aria-label", `重新下載 ${item.filename}`);
      download.innerHTML = `
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      `;
      download.addEventListener("click", () => downloadBlob(item.blob, item.filename));

      row.append(image, name, download);
      return row;
    }),
  );
}

async function saveCanvas(canvas) {
  const filename = currentFilename();
  const blob = await canvasToBlob(canvas);
  downloadBlob(blob, filename);
  addRecent(blob, filename);
  setStatus(`已儲存 ${filename}`, "ready");
  updateFilenamePreview();
}

async function captureCurrentFrame() {
  if (!state.selectedVendor || !state.cameraReady) {
    return;
  }
  els.capture.disabled = true;
  try {
    await saveCanvas(drawVideoToCanvas());
  } catch {
    setStatus("拍照失敗，請重試", "error");
  } finally {
    els.capture.disabled = !state.cameraReady || !state.selectedVendor;
  }
}

async function captureFallbackFile(file) {
  if (!file) {
    return;
  }
  try {
    await saveCanvas(await drawImageFileToCanvas(file));
  } catch {
    setStatus("照片處理失敗", "error");
  } finally {
    els.fallbackInput.value = "";
  }
}

function bindEvents() {
  els.typeSelect.addEventListener("change", () => {
    populateVendors(els.typeSelect.value);
    els.capture.disabled = !state.cameraReady || !state.selectedVendor;
  });

  els.vendorSelect.addEventListener("change", () => {
    state.selectedVendor = els.vendorSelect.value;
    saveSelection();
    updateFilenamePreview();
    els.capture.disabled = !state.cameraReady || !state.selectedVendor;
  });

  for (const button of els.kindButtons) {
    button.addEventListener("click", () => setSelectedKind(button.dataset.kind));
  }

  els.capture.addEventListener("click", captureCurrentFrame);
  els.restart.addEventListener("click", startCamera);
  els.fallback.addEventListener("click", () => els.fallbackInput.click());
  els.fallbackInput.addEventListener("change", () => captureFallbackFile(els.fallbackInput.files?.[0]));
  els.video.addEventListener("loadedmetadata", updateCameraFrameRatio);

  window.addEventListener("pagehide", stopCamera);
  window.setInterval(updateFilenamePreview, 1000);
}

async function init() {
  bindEvents();
  try {
    await loadVendors();
  } catch {
    setStatus("廠商清單載入失敗", "error");
    showOverlay("清單載入失敗");
    return;
  }
  await startCamera();
}

init();
