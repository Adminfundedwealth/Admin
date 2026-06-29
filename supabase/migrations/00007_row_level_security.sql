-- ============================================================
-- Migration: Row Level Security Policies
-- ONLY applies RLS to Admin-owned tables.
-- Does NOT touch Main Site or Terminal tables.
-- Admin API uses service_role key (bypasses RLS), but RLS is
-- enabled as defense-in-depth for anon/authenticated access.
-- ============================================================

-- ============================================================
-- Helper function: Check staff permission via session token
-- Admin does NOT use Supabase Auth (auth.uid()). Instead,
-- these policies protect against direct anon/authenticated access.
-- Admin API routes use service_role key which bypasses RLS.
-- ============================================================

-- ============================================================
-- Enable RLS on Admin-owned tables ONLY
-- ============================================================

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_exports ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Default deny policy for all Admin tables
-- Only service_role (used by Admin API) can access these tables.
-- No anon or authenticated Supabase user should read Admin data.
-- ============================================================

-- Staff Members
CREATE POLICY "deny_anon_staff_members" ON staff_members
    FOR ALL USING (FALSE);

-- Roles
CREATE POLICY "deny_anon_roles" ON roles
    FOR ALL USING (FALSE);

-- Role Permissions
CREATE POLICY "deny_anon_role_permissions" ON role_permissions
    FOR ALL USING (FALSE);

-- Staff Role Assignments
CREATE POLICY "deny_anon_staff_role_assignments" ON staff_role_assignments
    FOR ALL USING (FALSE);

-- Staff Sessions
CREATE POLICY "deny_anon_staff_sessions" ON staff_sessions
    FOR ALL USING (FALSE);

-- Login History
CREATE POLICY "deny_anon_login_history" ON login_history
    FOR ALL USING (FALSE);

-- Staff Devices
CREATE POLICY "deny_anon_staff_devices" ON staff_devices
    FOR ALL USING (FALSE);

-- Audit Records
CREATE POLICY "deny_anon_audit_records" ON audit_records
    FOR ALL USING (FALSE);

-- Notifications
CREATE POLICY "deny_anon_notifications" ON notifications
    FOR ALL USING (FALSE);

-- User Notes
CREATE POLICY "deny_anon_user_notes" ON user_notes
    FOR ALL USING (FALSE);

-- Challenge Timeline
CREATE POLICY "deny_anon_challenge_timeline" ON challenge_timeline
    FOR ALL USING (FALSE);

-- Payout Requests
CREATE POLICY "deny_anon_payout_requests" ON payout_requests
    FOR ALL USING (FALSE);

-- Payout Status History
CREATE POLICY "deny_anon_payout_status_history" ON payout_status_history
    FOR ALL USING (FALSE);

-- KYC Submissions
CREATE POLICY "deny_anon_kyc_submissions" ON kyc_submissions
    FOR ALL USING (FALSE);

-- KYC Documents
CREATE POLICY "deny_anon_kyc_documents" ON kyc_documents
    FOR ALL USING (FALSE);

-- Risk Alerts
CREATE POLICY "deny_anon_risk_alerts" ON risk_alerts
    FOR ALL USING (FALSE);

-- Affiliates
CREATE POLICY "deny_anon_affiliates" ON affiliates
    FOR ALL USING (FALSE);

-- Referrals
CREATE POLICY "deny_anon_referrals" ON referrals
    FOR ALL USING (FALSE);

-- Commissions
CREATE POLICY "deny_anon_commissions" ON commissions
    FOR ALL USING (FALSE);

-- Support Tickets
CREATE POLICY "deny_anon_support_tickets" ON support_tickets
    FOR ALL USING (FALSE);

-- Ticket Messages
CREATE POLICY "deny_anon_ticket_messages" ON ticket_messages
    FOR ALL USING (FALSE);

-- Promotions
CREATE POLICY "deny_anon_promotions" ON promotions
    FOR ALL USING (FALSE);

-- Coupon Codes
CREATE POLICY "deny_anon_coupon_codes" ON coupon_codes
    FOR ALL USING (FALSE);

-- Announcements
CREATE POLICY "deny_anon_announcements" ON announcements
    FOR ALL USING (FALSE);

-- Configurations
CREATE POLICY "deny_anon_configurations" ON configurations
    FOR ALL USING (FALSE);

-- Certificates
CREATE POLICY "deny_anon_certificates" ON certificates
    FOR ALL USING (FALSE);

-- Commission Structures
CREATE POLICY "deny_anon_commission_structures" ON commission_structures
    FOR ALL USING (FALSE);

-- System Health Checks
CREATE POLICY "deny_anon_system_health_checks" ON system_health_checks
    FOR ALL USING (FALSE);

-- Background Jobs
CREATE POLICY "deny_anon_background_jobs" ON background_jobs
    FOR ALL USING (FALSE);

-- Data Exports
CREATE POLICY "deny_anon_data_exports" ON data_exports
    FOR ALL USING (FALSE);
