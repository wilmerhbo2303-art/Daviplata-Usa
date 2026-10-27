export type ParsedBrebQr = {
  method: 'Llave Bre-B';
  name: string;
  identifier: string;
};

type Tlv = Record<string, string>;

const normalizeKey = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const asText = (value: unknown): string | undefined => {
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    return text || undefined;
  }
  return undefined;
};

function normalizeRecipientName(value: unknown): string {
  const name = typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
    : '';
  if (!name || !/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(name) || /^\d+$/.test(name)) return '';
  if (/^(?:null|undefined|none|n\/a|no name|sin nombre|qr|bre[\s-]?b|redeban)$/i.test(name)) return '';
  return name;
}

const BREB_ALIAS_PATTERN = /^@[a-z0-9][a-z0-9._-]{2,63}$/i;

function findBrebAlias(value: string): string | undefined {
  const match = value.match(/(?:^|[^a-z0-9._-])(@[a-z0-9][a-z0-9._-]{2,63})(?![a-z0-9._-])/i);
  return match?.[1] && BREB_ALIAS_PATTERN.test(match[1]) ? match[1] : undefined;
}

function findField(value: unknown, aliases: string[]): string | undefined {
  const accepted = new Set(aliases.map(normalizeKey));
  const queue: unknown[] = [value];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    for (const [key, child] of Object.entries(current)) {
      if (accepted.has(normalizeKey(key))) {
        const text = asText(child);
        if (text) return text;
      }
      if (child && typeof child === 'object') queue.push(child);
    }
  }
  return undefined;
}

function parseTlv(source: string): Tlv | undefined {
  const result: Tlv = {};
  const bytes = new TextEncoder().encode(source);
  let offset = 0;
  let fields = 0;
  while (offset + 4 <= bytes.length) {
    const tag = String.fromCharCode(bytes[offset], bytes[offset + 1]);
    const lengthText = String.fromCharCode(bytes[offset + 2], bytes[offset + 3]);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) return undefined;
    const length = Number(lengthText);
    const start = offset + 4;
    const end = start + length;
    if (!length || end > bytes.length) return undefined;
    result[tag] = new TextDecoder().decode(bytes.subarray(start, end));
    offset = end;
    fields++;
  }
  return offset === bytes.length && fields ? result : undefined;
}

function fromObject(data: unknown, hint = ''): ParsedBrebQr | undefined {
  const name = findField(data, ['name', 'recipientName', 'receiverName', 'beneficiaryName', 'displayName']);
  const key = findField(data, ['brebKey', 'recipientKey', 'receiverKey', 'brebAlias', 'recipientAlias', 'targetAlias', 'key', 'alias', 'phone', 'mobile', 'cellphone']);
  if (!key || (!/breb|banrep|cocomrbm(?:red|lla)/.test(normalizeKey(hint)) && !key.trim().startsWith('@'))) {
    return undefined;
  }
  return { method: 'Llave Bre-B', name: normalizeRecipientName(name), identifier: key.trim().slice(0, 80) };
}

function fromEmv(raw: string): ParsedBrebQr | undefined {
  const main = parseTlv(raw);
  if (!main) return undefined;
  const profiles = Object.entries(main)
    .filter(([tag]) => Number(tag) >= 26 && Number(tag) <= 51)
    .map(([tag, value]) => ({ tag, fields: parseTlv(value) }))
    .filter((entry): entry is { tag: string; fields: Tlv } => Boolean(entry.fields));
  const name = normalizeRecipientName(main['59']);
  const additional = main['62'] ? parseTlv(main['62']) : undefined;
  const lla = profiles.find(({ fields }) => normalizeKey(fields['00'] ?? '') === 'cocomrbmlla')?.fields;
  const llaKey = [lla?.['04'], lla?.['05'], lla?.['02']]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));
  if (llaKey) return { method: 'Llave Bre-B', name, identifier: llaKey.slice(0, 80) };

  const redeban = profiles.some(({ fields }) => normalizeKey(fields['00'] ?? '') === 'cocomrbmred');
  const redebanKey = additional?.['02']?.trim();
  const isPhone = Boolean(redebanKey && /^\d{10}$/.test(redebanKey));
  const isAlias = Boolean(redebanKey && /^@?[a-z0-9][a-z0-9._-]{2,63}$/i.test(redebanKey) && /[a-z]/i.test(redebanKey));
  if (redeban && redebanKey && (isPhone || isAlias)) {
    return { method: 'Llave Bre-B', name, identifier: redebanKey.slice(0, 80) };
  }
  const embeddedAlias = findBrebAlias(raw);
  return embeddedAlias ? { method: 'Llave Bre-B', name, identifier: embeddedAlias } : undefined;
}

export function parseBrebQrPayload(rawValue: string): ParsedBrebQr | undefined {
  const raw = rawValue.trim();
  if (!raw || raw.length > 8192) return undefined;
  if (BREB_ALIAS_PATTERN.test(raw)) {
    return { method: 'Llave Bre-B', name: '', identifier: raw };
  }

  try {
    const parsed = fromObject(JSON.parse(raw) as unknown, raw);
    if (parsed) return parsed;
  } catch {
    // Continue with URL, EMV and text payloads.
  }

  try {
    const url = new URL(raw);
    const query: Record<string, string> = {};
    for (const [key, value] of url.searchParams) query[key] = value;
    const result = fromObject(query, `${url.hostname} ${url.pathname} ${query.network ?? ''} ${query.rail ?? ''}`);
    if (result) return result;
    const alias = findBrebAlias(raw);
    if (alias) {
      return {
        method: 'Llave Bre-B',
        name: normalizeRecipientName(findField(query, ['name', 'recipientName', 'receiverName', 'displayName'])),
        identifier: alias,
      };
    }
  } catch {
    // Not a URL.
  }

  const emv = fromEmv(raw);
  if (emv) return emv;
  const embeddedAlias = findBrebAlias(raw);
  if (embeddedAlias) return { method: 'Llave Bre-B', name: '', identifier: embeddedAlias };

  const pairs: Record<string, string> = {};
  raw.split(/[|&;\n\r]/).forEach((part) => {
    const separatorIndex = part.search(/[=:]/);
    if (separatorIndex > 0) pairs[part.slice(0, separatorIndex).trim()] = part.slice(separatorIndex + 1).trim();
  });
  return fromObject(pairs, raw);
}
