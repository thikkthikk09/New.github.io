const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const uploadCard = document.getElementById("upload-card");
const resultCard = document.getElementById("result-card");
const progress = document.getElementById("progress");
const progressFill = document.getElementById("progress-fill");
const progressText = document.getElementById("progress-text");
const errorEl = document.getElementById("error");
const resultFilename = document.getElementById("result-filename");
const resultMeta = document.getElementById("result-meta");
const resultUrl = document.getElementById("result-url");
const copyBtn = document.getElementById("copy-btn");
const openLink = document.getElementById("open-link");
const newUploadBtn = document.getElementById("new-upload");

const MAX_FILE_SIZE = 100 * 1024 ** 3; // 100 GB
const API_SERVER = "http://localhost:3847";

function apiUrl(path) {
  const onZipServer =
    location.port === "3847" &&
    (location.hostname === "localhost" || location.hostname === "127.0.0.1");
  return onZipServer ? path : `${API_SERVER}${path}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function hideError() {
  errorEl.classList.add("hidden");
}

async function checkServer(silent) {
  try {
    const res = await fetch(apiUrl("/api/health"));
    const data = await res.json();
    if (!data.ok) throw new Error("bad health");
    hideError();
    return true;
  } catch {
    if (!silent) {
      showError(
        "Server not running. Double-click start.bat in the ziptourl folder, then wait for the browser to open."
      );
    }
    return false;
  }
}

async function waitForServer() {
  for (let i = 0; i < 15; i++) {
    if (await checkServer(true)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  showError("Server not running. Double-click start.bat, then try again.");
  return false;
}

checkServer(true).then((ok) => {
  if (!ok) {
    showError("Waiting for server… Run start.bat if you have not already.");
    const retry = setInterval(async () => {
      if (await checkServer(true)) clearInterval(retry);
    }, 2000);
  }
});

function resetUI() {
  hideError();
  progress.classList.add("hidden");
  progressFill.style.width = "0%";
  uploadCard.classList.remove("hidden");
  resultCard.classList.add("hidden");
  fileInput.value = "";
}

dropzone.addEventListener("click", () => fileInput.click());

dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) uploadFile(file);
});

async function uploadFile(file) {
  hideError();

  if (!(await checkServer(true))) {
    showError("Starting server… Run start.bat, then try upload again.");
    if (!(await waitForServer())) return;
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".zip")) {
    showError("Please upload a .zip file only.");
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    showError("File too large (max 100 GB).");
    return;
  }

  progress.classList.remove("hidden");
  progressText.textContent = "Uploading…";
  progressFill.style.width = "0%";

  const xhr = new XMLHttpRequest();

  xhr.upload.addEventListener("progress", (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      progressFill.style.width = `${pct}%`;
      progressText.textContent = `Uploading… ${pct}% (${formatBytes(e.loaded)} / ${formatBytes(e.total)})`;
    }
  });

  xhr.addEventListener("load", () => {
    progress.classList.add("hidden");

    const text = xhr.responseText.trim();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      if (text.includes("<!DOCTYPE") || text.includes("<html")) {
        showError("Wrong page opened. Double-click start.bat — use http://localhost:3847");
      } else if (xhr.status === 0) {
        showError("Connection lost. Keep the ZipToURL Server window open and try again.");
      } else {
        showError(`Upload failed (HTTP ${xhr.status}). Run start.bat first.`);
      }
      return;
    }

    if (xhr.status >= 400) {
      showError(data.error || `Upload failed (HTTP ${xhr.status})`);
      return;
    }

    showResult(data);
  });

  xhr.addEventListener("error", () => {
    progress.classList.add("hidden");
    showError("Cannot reach server. Double-click start.bat and keep that window open.");
  });

  xhr.open("POST", apiUrl("/api/upload"));
  xhr.setRequestHeader("Content-Type", "application/octet-stream");
  xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
  xhr.send(file);
}

function showResult(data) {
  uploadCard.classList.add("hidden");
  resultCard.classList.remove("hidden");

  resultFilename.textContent = data.originalName;
  resultMeta.textContent = `${formatBytes(data.size)} · expires in ${data.expiresInDays} days`;
  resultUrl.value = data.url;
  openLink.href = data.url;

  copyBtn.textContent = "Copy link";
  copyBtn.classList.remove("copied");
}

copyBtn.addEventListener("click", async () => {
  const url = resultUrl.value;
  try {
    await navigator.clipboard.writeText(url);
    copyBtn.textContent = "Copied!";
    copyBtn.classList.add("copied");
    setTimeout(() => {
      copyBtn.textContent = "Copy link";
      copyBtn.classList.remove("copied");
    }, 2000);
  } catch {
    resultUrl.select();
    document.execCommand("copy");
    copyBtn.textContent = "Copied!";
  }
});

newUploadBtn.addEventListener("click", resetUI);
