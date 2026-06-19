import type { DeviceInfo } from '@/types/common';

export interface Session {
  id: string;
  staffId: string;
  tokenHash: string;
  deviceFingerprint: string | null;
  browser: string | null;
  os: string | null;
  ipAddress: string;
  geolocation: string | null;
  isNewDevice: boolean;
  createdAt: string;
  lastActivity: string;
  expiresAt: string;
  invalidatedAt: string | null;
}

export interface SessionConfig {
  /** Idle timeout in milliseconds (default: 30 minutes) */
  idleTimeoutMs: number;
  /** Maximum session age in milliseconds (default: 8 hours) */
  maxAgeMs: number;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  idleTimeoutMs: 30 * 60 * 1000,    // 30 minutes
  maxAgeMs: 8 * 60 * 60 * 1000,     // 8 hours
};

export interface CreateSessionInput {
  staffId: string;
  deviceInfo: DeviceInfo;
}

export interface SessionValidationResult {
  valid: boolean;
  session: Session | null;
  reason?: 'not_found' | 'invalidated' | 'idle_timeout' | 'max_age_exceeded';
}
