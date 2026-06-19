import { createAdminClient } from '@/lib/supabase/admin';
import { createHash, randomBytes } from 'crypto';
import type {
  Session,
  SessionConfig,
  CreateSessionInput,
  SessionValidationResult,
  DEFAULT_SESSION_CONFIG,
} from './types';

/**
 * Session Manager - handles creation, validation, refresh, and invalidation
 * of staff sessions. Stateless design - all state stored in Supabase.
 */
export class SessionManager {
  private config: SessionConfig;

  constructor(config?: Partial<SessionConfig>) {
    this.config = {
      idleTimeoutMs: config?.idleTimeoutMs ?? 30 * 60 * 1000,
      maxAgeMs: config?.maxAgeMs ?? 8 * 60 * 60 * 1000,
    };
  }

  /**
   * Create a new session for a staff member.
   * Returns the raw token (to be sent to client) and the session record.
   */
  async create(input: CreateSessionInput): Promise<{ token: string; session: Session }> {
    const supabase = createAdminClient();
    const rawToken = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.maxAgeMs);

    // Check if this is a new device
    const isNewDevice = await this.checkNewDevice(input.staffId, input.deviceInfo.fingerprint);

    // Register device if new
    if (isNewDevice) {
      await supabase.from('staff_devices').upsert({
        staff_id: input.staffId,
        device_fingerprint: input.deviceInfo.fingerprint,
        device_name: `${input.deviceInfo.browser} on ${input.deviceInfo.os}`,
        browser: input.deviceInfo.browser,
        os: input.deviceInfo.os,
        first_seen_at: now.toISOString(),
        last_seen_at: now.toISOString(),
      }, { onConflict: 'staff_id,device_fingerprint' });
    }

    const { data, error } = await supabase
      .from('staff_sessions')
      .insert({
        staff_id: input.staffId,
        token_hash: tokenHash,
        device_fingerprint: input.deviceInfo.fingerprint,
        browser: input.deviceInfo.browser,
        os: input.deviceInfo.os,
        ip_address: input.deviceInfo.ipAddress,
        geolocation: input.deviceInfo.geolocation || null,
        is_new_device: isNewDevice,
        created_at: now.toISOString(),
        last_activity: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create session: ${error?.message}`);
    }

    const session: Session = this.mapRow(data);
    return { token: rawToken, session };
  }

  /**
   * Validate a session token. Checks existence, invalidation, idle timeout, and max age.
   */
  async validate(token: string): Promise<SessionValidationResult> {
    const supabase = createAdminClient();
    const tokenHash = this.hashToken(token);

    const { data, error } = await supabase
      .from('staff_sessions')
      .select('*')
      .eq('token_hash', tokenHash)
      .single();

    if (error || !data) {
      return { valid: false, session: null, reason: 'not_found' };
    }

    const session = this.mapRow(data);

    // Check if invalidated
    if (session.invalidatedAt) {
      return { valid: false, session: null, reason: 'invalidated' };
    }

    const now = Date.now();
    const lastActivity = new Date(session.lastActivity).getTime();
    const createdAt = new Date(session.createdAt).getTime();

    // Check idle timeout (30 minutes)
    if (now - lastActivity > this.config.idleTimeoutMs) {
      return { valid: false, session: null, reason: 'idle_timeout' };
    }

    // Check max age (8 hours)
    if (now - createdAt > this.config.maxAgeMs) {
      return { valid: false, session: null, reason: 'max_age_exceeded' };
    }

    return { valid: true, session };
  }

  /**
   * Update the last_activity timestamp for a session (touch).
   */
  async refresh(token: string): Promise<void> {
    const supabase = createAdminClient();
    const tokenHash = this.hashToken(token);

    await supabase
      .from('staff_sessions')
      .update({ last_activity: new Date().toISOString() })
      .eq('token_hash', tokenHash)
      .is('invalidated_at', null);
  }

  /**
   * Invalidate a single session.
   */
  async invalidate(sessionId: string): Promise<void> {
    const supabase = createAdminClient();

    await supabase
      .from('staff_sessions')
      .update({ invalidated_at: new Date().toISOString() })
      .eq('id', sessionId);
  }

  /**
   * Invalidate ALL active sessions for a staff member.
   * Used when account is disabled, role is revoked, or password changes.
   */
  async invalidateAll(staffId: string): Promise<void> {
    const supabase = createAdminClient();

    await supabase
      .from('staff_sessions')
      .update({ invalidated_at: new Date().toISOString() })
      .eq('staff_id', staffId)
      .is('invalidated_at', null);
  }

  /**
   * Get all active (non-invalidated, non-expired) sessions for a staff member.
   */
  async getActiveSessions(staffId: string): Promise<Session[]> {
    const supabase = createAdminClient();
    const now = new Date();
    const idleCutoff = new Date(now.getTime() - this.config.idleTimeoutMs);

    const { data, error } = await supabase
      .from('staff_sessions')
      .select('*')
      .eq('staff_id', staffId)
      .is('invalidated_at', null)
      .gt('last_activity', idleCutoff.toISOString())
      .gt('expires_at', now.toISOString())
      .order('last_activity', { ascending: false });

    if (error || !data) return [];
    return data.map(this.mapRow);
  }

  /**
   * Check if a device fingerprint is new (not seen before for this staff member).
   */
  private async checkNewDevice(staffId: string, fingerprint: string): Promise<boolean> {
    const supabase = createAdminClient();

    const { data } = await supabase
      .from('staff_devices')
      .select('id')
      .eq('staff_id', staffId)
      .eq('device_fingerprint', fingerprint)
      .single();

    return !data;
  }

  /**
   * Hash a raw token using SHA-256.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Map a database row to a Session object.
   */
  private mapRow(row: Record<string, unknown>): Session {
    return {
      id: row.id as string,
      staffId: row.staff_id as string,
      tokenHash: row.token_hash as string,
      deviceFingerprint: row.device_fingerprint as string | null,
      browser: row.browser as string | null,
      os: row.os as string | null,
      ipAddress: row.ip_address as string,
      geolocation: row.geolocation as string | null,
      isNewDevice: row.is_new_device as boolean,
      createdAt: row.created_at as string,
      lastActivity: row.last_activity as string,
      expiresAt: row.expires_at as string,
      invalidatedAt: row.invalidated_at as string | null,
    };
  }
}

/** Singleton instance */
export const sessionManager = new SessionManager();
