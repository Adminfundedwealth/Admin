import type { DeviceInfo } from '@/types/common';

export interface AuditRecord {
  id: string;
  actorId: string;
  actorRole: string;
  action: string;
  timestamp: string;
  targetEntityType: string;
  targetEntityId: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  ipAddress: string;
  deviceInfo: DeviceInfo;
  batchId: string | null;
  metadata: Record<string, unknown> | null;
  missingPermission: string | null;
}

export interface CreateAuditInput {
  actorId: string;
  actorRole: string;
  action: string;
  targetEntityType: string;
  targetEntityId: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  ipAddress: string;
  deviceInfo: DeviceInfo;
  metadata?: Record<string, unknown>;
  missingPermission?: string;
}

export interface AuditQueryFilters {
  actorId?: string;
  action?: string;
  targetEntityType?: string;
  targetEntityId?: string;
  dateFrom?: string;
  dateTo?: string;
  ipAddress?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditQueryResult {
  data: AuditRecord[];
  meta: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}
