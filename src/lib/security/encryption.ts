import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

/**
 * Encryption module for sensitive data at rest.
 * Uses AES-256-GCM with unique IV per encryption.
 * 
 * Used for: TOTP secrets, sensitive configuration values.
 */

function getEncryptionKey(): Buffer {
  const key = process.env.TOTP_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!key || key.length < 32) {
    throw new Error('TOTP_ENCRYPTION_KEY must be set and at least 32 characters');
  }
  // Derive a consistent 32-byte key using scrypt
  const salt = Buffer.from('fundedwealth-totp-v1', 'utf8');
  return scryptSync(key, salt, 32);
}

/**
 * Encrypt a plaintext string.
 * Returns base64-encoded ciphertext: iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a ciphertext string.
 * Expects format: iv:authTag:ciphertext (all hex)
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Check if a value is already encrypted (has the iv:tag:cipher format).
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  // Check if all parts are valid hex
  return parts.every(p => /^[0-9a-f]+$/.test(p));
}
