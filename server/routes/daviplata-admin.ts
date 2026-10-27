import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import {
  CreateDaviplataAdminSessionBody,
  CreateDaviplataAdminSessionResponse,
  DeleteDaviplataAdminSessionResponse,
  GetDaviplataAdminSessionResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const cookieName = "davi_admin_session";
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; resetAt: number }>();
const failedAttemptLimit = 8;
const failedAttemptWindowMs = 15 * 60 * 1000;

function makeSignature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function readSessionCookie(request: Request) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;
  const prefix = `${cookieName}=`;
  const cookie = cookieHeader.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix));
  return cookie ? cookie.slice(prefix.length) : null;
}

function hasValidAdminSession(request: Request) {
  const secret = process.env.SESSION_SECRET;
  const token = readSessionCookie(request);
  if (!secret || !token || token.length > 256) return false;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return false;
  const payload = token.slice(0, separator);
  const suppliedSignature = Buffer.from(token.slice(separator + 1));
  const expectedSignature = Buffer.from(makeSignature(payload, secret));
  if (suppliedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(suppliedSignature, expectedSignature)) return false;
  const expiresAt = Number(Buffer.from(payload, "base64url").toString("utf8"));
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

router.get("/daviplata/admin/session", (request, response) => {
  response.json(GetDaviplataAdminSessionResponse.parse({
    authenticated: hasValidAdminSession(request),
  }));
});

router.post("/daviplata/admin/session", (request, response) => {
  const parsed = CreateDaviplataAdminSessionBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid request body." });
    return;
  }

  const expectedPin = process.env.DAVIPLATA_ADMIN_PIN;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!expectedPin || !sessionSecret) {
    response.status(503).json({ error: "Admin authentication is not configured." });
    return;
  }

  const now = Date.now();
  const attemptKey = request.ip || "unknown";
  const previousAttempts = failedAttempts.get(attemptKey);
  if (previousAttempts && previousAttempts.resetAt <= now) failedAttempts.delete(attemptKey);
  const activeAttempts = failedAttempts.get(attemptKey);
  if (activeAttempts && activeAttempts.count >= failedAttemptLimit) {
    response.status(429).json({ error: "Too many failed attempts. Try again later." });
    return;
  }

  const suppliedPin = Buffer.from(parsed.data.pin);
  const expectedPinBuffer = Buffer.from(expectedPin);
  const validPin = suppliedPin.length === expectedPinBuffer.length &&
    timingSafeEqual(suppliedPin, expectedPinBuffer);
  if (!validPin) {
    const current = failedAttempts.get(attemptKey);
    failedAttempts.set(attemptKey, {
      count: (current?.count ?? 0) + 1,
      resetAt: current?.resetAt ?? now + failedAttemptWindowMs,
    });
    response.status(401).json({ error: "Invalid PIN." });
    return;
  }

  failedAttempts.delete(attemptKey);
  const payload = Buffer.from(String(now + sessionLifetimeMs)).toString("base64url");
  const token = `${payload}.${makeSignature(payload, sessionSecret)}`;
  response.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/daviplata/admin",
    maxAge: sessionLifetimeMs,
  });
  response.json(CreateDaviplataAdminSessionResponse.parse({ authenticated: true }));
});

router.delete("/daviplata/admin/session", (_request, response) => {
  response.clearCookie(cookieName, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/daviplata/admin",
  });
  response.json(DeleteDaviplataAdminSessionResponse.parse({ authenticated: false }));
});

export default router;
