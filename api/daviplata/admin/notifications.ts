function clean(value: unknown) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240) || "—";
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
  token,
  chatId,
  app,
  event,
  fields = {},
  userAgent = "",
}: {
  token?: string;
  chatId?: string;
  app: string;
  event: string;
  fields?: Record<string, unknown>;
  userAgent?: string;
}) {
  const privateChatId = String(chatId ?? "").trim();
  // Telegram user chats have positive IDs; reject group/channel IDs.
  if (!token || !/^\d{5,20}$/.test(privateChatId)) return false;

  const lines = [
    `🔔 ${clean(event)}`,
    `Aplicación: ${clean(app)}`,
    ...Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([label, value]) => `${clean(label)}: ${clean(value)}`),
  ];
  if (userAgent) lines.push(`Dispositivo del administrador: ${describeAdminDevice(userAgent)}`);
  lines.push(`Fecha: ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: privateChatId, text: lines.join("\n") }),
      signal: controller.signal,
    });
    if (!response.ok) console.warn("[DaviPlata admin alerts] Telegram delivery failed:", response.status);
    return response.ok;
  } catch {
    console.warn("[DaviPlata admin alerts] Telegram delivery failed.");
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
