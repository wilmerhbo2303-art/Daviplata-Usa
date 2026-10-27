export class DaviplataApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DaviplataApiError";
    this.status = status;
  }
}

export async function daviplataApi<T>(
  action: string,
  payload: Record<string, unknown> = {},
  token?: string,
): Promise<T> {
  const response = await fetch("/api/daviplata/data", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    throw new DaviplataApiError(
      result.error || "No se pudo conectar con DaviPlata.",
      response.status,
    );
  }
  return result as T;
}
