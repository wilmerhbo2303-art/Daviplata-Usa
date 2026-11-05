export class DaviplataApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DaviplataApiError";
    this.status = status;
  }
}

const DEVICE_TOKEN_STORAGE_PREFIX = "daviplata-usa-device-token-v1:";
const ADMIN_NAME_STORAGE_KEY = "daviplata-admin-name-v1";

function savedAdminName() {
  try {
    return localStorage.getItem(ADMIN_NAME_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export async function daviplataApi<T>(
  action: string,
  payload: Record<string, unknown> = {},
  token?: string,
): Promise<T> {
  const requestPayload = { ...payload };
  const deviceTokenKey = action === "auth:login" && typeof payload.id === "string"
    ? `${DEVICE_TOKEN_STORAGE_PREFIX}${payload.id}`
    : "";
  if (deviceTokenKey) {
    try {
      const storedDeviceToken = localStorage.getItem(deviceTokenKey);
      if (storedDeviceToken) requestPayload.deviceToken = storedDeviceToken;
    } catch {
      // Continue with the current login; the server binds the first available device.
    }
  }
  const response = await fetch("/api/daviplata/data", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(action.startsWith("admin:") && savedAdminName()
        ? { "X-Admin-Name": savedAdminName() }
        : {}),
    },
    body: JSON.stringify({ action, ...requestPayload }),
  });
  const result = await response.json().catch(() => ({})) as {
    error?: string;
    deviceToken?: string;
  };
  if (!response.ok) {
    throw new DaviplataApiError(
      result.error || "No se pudo conectar con DaviPlata.",
      response.status,
    );
  }
  if (
    action === "auth:login" &&
    deviceTokenKey &&
    typeof result.deviceToken === "string"
  ) {
    try {
      localStorage.setItem(deviceTokenKey, result.deviceToken);
    } catch {
      // The app already uses local storage for the profile; continue if the browser blocks this write.
    }
  }
  return result as T;
}
