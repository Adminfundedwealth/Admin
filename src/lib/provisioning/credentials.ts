import { randomBytes, randomInt } from 'crypto';

/**
 * Terminal credential generation for emergency-provisioned accounts.
 * Generates login ID, temporary password, activation token, and expiry.
 * These are stored in trading_accounts.metadata or admin-owned emergency_credentials table.
 */

/**
 * Generate a numeric terminal login ID (8-digit, never starts with 0).
 * Match-Trader uses numeric login IDs.
 */
export function generateTerminalLoginId(): string {
  // First digit 1-9, remaining 7 digits 0-9
  const first = randomInt(1, 10).toString();
  const rest = Array.from({ length: 7 }, () => randomInt(0, 10).toString()).join('');
  return first + rest;
}

/**
 * Generate a secure temporary password.
 * Format: 2 uppercase + 2 digits + 4 lowercase + 2 special = 10 chars
 * Always satisfies complexity requirements for Match-Trader.
 */
export function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '@#$!';

  const pick = (charset: string, count: number) =>
    Array.from({ length: count }, () => charset[randomInt(0, charset.length)]).join('');

  const parts = [
    pick(upper, 2),
    pick(digits, 2),
    pick(lower, 4),
    pick(special, 2),
  ].join('').split('');

  // Fisher-Yates shuffle
  for (let i = parts.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }
  return parts.join('');
}

/**
 * Generate a cryptographically secure activation token (UUID v4 format).
 */
export function generateActivationToken(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant bits
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Generate credential expiry timestamp (48 hours from now).
 */
export function generateCredentialExpiry(hoursFromNow = 48): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

export interface TerminalCredentials {
  terminal_login: string;
  temporary_password: string;
  activation_token: string;
  expiry: string;
}

export function generateTerminalCredentials(): TerminalCredentials {
  return {
    terminal_login: generateTerminalLoginId(),
    temporary_password: generateTemporaryPassword(),
    activation_token: generateActivationToken(),
    expiry: generateCredentialExpiry(48),
  };
}
