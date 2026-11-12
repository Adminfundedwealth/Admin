const TOKEN_VERSION = 'v1';
const encoder = new TextEncoder();

export const CSRF_COOKIE_NAME = '__csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function importSessionKey(sessionToken: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(sessionToken),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Create a stable, session-bound double-submit token. The high-entropy,
 * HttpOnly session token is the HMAC key, so tokens rotate with sessions and
 * remain identical across tabs and concurrent requests for that session.
 */
export async function generateCSRFToken(
  sessionToken: string,
  sessionExpiresAt: number,
): Promise<string> {
  if (!sessionToken || !Number.isSafeInteger(sessionExpiresAt) || sessionExpiresAt <= Date.now()) {
    throw new Error('Cannot create a CSRF token for an invalid or expired session');
  }

  const payload = `${TOKEN_VERSION}.${sessionExpiresAt}`;
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    await importSessionKey(sessionToken),
    encoder.encode(payload),
  );

  return `${payload}.${toHex(new Uint8Array(signature))}`;
}

export async function verifyCSRFToken(
  token: string,
  sessionToken: string,
  sessionExpiresAt: number,
): Promise<boolean> {
  if (!token || !sessionToken || !Number.isSafeInteger(sessionExpiresAt)) return false;

  const [version, expiryPart, signaturePart, extraPart] = token.split('.');
  if (version !== TOKEN_VERSION || !expiryPart || !signaturePart || extraPart !== undefined) return false;
  if (!/^\d+$/.test(expiryPart) || Number(expiryPart) !== sessionExpiresAt) return false;

  const signature = fromHex(signaturePart);
  if (!signature || Number(expiryPart) <= Date.now()) return false;
  const signatureBuffer = new ArrayBuffer(signature.byteLength);
  new Uint8Array(signatureBuffer).set(signature);

  return globalThis.crypto.subtle.verify(
    'HMAC',
    await importSessionKey(sessionToken),
    signatureBuffer,
    encoder.encode(`${version}.${expiryPart}`),
  );
}

export async function validateCSRFToken(
  cookieToken: string | undefined,
  headerToken: string | null,
  sessionToken: string,
  sessionExpiresAt: number,
): Promise<boolean> {
  return Boolean(
    cookieToken &&
    headerToken &&
    cookieToken === headerToken &&
    await verifyCSRFToken(cookieToken, sessionToken, sessionExpiresAt),
  );
}
