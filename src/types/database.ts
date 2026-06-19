/**
 * Database types for FundedWealth Admin OS.
 * These will be replaced by Supabase generated types once the database is set up.
 * Run: npx supabase gen types typescript --project-id your-project-id > src/types/database.ts
 */

export interface StaffMember {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  totp_secret: string | null;
  totp_enabled: boolean;
  status: 'active' | 'disabled' | 'locked';
  failed_login_attempts: number;
  locked_until: string | null;
  force_password_change: boolean;
  temp_password_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  created_at: string;
  updated_at: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission: string;
  created_at: string;
}

export interface StaffRoleAssignment {
  id: string;
  staff_id: string;
  role_id: string;
  assigned_by: string;
  assigned_at: string;
}

export interface StaffSession {
  id: string;
  staff_id: string;
  token_hash: string;
  device_fingerprint: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string;
  geolocation: string | null;
  is_new_device: boolean;
  created_at: string;
  last_activity: string;
  expires_at: string;
  invalidated_at: string | null;
}

export interface LoginHistory {
  id: string;
  staff_id: string;
  ip_address: string;
  device_fingerprint: string | null;
  browser: string | null;
  os: string | null;
  geolocation: string | null;
  success: boolean;
  failure_reason: string | null;
  is_new_device: boolean;
  created_at: string;
}

export interface AuditRecord {
  id: string;
  actor_id: string;
  actor_role: string;
  action: string;
  timestamp: string;
  target_entity_type: string;
  target_entity_id: string;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  ip_address: string;
  device_info: Record<string, unknown>;
  batch_id: string | null;
  metadata: Record<string, unknown> | null;
  missing_permission: string | null;
}

export interface User {
  id: string;
  email: string;
  username: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  country: string | null;
  kyc_status: 'pending' | 'submitted' | 'verified' | 'rejected';
  account_status: 'active' | 'suspended' | 'banned' | 'deactivated';
  ban_reason: string | null;
  referred_by: string | null;
  last_login_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChallengeAccount {
  id: string;
  user_id: string;
  account_number: string;
  challenge_type: string;
  phase: number;
  status: 'active' | 'passed' | 'failed' | 'expired' | 'archived';
  initial_balance: number;
  current_balance: number;
  profit_target_pct: number;
  daily_drawdown_limit_pct: number;
  max_drawdown_limit_pct: number;
  min_trading_days: number;
  max_trading_days: number | null;
  trading_days_completed: number;
  profit_pct: number;
  max_daily_drawdown_pct: number;
  max_drawdown_pct: number;
  started_at: string;
  completed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FundedAccount {
  id: string;
  user_id: string;
  account_number: string;
  challenge_account_id: string | null;
  account_size: number;
  current_equity: number;
  profit_loss: number;
  profit_split_pct: number;
  daily_drawdown_limit_pct: number;
  max_drawdown_limit_pct: number;
  daily_drawdown_used_pct: number;
  max_drawdown_used_pct: number;
  violation_count: number;
  payout_eligible: boolean;
  ineligibility_reason: string | null;
  status: 'active' | 'suspended' | 'breached' | 'closed';
  funded_at: string;
  created_at: string;
  updated_at: string;
}

export interface Trade {
  id: string;
  account_id: string;
  account_type: 'challenge' | 'funded';
  symbol: string;
  direction: 'buy' | 'sell';
  lot_size: number;
  entry_price: number;
  exit_price: number | null;
  profit_loss: number | null;
  commission: number;
  swap: number;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface PayoutRequest {
  id: string;
  user_id: string;
  funded_account_id: string;
  requested_amount: number;
  profit_share_pct: number;
  calculated_payout: number;
  account_pnl_since_last_payout: number | null;
  status: 'request_received' | 'under_review' | 'approved' | 'payment_processing' | 'payment_completed' | 'payment_failed';
  eligibility_status: string;
  eligibility_reason: string | null;
  payment_method: string | null;
  transaction_reference: string | null;
  rejection_reason: string | null;
  failure_reason: string | null;
  reviewer_id: string | null;
  approver_id: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RiskAlert {
  id: string;
  account_id: string;
  account_type: string;
  user_id: string;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  original_severity: string | null;
  breach_type: string | null;
  breach_amount: number | null;
  threshold_violated: number | null;
  status: 'open' | 'acknowledged' | 'resolved' | 'escalated';
  acknowledged_by: string | null;
  resolved_by: string | null;
  resolution_outcome: string | null;
  action_taken: string | null;
  escalated_at: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
}
