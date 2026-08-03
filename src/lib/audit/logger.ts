import { createAdminClient } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';
import type { AuditRecord, CreateAuditInput, AuditQueryFilters, AuditQueryResult } from './types';

/**
 * Audit Logger - creates immutable audit records for all state-changing actions.
 * Records are stored with UTC millisecond precision and can never be modified or deleted.
 */
export class AuditLogger {
  /**
   * Log a single audit record.
   */
  async log(input: CreateAuditInput): Promise<AuditRecord> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('audit_records')
      .insert({
        actor_id: input.actorId,
        actor_role: input.actorRole,
        action: input.action,
        timestamp: new Date().toISOString(),
        target_entity_type: input.targetEntityType,
        target_entity_id: input.targetEntityId,
        previous_state: input.previousState || null,
        new_state: input.newState || null,
        ip_address: input.ipAddress,
        device_info: input.deviceInfo,
        metadata: input.metadata || null,
        missing_permission: input.missingPermission || null,
      })
      .select()
      .single();

    if (error || !data) {
      // Audit logging should not crash the application, but we log the error
      console.error('Failed to create audit record:', error?.message);
      throw new Error(`Audit logging failed: ${error?.message}`);
    }

    return this.mapRow(data);
  }

  /**
   * Log multiple audit records as a batch (linked by shared batchId).
   * Used for bulk operations affecting multiple entities.
   */
  async logBatch(inputs: CreateAuditInput[]): Promise<AuditRecord[]> {
    if (inputs.length === 0) return [];

    const supabase = createAdminClient();
    const batchId = randomUUID();
    const timestamp = new Date().toISOString();

    const records = inputs.map((input) => ({
      actor_id: input.actorId,
      actor_role: input.actorRole,
      action: input.action,
      timestamp,
      target_entity_type: input.targetEntityType,
      target_entity_id: input.targetEntityId,
      previous_state: input.previousState || null,
      new_state: input.newState || null,
      ip_address: input.ipAddress,
      device_info: input.deviceInfo,
      batch_id: batchId,
      metadata: input.metadata || null,
      missing_permission: input.missingPermission || null,
    }));

    const { data, error } = await supabase
      .from('audit_records')
      .insert(records)
      .select();

    if (error || !data) {
      console.error('Failed to create batch audit records:', error?.message);
      throw new Error(`Batch audit logging failed: ${error?.message}`);
    }

    return data.map(this.mapRow);
  }

  /**
   * Log a permission-denied attempt.
   */
  async logDenied(input: CreateAuditInput & { missingPermission: string }): Promise<AuditRecord> {
    return this.log({
      ...input,
      action: `denied:${input.action}`,
      missingPermission: input.missingPermission,
    });
  }

  /**
   * Query audit records with filtering, pagination, and reverse chronological order.
   * Maximum 100 records per page.
   */
  async query(filters: AuditQueryFilters): Promise<AuditQueryResult> {
    const supabase = createAdminClient();
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 100, 100);
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('audit_records')
      .select('*', { count: 'exact' });

    // Apply filters
    if (filters.actorId) {
      query = query.eq('actor_id', filters.actorId);
    }
    if (filters.action) {
      query = query.eq('action', filters.action);
    }
    if (filters.targetEntityType) {
      query = query.eq('target_entity_type', filters.targetEntityType);
    }
    if (filters.targetEntityId) {
      query = query.eq('target_entity_id', filters.targetEntityId);
    }
    if (filters.ipAddress) {
      query = query.eq('ip_address', filters.ipAddress);
    }
    if (filters.dateFrom) {
      query = query.gte('timestamp', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte('timestamp', filters.dateTo);
    }

    // Order by timestamp descending (reverse chronological)
    query = query
      .order('timestamp', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Audit query failed: ${error.message}`);
    }

    const totalCount = count || 0;

    return {
      data: (data || []).map(this.mapRow),
      meta: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    };
  }

  /**
   * Map a database row to an AuditRecord.
   */
  private mapRow(row: Record<string, unknown>): AuditRecord {
    return {
      id: row.id as string,
      actorId: row.actor_id as string,
      actorRole: row.actor_role as string,
      action: row.action as string,
      timestamp: row.timestamp as string,
      targetEntityType: row.target_entity_type as string,
      targetEntityId: row.target_entity_id as string,
      previousState: row.previous_state as Record<string, unknown> | null,
      newState: row.new_state as Record<string, unknown> | null,
      ipAddress: row.ip_address as string,
      deviceInfo: row.device_info as any,
      batchId: row.batch_id as string | null,
      metadata: row.metadata as Record<string, unknown> | null,
      missingPermission: row.missing_permission as string | null,
    };
  }
}

/** Singleton instance */
export const auditLogger = new AuditLogger();
