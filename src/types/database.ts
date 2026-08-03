/**
 * Database types for FundedWealth Admin OS.
 *
 * REAL SHARED MODEL:
 * ─────────────────────────────────────────────────────────────────────
 * MAIN SITE OWNS / WRITES:
 *   - public.users
 *   - public.orders
 *   - public.manual_payments
 *   - provisioning trigger creation via provisioning_logs
 *
 * TERMINAL OWNS:
 *   - challenge_accounts (lifecycle: active → passed/failed)
 *   - trading_accounts (provisioned from orders)
 *   - terminal_sessions
 *   - provisioning_logs processing / account lifecycle
 *
 * CUSTOMER JOURNEY:
 *   users → orders → provisioning_logs → challenge_accounts / trading_accounts
 *
 * ADMIN-ONLY TABLES:
 *   - staff_members, staff_sessions, staff_devices, login_history
 *   - roles, role_permissions, staff_role_assignments
 *   - audit_records, notifications, user_notes
 *
 * NOT VERIFIED TO EXIST (admin handles gracefully):
 *   - funded_accounts (may be a status progression within challenge_accounts)
 *   - payout_requests (out of scope for Phase 1 commerce realignment)
 *   - support_tickets / support_messages (out of scope for Phase 1)
 *   - risk_alerts (out of scope for Phase 1)
 * ─────────────────────────────────────────────────────────────────────
 *
 * These will be replaced by Supabase generated types once validated.
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

/**
 * Challenge account — evaluation phase accounts.
 * TERMINAL OWNS THIS TABLE.
 * Created via provisioning_logs processing after a paid order.
 * Lifecycle: active → passed/failed/expired (terminal manages transitions).
 */
export interface ChallengeAccount {
  id: string;
  user_id: string;
  order_id: string | null;
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

/**
 * Funded account — NOT VERIFIED TO EXIST in shared database.
 * May represent a status progression within challenge_accounts (status = 'passed').
 * Admin code handles graceful fallback if this table does not exist.
 * If it exists, it represents accounts that have completed evaluation and are live-funded.
 */
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

/**
 * Commercial order from the main site checkout (shared `public.orders` table).
 * MAIN SITE OWNS THIS TABLE.
 * This IS the payment/commercial record in Phase 1 (no separate payments table).
 * NOT a trading execution order.
 */
export interface CommercialOrder {
  id: string;
  user_id: string;
  plan: string | null;
  account_size: number | null;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  payment_method: string | null;
  payment_id: string | null;
  utr_reference: string | null;
  discount_code: string | null;
  discount_amount: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Bank transfer supplement (shared `public.manual_payments` table).
 * MAIN SITE OWNS THIS TABLE.
 * Linked to an order via manual_payments.order_id → orders.id.
 */
export interface ManualPayment {
  id: string;
  order_id: string;
  user_id: string;
  amount: number;
  utr_reference: string | null;
  status: string;
  verified_at: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Trading account provisioned from a commercial order.
 * TERMINAL OWNS THIS TABLE.
 * Created via provisioning_logs processing.
 * Linked back to the originating order via trading_accounts.order_id → orders.id.
 */
export interface TradingAccount {
  id: string;
  user_id: string;
  order_id: string | null;
  login: string | null;
  plan: string | null;
  status: string;
  balance: number;
  phase: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Provisioning log — the bridge between commerce (orders) and terminal (accounts).
 * MAIN SITE creates the initial record (trigger after order payment).
 * TERMINAL processes it and creates the challenge_account / trading_account.
 *
 * Flow: order paid → provisioning_log created → terminal picks up →
 *       terminal creates account → updates provisioning_log with account IDs.
 */
export interface ProvisioningLog {
  id: string;
  order_id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  trading_account_id: string | null;
  challenge_account_id: string | null;
  error_message: string | null;
  retry_count: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Support ticket linked to a user and optionally to an account/order.
 */
export interface SupportTicket {
  id: string;
  ticket_number: string;
  user_id: string;
  subject: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'waiting_customer' | 'escalated' | 'resolved' | 'closed';
  assigned_agent_id: string | null;
  related_account_id: string | null;
  related_order_id: string | null;
  sla_breached: boolean;
  sla_deadline: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Individual message within a support ticket conversation.
 */
export interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_type: 'customer' | 'agent' | 'system';
  sender_id: string;
  sender_name: string;
  body: string;
  attachments: string[];
  is_internal_note: boolean;
  created_at: string;
}

/**
 * KYC submission record for document review.
 */
export interface KYCSubmission {
  id: string;
  user_id: string;
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'resubmit_requested';
  document_type: string | null;
  document_front_url: string | null;
  document_back_url: string | null;
  selfie_url: string | null;
  submission_count: number;
  reviewer_id: string | null;
  rejection_reason: string | null;
  rejection_details: string | null;
  overdue: boolean;
  reviewed_at: string | null;
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

// ─────────────────────────────────────────────────────────────────────────────
// CERTIFICATE ENGINE TYPES
// Certificates are generated by the backend Certificate Engine.
// Admin only reads / triggers via API — never generates locally.
// ─────────────────────────────────────────────────────────────────────────────

export type CertificateStatus =
  | 'pending'
  | 'generated'
  | 'downloaded'
  | 'verified'
  | 'failed';

export interface Certificate {
  id: string;
  /** UUID of the trader in public.users */
  user_id: string;
  /** Related payout request ID (nullable — can be issued independently) */
  payout_id: string | null;
  /** Related funded account or challenge account ID */
  account_id: string | null;
  /** Friendly certificate serial, e.g. FW-CERT-2026-0001 */
  certificate_number: string | null;
  /** Type of certificate: profit_certificate | funded_trader | phase_completion */
  certificate_type: 'profit_certificate' | 'funded_trader' | 'phase_completion';
  status: CertificateStatus;
  /** Amount featured on the certificate (INR) */
  amount: number | null;
  /** Signed download URL from the backend CDN */
  download_url: string | null;
  /** Publicly shareable verification URL */
  verification_url: string | null;
  /** Preview thumbnail URL */
  preview_url: string | null;
  /** Backend error message when status = failed */
  failure_reason: string | null;
  /** ISO timestamp when the certificate PDF was generated */
  generated_at: string | null;
  /** ISO timestamp when the trader first downloaded the certificate */
  downloaded_at: string | null;
  /** ISO timestamp of last email delivery */
  email_sent_at: string | null;
  /** ISO timestamp of last verification check */
  verified_at: string | null;
  /** Staff member who triggered generation / last action */
  issued_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Response shape from GET /api/certificates (list) */
export interface CertificateListResponse {
  data: Certificate[];
  meta: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  analytics: CertificateAnalytics;
}

export interface CertificateAnalytics {
  total: number;
  pending: number;
  generated: number;
  downloaded: number;
  verified: number;
  failed: number;
}

/** Body for POST /api/certificates/generate (proxied to backend engine) */
export interface GenerateCertificatePayload {
  user_id: string;
  payout_id?: string;
  account_id?: string;
  certificate_type: Certificate['certificate_type'];
  amount?: number;
}
