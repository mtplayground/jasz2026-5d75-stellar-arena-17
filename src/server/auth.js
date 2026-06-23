import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

let jwks = null;

function getJwks() {
  if (!process.env.MCTAI_AUTH_JWKS_URL) {
    return null;
  }

  if (!jwks) {
    jwks = jwksClient({ jwksUri: process.env.MCTAI_AUTH_JWKS_URL });
  }

  return jwks;
}

export function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf("=");
        if (separator === -1) {
          return [entry, ""];
        }

        const key = entry.slice(0, separator);
        const value = entry.slice(separator + 1);
        try {
          return [key, decodeURIComponent(value)];
        } catch {
          return [key, value];
        }
      }),
  );
}

function getSigningKey(header, callback) {
  const client = getJwks();
  if (!client) {
    callback(new Error("MCTAI_AUTH_JWKS_URL is not configured"));
    return;
  }

  client
    .getSigningKey(header.kid)
    .then((key) => callback(null, key.getPublicKey()))
    .catch((err) => callback(err));
}

export async function verifySession(req) {
  const token = parseCookies(req.headers.cookie).mctai_session;
  if (!token) {
    return null;
  }

  if (!process.env.MCTAI_AUTH_URL || !process.env.MCTAI_AUTH_APP_TOKEN) {
    console.error("Auth session verification is not configured", {
      hasAuthUrl: Boolean(process.env.MCTAI_AUTH_URL),
      hasAppToken: Boolean(process.env.MCTAI_AUTH_APP_TOKEN),
      hasJwksUrl: Boolean(process.env.MCTAI_AUTH_JWKS_URL),
    });
    return null;
  }

  try {
    return await new Promise((resolve, reject) => {
      jwt.verify(
        token,
        getSigningKey,
        {
          audience: process.env.MCTAI_AUTH_APP_TOKEN,
          issuer: process.env.MCTAI_AUTH_URL,
        },
        (err, claims) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(claims);
        },
      );
    });
  } catch (err) {
    console.error("Auth session verification failed", {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
    return null;
  }
}

export function getPublicOrigin(req) {
  if (process.env.SELF_URL) {
    return process.env.SELF_URL.replace(/\/+$/, "");
  }

  const forwardedHost = req.headers["x-forwarded-host"];
  const forwardedProto = req.headers["x-forwarded-proto"];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.headers.host;
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || "http";

  return `${proto}://${host}`;
}

export function buildLoginUrl(req) {
  if (!process.env.MCTAI_AUTH_URL || !process.env.MCTAI_AUTH_APP_TOKEN) {
    return null;
  }

  const authUrl = process.env.MCTAI_AUTH_URL.replace(/\/+$/, "");
  const loginUrl = new URL(`${authUrl}/login`);
  loginUrl.searchParams.set("app_token", process.env.MCTAI_AUTH_APP_TOKEN);
  loginUrl.searchParams.set("return_to", `${getPublicOrigin(req)}/`);
  return loginUrl.toString();
}
