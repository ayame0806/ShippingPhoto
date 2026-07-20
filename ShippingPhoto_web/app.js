const els = {
  status: document.querySelector("#cameraStatus"),
  restart: document.querySelector("#restartCamera"),
  video: document.querySelector("#cameraView"),
  canvas: document.querySelector("#snapshotCanvas"),
  overlay: document.querySelector("#cameraOverlay"),
  typeSelect: document.querySelector("#typeSelect"),
  vendorSelect: document.querySelector("#vendorSelect"),
  photoDate: document.querySelector("#photoDate"),
  kindButtons: Array.from(document.querySelectorAll(".kind-button")),
  capture: document.querySelector("#captureButton"),
  captureText: document.querySelector("#captureButtonText"),
  fallback: document.querySelector("#fallbackButton"),
  fallbackInput: document.querySelector("#fallbackInput"),
  zipInput: document.querySelector("#zipInput"),
  zipPick: document.querySelector("#zipPickButton"),
  zipCreate: document.querySelector("#zipCreateButton"),
  zipStatus: document.querySelector("#zipStatus"),
};

const storageKey = "shipping-photo-selection";

const state = {
  groups: [],
  selectedType: "",
  selectedVendor: "",
  selectedKind: "",
  selectedDate: "",
  selectedMaxKind: 3,
  stream: null,
  cameraReady: false,
  resumeCameraOnVisible: false,
  zipFiles: [],
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

function dateValue(date = new Date()) {
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
}

function compactDate(value) {
  return String(value || "").replaceAll("-", "");
}

function selectedTimestamp(date = new Date()) {
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(state.selectedDate) ? state.selectedDate : dateValue(date);
  return `${compactDate(selectedDate)}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
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
  return `${vendor}_${kind}_${selectedTimestamp(date)}.jpg`;
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

function selectedVendorEntry() {
  const group = groupByName(state.selectedType);
  return group?.vendors.find((vendor) => vendor.name === state.selectedVendor);
}

function maxKindForVendor() {
  return selectedVendorEntry()?.max || 3;
}

function updateKindButtons() {
  state.selectedMaxKind = maxKindForVendor();
  if (Number(state.selectedKind) > state.selectedMaxKind) {
    state.selectedKind = "";
  }
  document.querySelector(".kind-options")?.style.setProperty("--kind-columns", state.selectedMaxKind);
  for (const button of els.kindButtons) {
    const kind = Number(button.dataset.kind);
    button.hidden = kind > state.selectedMaxKind;
    button.setAttribute("aria-checked", String(!button.hidden && button.dataset.kind === state.selectedKind));
  }
  updatePhotoActions();
  updateCameraLayoutBudget();
}

function setSelectedKind(kind) {
  state.selectedKind = String(kind);
  if (Number(state.selectedKind) > state.selectedMaxKind) {
    state.selectedKind = "";
  }
  updateKindButtons();
}

function canSavePhoto() {
  return Boolean(state.selectedVendor && state.selectedKind && state.selectedDate);
}

function updatePhotoActions() {
  const needsKind = !state.selectedKind;
  els.capture.disabled = !state.cameraReady || !canSavePhoto();
  els.fallback.disabled = !canSavePhoto();
  els.captureText.textContent = needsKind ? "請選種類" : "拍照儲存";
  els.fallback.textContent = needsKind ? "請選種類" : "拍照儲存";
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
      option.value = vendor.name;
      option.textContent = vendor.name;
      return option;
    }),
  );
  state.selectedType = group?.name || "";
  state.selectedVendor = vendors.some((vendor) => vendor.name === preferredVendor) ? preferredVendor : vendors[0]?.name || "";
  els.typeSelect.value = state.selectedType;
  els.vendorSelect.value = state.selectedVendor;
  saveSelection();
  updateKindButtons();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((items) => items.some((item) => item.trim()));
}

function maxFromValue(value) {
  const max = Number.parseInt(value, 10);
  return Number.isInteger(max) && max >= 1 && max <= 4 ? max : 3;
}

function groupsFromCsv(text) {
  const rows = parseCsv(text);
  const header = rows.shift()?.map((item) => item.trim().replace(/^\uFEFF/, "")) || [];
  const typeIndex = header.indexOf("類型");
  const vendorIndex = header.indexOf("廠商");
  const maxIndex = header.indexOf("max");
  if (typeIndex < 0 || vendorIndex < 0) {
    throw new Error("vendor-csv-header");
  }

  const groups = [];
  for (const row of rows) {
    const type = row[typeIndex]?.trim();
    const vendorName = row[vendorIndex]?.trim();
    if (!type || !vendorName) {
      continue;
    }
    let group = groups.find((item) => item.name === type);
    if (!group) {
      group = { name: type, vendors: [] };
      groups.push(group);
    }
    group.vendors.push({
      name: vendorName,
      max: maxFromValue(row[maxIndex]),
    });
  }
  return groups.filter((group) => group.vendors.length);
}

async function loadVendors() {
  const response = await fetch("./vendors.csv", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("vendor-list");
  }
  state.groups = groupsFromCsv(await response.text());
  if (!state.groups.length) {
    throw new Error("empty-vendor-list");
  }

  const saved = readSelection();
  const defaultType = groupByName(saved.selectedType) ? saved.selectedType : "外包商";

  populateTypes();
  populateVendors(defaultType, saved.selectedVendor || "馗鼎");
  state.selectedDate = dateValue();
  els.photoDate.value = state.selectedDate;
  setSelectedKind("");
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
  els.video.pause();
  els.video.srcObject = null;
  updatePhotoActions();
}

function updateCameraFrameRatio() {
  const { videoWidth, videoHeight } = els.video;
  if (!videoWidth || !videoHeight) {
    return;
  }
  els.video.closest(".camera-stage")?.style.setProperty("--camera-aspect", `${videoWidth} / ${videoHeight}`);
  updateCameraLayoutBudget();
}

function updateCameraLayoutBudget() {
  const stage = els.video.closest(".camera-stage");
  const topbar = document.querySelector(".topbar");
  const panel = document.querySelector(".control-panel");
  const activeCameraButton = els.capture.hidden ? els.fallback : els.capture;
  const reserved =
    (topbar?.offsetHeight || 0) +
    (activeCameraButton?.offsetHeight || 0) +
    (document.querySelector(".kind-group")?.offsetHeight || 0) +
    (panel ? parseFloat(getComputedStyle(panel).paddingTop) + 24 : 36);
  const maxHeight = Math.max(180, Math.floor(window.innerHeight - reserved));
  stage?.style.setProperty("--camera-max-height", `${maxHeight}px`);
}

async function startCamera() {
  stopCamera();
  state.cameraReady = false;
  state.resumeCameraOnVisible = false;
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
    updatePhotoActions();
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
  updatePhotoActions();
  updateCameraLayoutBudget();
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

async function saveCanvas(canvas) {
  const filename = currentFilename();
  const blob = await canvasToBlob(canvas);
  downloadBlob(blob, filename);
  setStatus(`已儲存 ${filename}`, "ready");
}

async function captureCurrentFrame() {
  if (!canSavePhoto() || !state.cameraReady) {
    return;
  }
  els.capture.disabled = true;
  try {
    await saveCanvas(drawVideoToCanvas());
  } catch {
    setStatus("拍照失敗，請重試", "error");
  } finally {
    updatePhotoActions();
  }
}

async function captureFallbackFile(file) {
  if (!file || !canSavePhoto()) {
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

function updateZipStatus() {
  if (!state.zipFiles.length) {
    els.zipStatus.textContent = "尚未選取 JPG";
    els.zipCreate.disabled = true;
    return;
  }
  const totalMb = state.zipFiles.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024;
  els.zipStatus.textContent = `${state.zipFiles.length} 張，${totalMb.toFixed(1)} MB`;
  els.zipCreate.disabled = false;
}

function handleZipFiles(files) {
  state.zipFiles = Array.from(files || []).filter((file) => /\.(jpe?g)$/i.test(file.name) || file.type === "image/jpeg");
  updateZipStatus();
}

function uniqueZipName(file, usedNames) {
  const safeName = cleanPart(file.name) || `photo_${usedNames.size + 1}.jpg`;
  const dotIndex = safeName.lastIndexOf(".");
  const base = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  const ext = dotIndex > 0 ? safeName.slice(dotIndex) : ".jpg";
  let candidate = safeName;
  let counter = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${base} (${counter})${ext}`;
    counter += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

let crcTable;

function getCrcTable() {
  if (crcTable) {
    return crcTable;
  }
  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[i] = c >>> 0;
  }
  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDateTime(date) {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function zipHeader(values) {
  const buffer = new ArrayBuffer(values.reduce((sum, value) => sum + value.size, 0));
  const view = new DataView(buffer);
  let offset = 0;
  for (const value of values) {
    if (value.size === 4) {
      view.setUint32(offset, value.value >>> 0, true);
      offset += 4;
    } else {
      view.setUint16(offset, value.value & 0xffff, true);
      offset += 2;
    }
  }
  return new Uint8Array(buffer, 0, offset);
}

async function createStoreZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  const usedNames = new Set();
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(uniqueZipName(file, usedNames));
    const data = new Uint8Array(await file.arrayBuffer());
    const crc = crc32(data);
    const { dosDate, dosTime } = zipDateTime(file.lastModified ? new Date(file.lastModified) : new Date());
    const localOffset = offset;
    const flags = 0x0800;

    const localHeader = zipHeader([
      { size: 4, value: 0x04034b50 },
      { size: 2, value: 20 },
      { size: 2, value: flags },
      { size: 2, value: 0 },
      { size: 2, value: dosTime },
      { size: 2, value: dosDate },
      { size: 4, value: crc },
      { size: 4, value: data.byteLength },
      { size: 4, value: data.byteLength },
      { size: 2, value: nameBytes.byteLength },
      { size: 2, value: 0 },
    ]);
    chunks.push(localHeader, nameBytes, data);
    offset += localHeader.byteLength + nameBytes.byteLength + data.byteLength;

    const centralHeader = zipHeader([
      { size: 4, value: 0x02014b50 },
      { size: 2, value: 20 },
      { size: 2, value: 20 },
      { size: 2, value: flags },
      { size: 2, value: 0 },
      { size: 2, value: dosTime },
      { size: 2, value: dosDate },
      { size: 4, value: crc },
      { size: 4, value: data.byteLength },
      { size: 4, value: data.byteLength },
      { size: 2, value: nameBytes.byteLength },
      { size: 2, value: 0 },
      { size: 2, value: 0 },
      { size: 2, value: 0 },
      { size: 2, value: 0 },
      { size: 4, value: 0 },
      { size: 4, value: localOffset },
    ]);
    central.push(centralHeader, nameBytes);
  }

  const centralOffset = offset;
  const centralSize = central.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const endHeader = zipHeader([
    { size: 4, value: 0x06054b50 },
    { size: 2, value: 0 },
    { size: 2, value: 0 },
    { size: 2, value: files.length },
    { size: 2, value: files.length },
    { size: 4, value: centralSize },
    { size: 4, value: centralOffset },
    { size: 2, value: 0 },
  ]);

  return new Blob([...chunks, ...central, endHeader], { type: "application/zip" });
}

async function createZipFromSelectedFiles() {
  if (!state.zipFiles.length) {
    els.zipStatus.textContent = "尚未選取 JPG";
    return;
  }

  els.zipCreate.disabled = true;
  els.zipPick.disabled = true;
  els.zipStatus.textContent = "壓縮中";

  try {
    const blob = await createStoreZip(state.zipFiles);
    const filename = `出貨照片_${timestamp()}.zip`;
    downloadBlob(blob, filename);
    els.zipStatus.textContent = `已產生 ${filename}`;
  } catch {
    els.zipStatus.textContent = "壓縮失敗，請少量分批";
  } finally {
    els.zipPick.disabled = false;
    els.zipCreate.disabled = state.zipFiles.length === 0;
  }
}

function bindEvents() {
  els.typeSelect.addEventListener("change", () => {
    populateVendors(els.typeSelect.value);
    updatePhotoActions();
  });

  els.vendorSelect.addEventListener("change", () => {
    state.selectedVendor = els.vendorSelect.value;
    saveSelection();
    setSelectedKind("");
  });

  els.photoDate.addEventListener("change", () => {
    state.selectedDate = els.photoDate.value || dateValue();
    els.photoDate.value = state.selectedDate;
    updatePhotoActions();
  });

  for (const button of els.kindButtons) {
    button.addEventListener("click", () => setSelectedKind(button.dataset.kind));
  }

  els.capture.addEventListener("click", captureCurrentFrame);
  els.restart.addEventListener("click", startCamera);
  els.fallback.addEventListener("click", () => els.fallbackInput.click());
  els.fallbackInput.addEventListener("change", () => captureFallbackFile(els.fallbackInput.files?.[0]));
  els.video.addEventListener("loadedmetadata", updateCameraFrameRatio);
  els.zipPick.addEventListener("click", () => els.zipInput.click());
  els.zipInput.addEventListener("change", () => handleZipFiles(els.zipInput.files));
  els.zipCreate.addEventListener("click", createZipFromSelectedFiles);

  window.addEventListener("pagehide", stopCamera);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      state.resumeCameraOnVisible = state.cameraReady;
      stopCamera();
      return;
    }
    if (state.resumeCameraOnVisible) {
      startCamera();
    }
  });
  window.addEventListener("resize", updateCameraLayoutBudget);
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
