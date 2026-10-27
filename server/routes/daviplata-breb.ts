import { Router, type IRouter, type Response } from "express";
import {
  LookupDaviplataBrebKeyBody,
  LookupDaviplataBrebKeyResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const providerBaseUrl = "https://llavesbre-b.cryspi.workers.dev/c/";
const providerTimeoutMs = 25_000;
const maxProviderResponseBytes = 64_000;
const lookupWindowMs = 60 * 60 * 1000;
const lookupLimitPerWindow = 20;
const lookupMinimumIntervalMs = 2_000;
const rateLimits = new Map<string, { windowStartedAt: number; count: number; lastRequestedAt: number }>();

function cleanName(value: unknown) {
  const name = typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)
    : "";
  if (!name || /^\d{7,}$/.test(name) || !/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(name)) return "";
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/^(?:no\s+(?:el|se|hay|existe|fue|pudo|puede|encontro|consiguio|disponible)\b|error\b|not\s+found\b|undefined\b|null\b)/.test(normalized)) {
    return "";
  }
  return name;
}

function cleanBank(value: unknown) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
    : "";
}

function apiError(res: Response, status: number, message: string) {
  res.status(status).set("Cache-Control", "no-store").json({ error: message });
}

function applyRateLimit(ip: string, now: number) {
  let current = rateLimits.get(ip);
  if (!current || now - current.windowStartedAt >= lookupWindowMs) {
    current = { windowStartedAt: now, count: 0, lastRequestedAt: 0 };
  }
  if (current.count >= lookupLimitPerWindow) {
    rateLimits.set(ip, current);
    return "Alcanzaste el límite de consultas Bre-B por ahora.";
  }
  if (current.lastRequestedAt && now - current.lastRequestedAt < lookupMinimumIntervalMs) {
    rateLimits.set(ip, current);
    return "Espera un momento antes de consultar otra llave.";
  }
  rateLimits.set(ip, {
    ...current,
    count: current.count + 1,
    lastRequestedAt: now,
  });
  if (rateLimits.size > 2_000) {
    for (const [key, entry] of rateLimits) {
      if (now - entry.windowStartedAt >= lookupWindowMs) rateLimits.delete(key);
    }
  }
  return null;
}

async function fetchProvider(candidate: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), providerTimeoutMs);
  try {
    const response = await fetch(`${providerBaseUrl}${encodeURIComponent(candidate)}`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > maxProviderResponseBytes) {
      throw new Error("provider-response-too-large");
    }
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }
    return {
      status: response.status,
      retryAfter: response.headers.get("retry-after") || "",
      payload,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function providerErrorText(payload: unknown) {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  return [record.error, record.message, record.mensaje, record.raw]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function isProviderAttemptLimit(payload: unknown) {
  const normalized = providerErrorText(payload).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /too many failed attempts|too many attempts|demasiados intentos|transaction rejected/.test(normalized);
}

router.post("/daviplata/breb/lookup", async (req, res): Promise<void> => {
  const parsed = LookupDaviplataBrebKeyBody.safeParse(req.body);
  if (!parsed.success) {
    apiError(res, 400, "Escribe una llave Bre-B válida.");
    return;
  }
  const key = parsed.data.key.normalize("NFC").trim();
  if (key.length < 3 || key.length > 80 || /[\u0000-\u001f\u007f]/.test(key)) {
    apiError(res, 400, "Escribe una llave Bre-B válida.");
    return;
  }

  const rateLimitError = applyRateLimit(req.ip || req.socket.remoteAddress || "unknown", Date.now());
  if (rateLimitError) {
    apiError(res, 429, rateLimitError);
    return;
  }

  const candidates = [key];
  if (key.startsWith("@") && key.length > 1) candidates.push(key.slice(1));
  else if (!key.includes("@")) candidates.push(`@${key}`);

  let result: Awaited<ReturnType<typeof fetchProvider>> | null = null;
  try {
    for (const candidate of candidates) {
      result = await fetchProvider(candidate);
      if (result.status !== 404) break;
    }
  } catch (error) {
    const isTimeout = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    req.log.warn(
      { failure: isTimeout ? "timeout" : "provider-request" },
      "DaviPlata Bre-B lookup provider failed",
    );
    apiError(res, 502, "No se pudo consultar el nombre y la entidad de la llave. Intenta de nuevo más tarde.");
    return;
  }

  if (!result) {
    apiError(res, 502, "No se pudo consultar el nombre y la entidad de la llave. Intenta de nuevo más tarde.");
    return;
  }
  if (result.status === 404) {
    apiError(res, 404, "El proveedor no encontró datos para esta llave.");
    return;
  }
  if (result.status === 429 || isProviderAttemptLimit(result.payload)) {
    const retryAfter = result.retryAfter ? ` Espera ${result.retryAfter} antes de intentar de nuevo.` : "";
    apiError(res, 429, `El proveedor rechazó temporalmente la consulta.${retryAfter}`);
    return;
  }
  if (result.status < 200 || result.status >= 300) {
    req.log.warn({ status: result.status }, "DaviPlata Bre-B lookup returned a provider error");
    apiError(res, 502, "No se pudo consultar el nombre y la entidad de la llave. Intenta de nuevo más tarde.");
    return;
  }

  const payload = result.payload && typeof result.payload === "object"
    ? result.payload as Record<string, unknown>
    : null;
  const name = cleanName(payload?.nombre);
  const bank = cleanBank(payload?.banco);
  if (payload?.ok !== true || !name || bank.length < 2) {
    apiError(res, 502, "La consulta no devolvió un nombre y una entidad válidos.");
    return;
  }

  res
    .set("Cache-Control", "no-store")
    .json(LookupDaviplataBrebKeyResponse.parse({ name, bank }));
});

export default router;
