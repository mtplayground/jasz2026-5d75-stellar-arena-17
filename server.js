import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";

const host = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "8080", 10);
const rootDir = resolve(process.cwd(), existsSync("dist/index.html") ? "dist" : "src/client");

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

function resolveStaticPath(requestUrl) {
  const parsedUrl = new URL(requestUrl, "http://localhost");
  const pathname = decodeURIComponent(parsedUrl.pathname);
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const fullPath = normalize(join(rootDir, requestedPath));
  const relativePath = relative(rootDir, fullPath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return null;
  }

  if (existsSync(fullPath) && statSync(fullPath).isFile()) {
    return fullPath;
  }

  if (extname(requestedPath)) {
    return null;
  }

  return join(rootDir, "index.html");
}

const server = createServer((req, res) => {
  if (!req.url || req.method !== "GET") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  let filePath = null;
  try {
    filePath = resolveStaticPath(req.url);
  } catch (err) {
    console.error("Static path resolution failed", {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
  }

  if (!filePath) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const stream = createReadStream(filePath);
  stream.on("error", (err) => {
    console.error("Static asset response failed", {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end("Internal server error");
  });

  res.writeHead(200, {
    "content-type": contentTypes.get(extname(filePath)) || "application/octet-stream",
    "cache-control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=300",
  });
  stream.pipe(res);
});

server.listen(port, host, () => {
  console.log(`Game shell listening on http://${host}:${port}`);
});
