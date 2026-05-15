const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");

const PORT = process.env.PORT || 3847;
const UPLOAD_DIR = path.join(__dirname, "uploads");
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_FILE_SIZE = 100 * 1024 * 1024 * 1024; // 100 GB
const MAX_FILE_LABEL = "100 GB";
const LINK_EXPIRY_DAYS = 7;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const links = new Map();

function loadLinks() {
  const metaPath = path.join(UPLOAD_DIR, "links.json");
  if (!fs.existsSync(metaPath)) return;
  try {
    const data = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    for (const [id, info] of Object.entries(data)) {
      links.set(id, info);
    }
  } catch {
    /* ignore */
  }
}

function saveLinks() {
  const metaPath = path.join(UPLOAD_DIR, "links.json");
  fs.writeFileSync(metaPath, JSON.stringify(Object.fromEntries(links), null, 2));
}

function cleanupExpired() {
  const now = Date.now();
  let changed = false;
  for (const [id, info] of links) {
    if (info.expiresAt < now) {
      const filePath = path.join(UPLOAD_DIR, info.storedName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      links.delete(id);
      changed = true;
    }
  }
  if (changed) saveLinks();
}

function safeFilename(headerValue) {
  const raw = headerValue || "archive.zip";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

class ByteLimit extends Transform {
  constructor(maxSize) {
    super();
    this.maxSize = maxSize;
    this.bytes = 0;
  }

  _transform(chunk, _enc, callback) {
    this.bytes += chunk.length;
    if (this.bytes > this.maxSize) {
      callback(new Error("FILE_TOO_LARGE"));
    } else {
      callback(null, chunk);
    }
  }
}

async function streamToFile(req, destPath, maxSize) {
  const contentLength = parseInt(req.headers["content-length"], 10);
  if (!Number.isNaN(contentLength) && contentLength > maxSize) {
    throw new Error("FILE_TOO_LARGE");
  }

  const limiter = new ByteLimit(maxSize);
  const ws = fs.createWriteStream(destPath);

  try {
    await pipeline(req, limiter, ws);
    return limiter.bytes;
  } catch (err) {
    ws.destroy();
    await fs.promises.unlink(destPath).catch(() => {});
    throw err;
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (
    origin &&
    (origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:") ||
      origin === "null")
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Filename");
}

function sendJson(res, status, data) {
  if (res.headersSent) return;
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  const data = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": mime });
  res.end(data);
}

function isInsideDir(parent, child) {
  const base = path.resolve(parent);
  const target = path.resolve(child);
  return target === base || target.startsWith(base + path.sep);
}

loadLinks();
setInterval(cleanupExpired, 60 * 60 * 1000);

const server = http.createServer(async (req, res) => {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const host = req.headers.host || `localhost:${PORT}`;
  const url = new URL(req.url, `http://${host}`);
  const pathname = url.pathname;

  try {
    if (req.method === "GET" && pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        maxFileSize: MAX_FILE_SIZE,
        maxFileLabel: MAX_FILE_LABEL,
      });
    }

    if (req.method === "POST" && pathname === "/api/upload") {
      const originalName = safeFilename(req.headers["x-filename"]);
      const ext = path.extname(originalName).toLowerCase();
      if (ext !== ".zip") {
        return sendJson(res, 400, { error: "Only .zip files are allowed" });
      }

      const id = crypto.randomUUID();
      const storedName = `${id}.zip`;
      const filePath = path.join(UPLOAD_DIR, storedName);
      const fileSize = await streamToFile(req, filePath, MAX_FILE_SIZE);

      const expiresAt = Date.now() + LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      links.set(id, {
        storedName,
        originalName,
        size: fileSize,
        createdAt: Date.now(),
        expiresAt,
      });
      saveLinks();

      const baseUrl = `http://${host}`;
      return sendJson(res, 200, {
        id,
        url: `${baseUrl}/d/${id}`,
        originalName,
        size: fileSize,
        expiresAt,
        expiresInDays: LINK_EXPIRY_DAYS,
      });
    }

    if (req.method === "GET" && pathname.startsWith("/d/")) {
      const id = pathname.slice(3).split("/")[0];
      const info = links.get(id);
      if (!info) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("Link not found or expired");
      }
      if (info.expiresAt < Date.now()) {
        links.delete(id);
        saveLinks();
        const expiredPath = path.join(UPLOAD_DIR, info.storedName);
        if (fs.existsSync(expiredPath)) fs.unlinkSync(expiredPath);
        res.writeHead(410, { "Content-Type": "text/plain" });
        return res.end("This link has expired");
      }

      const filePath = path.join(UPLOAD_DIR, info.storedName);
      if (!fs.existsSync(filePath)) {
        links.delete(id);
        saveLinks();
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("File not found");
      }

      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${info.originalName.replace(/"/g, "")}"`,
        "Content-Length": stat.size,
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (req.method === "GET") {
      const file = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
      const safePath = path.normalize(file).replace(/^(\.\.[/\\])+/, "");
      const filePath = path.join(PUBLIC_DIR, safePath);
      if (isInsideDir(PUBLIC_DIR, filePath) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return serveStatic(res, filePath);
      }
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  } catch (err) {
    console.error("Request error:", err);
    if (err.message === "FILE_TOO_LARGE") {
      return sendJson(res, 400, { error: `File too large (max ${MAX_FILE_LABEL})` });
    }
    sendJson(res, 500, { error: err.message || "Server error" });
  }
});

server.requestTimeout = 0;
server.headersTimeout = 24 * 60 * 60 * 1000;
server.timeout = 0;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ZipToURL running on port ${PORT}`);
  console.log(`Max ZIP size: ${MAX_FILE_LABEL}`);
});
