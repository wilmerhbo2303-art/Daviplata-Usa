export type BrebLookupResult = {
  name: string;
  bank: string;
};

export async function lookupDaviplataBrebKey(
  key: string,
  signal?: AbortSignal,
): Promise<BrebLookupResult> {
  const response = await fetch('/api/daviplata/breb/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ key }),
    cache: 'no-store',
    signal,
  });
  const payload = await response.json().catch(() => null) as {
    name?: unknown;
    bank?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok) {
    const message = typeof payload?.error === 'string'
      ? payload.error
      : 'No se pudo consultar esta llave Bre-B.';
    throw new Error(message);
  }
  if (typeof payload?.name !== 'string' || !payload.name.trim() ||
      typeof payload.bank !== 'string' || !payload.bank.trim()) {
    throw new Error('La consulta no devolvió un nombre y una entidad válidos.');
  }
  return { name: payload.name.trim(), bank: payload.bank.trim() };
}
