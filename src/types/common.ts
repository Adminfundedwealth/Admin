/**
 * Common types shared across the application.
 */

/** Standard paginated API response */
export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

/** Standard API response envelope */
export interface ApiResponse<T> {
  data: T;
  meta?: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  error?: ApiError;
}

/** Standard API error */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string>;
  retryAfter?: number;
}

/** Device information extracted from request */
export interface DeviceInfo {
  fingerprint: string;
  browser: string;
  os: string;
  ipAddress: string;
  geolocation?: string;
}

/** Notification priority levels */
export type NotificationPriority = 'critical' | 'high' | 'medium' | 'low';

/** Alert severity levels */
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

/** Date range filter */
export interface DateRange {
  from: Date;
  to: Date;
}

/** Sort direction */
export type SortDirection = 'asc' | 'desc';

/** Sort configuration */
export interface SortConfig {
  field: string;
  direction: SortDirection;
}
