const providerBaseUrl = "https://llavesbre-b.cryspi.workers.dev/c/";
const providerTimeoutMs = 25_000;
const maxProviderResponseBytes = 64_000;
const lookupWindowMs = 60 * 60 * 1000;
const lookupLimitPerWindow = 20;
const lookupMinimumIntervalMs = 2_000;
const rateLimits = new Map<string, { windowStartedAt: number; count: number; lastRequestedAt: number }>();

type RequestLike = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  on?: (event: string, listener: (...args: any[]) => void) => void;
};

type ResponseLike = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

function send(response: ResponseLike, status: number, body: Record<string, unknown>) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function readBody(request: RequestLike): Promise<Record<string, unknown>> {
  if (request.body && typeof request.body === "object" && !Array.isArray(request.body)) {
    return request.body as Record<string, unknown>;
  }
  const raw = typeof request.body === "string"
    ? request.body
    : await new Promise<string>((resolve, reject) => {
        if (!request.on) {
          resolve("");
          return;
        }
        let text = "";
        request.on("data", (chunk: Buffer | string) => {
          text += chunk.toString();
          if (text.length > 4096) reject(new Error("request-too-large"));
        });
        request.on("end", () => resolve(text));
        request.on("error", reject);
      });
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

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

function requestIp(request: RequestLike) {
  const forwarded = request.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : String(forwarded ?? "").split(",")[0];
  return String(first || request.socket?.remoteAddress || "unknown").trim();
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
  rateLimits.set(ip, { ...current, count: current.count + 1, lastRequestedAt: now });
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
    const result = await fetch(`${providerBaseUrl}${encodeURIComponent(candidate)}`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    const raw = await result.text();
    if (Buffer.byteLength(raw, "utf8") > maxProviderResponseBytes) {
      throw new Error("provider-response-too-large");
    }
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }
    return { status: result.status, retryAfter: result.headers.get("retry-after") || "", payload };
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

export default async function handler(request: RequestLike, response: ResponseLike) {
  if (request.method !== "POST") {
    send(response, 405, { error: "Método no permitido." });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readBody(request);
  } catch {
    send(response, 400, { error: "Solicitud inválida." });
    return;
  }
  const key = typeof body.key === "string" ? body.key.normalize("NFC").trim() : "";
  if (key.length < 3 || key.length > 80 || /[\u0000-\u001f\u007f]/.test(key)) {
    send(response, 400, { error: "Escribe una llave Bre-B válida." });
    return;
  }

  const limitError = applyRateLimit(requestIp(request), Date.now());
  if (limitError) {
    send(response, 429, { error: limitError });
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
    console.warn("DaviPlata Bre-B lookup provider failed", isTimeout ? "timeout" : "provider-request");
    send(response, 502, { error: "No se pudo consultar el nombre y la entidad de la llave. Intenta de nuevo más tarde." });
    return;
  }

  if (!result) {
    send(response, 502, { error: "No se pudo consultar el nombre y la entidad de la llave. Intenta de nuevo más tarde." });
    return;
  }
  if (result.status === 404) {
    send(response, 404, { error: "El proveedor no encontró datos para esta llave." });
    return;
  }
  if (result.status === 429 || isProviderAttemptLimit(result.payload)) {
    const retryAfter = result.retryAfter ? ` Espera ${result.retryAfter} antes de intentar de nuevo.` : "";
    send(response, 429, { error: `El proveedor rechazó temporalmente la consulta.${retryAfter}` });
    return;
  }
  if (result.status < 200 || result.status >= 300) {
    console.warn("DaviPlata Bre-B lookup returned provider status", result.status);
    send(response, 502, { error: "No se pudo consultar el nombre y la entidad de la llave. Intenta de nuevo más tarde." });
    return;
  }

  const payload = result.payload && typeof result.payload === "object"
    ? result.payload as Record<string, unknown>
    : null;
  const name = cleanName(payload?.nombre);
  const bank = cleanBank(payload?.banco);
  if (payload?.ok !== true || !name || bank.length < 2) {
    send(response, 502, { error: "La consulta no devolvió un nombre y una entidad válidos." });
    return;
  }
  send(response, 200, { name, bank });
}
