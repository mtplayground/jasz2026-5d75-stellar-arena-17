import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { buildLoginUrl, verifySession } from "./src/server/auth.js";
import {
  ensureSchema,
  getPool,
  listGearForPlayer,
  saveClearedLevelForClaims,
  upsertPlayerFromClaims,
} from "./src/server/db.js";

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

function writeJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function redirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

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

async function handleAuth(req, res, pathname) {
  if (pathname === "/auth/login" && req.method === "GET") {
    const loginUrl = buildLoginUrl(req);

    if (!loginUrl) {
      writeJson(res, 503, {
        error: "auth_not_configured",
        message: "Sign-in is not configured for this environment.",
      });
      return true;
    }

    redirect(res, loginUrl);
    return true;
  }

  if (pathname === "/auth/logout" && req.method === "POST") {
    res.writeHead(204, {
      "set-cookie": "mctai_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      "cache-control": "no-store",
    });
    res.end();
    return true;
  }

  return false;
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/gear") {
    return handleGear(req, res);
  }

  if (pathname === "/api/player/progress") {
    return handlePlayerProgress(req, res);
  }

  if (pathname !== "/api/player") {
    return false;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    writeJson(res, 405, { error: "method_not_allowed" });
    return true;
  }

  if (req.method === "POST") {
    try {
      await readJsonBody(req);
    } catch {
      writeJson(res, 400, { error: "invalid_json" });
      return true;
    }
  }

  const claims = await verifySession(req);
  const loginUrl = buildLoginUrl(req);

  if (!claims) {
    writeJson(res, 401, {
      authenticated: false,
      loginUrl,
    });
    return true;
  }

  try {
    const player = await upsertPlayerFromClaims(claims);
    writeJson(res, 200, {
      authenticated: true,
      player: {
        sub: player.sub,
        email: player.email,
        name: player.name,
        pictureUrl: player.pictureUrl,
        highestClearedLevel: player.highestClearedLevel,
        createdAt: player.createdAt,
        lastSeenAt: player.lastSeenAt,
      },
      isNew: player.isNew,
      message: player.isNew
        ? "Registration complete."
        : `Welcome back, ${player.name || player.email}.`,
    });
  } catch (err) {
    console.error("Player upsert failed", {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
    writeJson(res, 503, {
      authenticated: true,
      error: "player_persistence_unavailable",
      message: "Player account storage is temporarily unavailable.",
    });
  }

  return true;
}

async function handlePlayerProgress(req, res) {
  if (req.method !== "POST") {
    writeJson(res, 405, { error: "method_not_allowed" });
    return true;
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    writeJson(res, 400, { error: "invalid_json" });
    return true;
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    writeJson(res, 400, { error: "invalid_json" });
    return true;
  }

  const clearedLevel = Number(body.clearedLevel);
  if (!Number.isInteger(clearedLevel) || clearedLevel < 1) {
    writeJson(res, 400, { error: "invalid_cleared_level" });
    return true;
  }

  const claims = await verifySession(req);
  const loginUrl = buildLoginUrl(req);

  if (!claims) {
    writeJson(res, 401, {
      authenticated: false,
      loginUrl,
    });
    return true;
  }

  try {
    const player = await saveClearedLevelForClaims(claims, clearedLevel);
    writeJson(res, 200, {
      authenticated: true,
      player: {
        sub: player.sub,
        email: player.email,
        name: player.name,
        pictureUrl: player.pictureUrl,
        highestClearedLevel: player.highestClearedLevel,
        createdAt: player.createdAt,
        lastSeenAt: player.lastSeenAt,
      },
      message: `Level ${clearedLevel} clear recorded.`,
    });
  } catch (err) {
    console.error("Player progress save failed", {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
    writeJson(res, 503, {
      authenticated: true,
      error: "player_progress_unavailable",
      message: "Player progress could not be saved.",
    });
  }

  return true;
}

async function handleGear(req, res) {
  if (req.method !== "GET") {
    writeJson(res, 405, { error: "method_not_allowed" });
    return true;
  }

  const claims = await verifySession(req);
  const loginUrl = buildLoginUrl(req);

  if (!claims) {
    writeJson(res, 401, {
      authenticated: false,
      loginUrl,
    });
    return true;
  }

  try {
    const gear = await listGearForPlayer(claims);
    writeJson(res, 200, {
      authenticated: true,
      definitions: gear.definitions,
      ownedGear: gear.ownedGear,
    });
  } catch (err) {
    console.error("Gear fetch failed", {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
    writeJson(res, 503, {
      authenticated: true,
      error: "gear_unavailable",
      message: "Gear data is temporarily unavailable.",
    });
  }

  return true;
}

function serveStatic(req, res) {
  if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) {
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

  res.writeHead(200, {
    "content-type": contentTypes.get(extname(filePath)) || "application/octet-stream",
    "cache-control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=300",
  });

  if (req.method === "HEAD") {
    res.end();
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

  stream.pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url || "/", "http://localhost");

    if (await handleAuth(req, res, parsedUrl.pathname)) {
      return;
    }

    if (parsedUrl.pathname.startsWith("/api/")) {
      if (await handleApi(req, res, parsedUrl.pathname)) {
        return;
      }

      writeJson(res, 404, { error: "not_found" });
      return;
    }

    serveStatic(req, res);
  } catch (err) {
    console.error("Request failed", {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
    if (!res.headersSent) {
      writeJson(res, 500, { error: "internal_server_error" });
    } else {
      res.end();
    }
  }
});

try {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
    } catch (err) {
      console.error("Database schema check failed", {
        name: err.name,
        message: err.message,
        stack: err.stack,
      });
    }
  } else {
    console.warn("DATABASE_URL is not configured; authenticated player persistence is disabled");
  }

  server.listen(port, host, () => {
    console.log(`Game shell listening on http://${host}:${port}`);
  });
} catch (err) {
  console.error("Server startup failed", {
    name: err.name,
    message: err.message,
    stack: err.stack,
  });
  process.exit(1);
}
