import { createHmac, timingSafeEqual } from "node:crypto";

const cookieName = "davi_admin_session";
const cookiePath = "/api/daviplata";
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const failedAttemptLimit = 8;
const failedAttemptWindowMs = 15 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; resetAt: number }>();

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requestCookie(request: any) {
  const prefix = `${cookieName}=`;
  const value = String(request.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

function hasValidSession(request: any) {
  const secret = process.env.SESSION_SECRET;
  const token = requestCookie(request);
  if (!secret || !token || token.length > 256) return false;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return false;
  const payload = token.slice(0, separator);
  if (!secureEqual(token.slice(separator + 1), sign(payload, secret))) return false;
  const expiresAt = Number(Buffer.from(payload, "base64url").toString("utf8"));
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

async function readBody(request: any): Promise<Record<string, unknown>> {
  if (request.body && typeof request.body === "object") return request.body;
  const body = typeof request.body === "string"
    ? request.body
    : await new Promise<string>((resolve, reject) => {
        let text = "";
        request.on("data", (chunk: Buffer | string) => {
          text += chunk.toString();
          if (text.length > 4096) reject(new Error("body-too-large"));
        });
        request.on("end", () => resolve(text));
        request.on("error", reject);
      });
  if (!body) return {};
  const parsed = JSON.parse(body);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function send(response: any, status: number, body: Record<string, unknown>, cookie?: string | string[]) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  if (cookie) response.setHeader("Set-Cookie", cookie);
  response.end(JSON.stringify(body));
}

function getAttemptKey(request: any) {
  const forwarded = request.headers["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : String(forwarded ?? "").split(",")[0];
  return String(firstForwarded || request.socket?.remoteAddress || "unknown").trim();
}

function cookieOptions(maxAge: number, path = cookiePath) {
  return [
    `Path=${path}`,
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}

export default async function handler(request: any, response: any) {
  if (request.method === "GET") {
    send(response, 200, { authenticated: hasValidSession(request) });
    return;
  }
  if (request.method === "DELETE") {
    const expired = "Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Strict";
    send(response, 200, { authenticated: false }, [
      `${cookieName}=; Path=${cookiePath}; ${expired}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
      `${cookieName}=; Path=/api/daviplata/admin; ${expired}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    ]);
    return;
  }
  if (request.method !== "POST") {
    send(response, 405, { error: "Método no permitido." });
    return;
  }

  const expectedPin = process.env.DAVIPLATA_ADMIN_PIN;
  const secret = process.env.SESSION_SECRET;
  if (!expectedPin || !secret) {
    send(response, 503, { error: "El acceso del panel aún no está configurado." });
    return;
  }

  const now = Date.now();
  const attemptKey = getAttemptKey(request);
  const previous = failedAttempts.get(attemptKey);
  if (previous && previous.resetAt <= now) failedAttempts.delete(attemptKey);
  const active = failedAttempts.get(attemptKey);
  if (active && active.count >= failedAttemptLimit) {
    send(response, 429, { error: "Demasiados intentos. Espera antes de volver a probar." });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readBody(request);
  } catch {
    send(response, 400, { error: "Solicitud inválida." });
    return;
  }
  const supplied = typeof body.pin === "string" ? body.pin : "";
  if (!secureEqual(supplied, expectedPin)) {
    failedAttempts.set(attemptKey, {
      count: (active?.count ?? 0) + 1,
      resetAt: active?.resetAt ?? now + failedAttemptWindowMs,
    });
    send(response, 401, { error: "PIN incorrecto." });
    return;
  }

  failedAttempts.delete(attemptKey);
  const payload = Buffer.from(String(now + sessionLifetimeMs)).toString("base64url");
  const token = `${payload}.${sign(payload, secret)}`;
  const cookie = `${cookieName}=${token}; ${cookieOptions(sessionLifetimeMs)}`;
  send(response, 200, { authenticated: true }, cookie);
}
