-- ============================================================
-- Migration: Row Level Security Policies
-- Task 7: Enable RLS and create permission-based policies
-- Enforces RBAC at the database level via Supabase
-- ============================================================

-- ============================================================
-- Helper function: Check if current user has a specific permission
-- Used by all RLS policies to enforce granular access control
-- ============================================================

CREATE OR REPLACE FUNCTION has_permission(required_permission TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if the current authenticated user has the required permission
    -- through any of their assigned roles
    RETURN EXISTS (
        SELECT 1 
        FROM staff_role_assignments sra
        JOIN role_permissions rp ON rp.role_id = sra.role_id
        WHERE sra.staff_id = auth.uid()
        AND rp.permission = required_permission
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper: Check if user has any of the listed permissions
CREATE OR REPLACE FUNCTION has_any_permission(required_permissions TEXT[])
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM staff_role_assignments sra
        JOIN role_permissions rp ON rp.role_id = sra.role_id
        WHERE sra.staff_id = auth.uid()
        AND rp.permission = ANY(required_permissions)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper: Check if current user is Founder or Co-Founder (full access)
CREATE OR REPLACE FUNCTION is_full_access_role()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM staff_role_assignments sra
        JOIN roles r ON r.id = sra.role_id
        WHERE sra.staff_id = auth.uid()
        AND r.name IN ('Founder', 'Co-Founder')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- Enable RLS on all data tables
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE funded_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE audit_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_status_history ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Users table policies
-- ============================================================

CREATE POLICY "staff_select_users" ON users
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['users.view', 'users.edit', 'users.ban', 'users.delete'])
    );

CREATE POLICY "staff_update_users" ON users
    FOR UPDATE USING (
        is_full_access_role() OR has_any_permission(ARRAY['users.edit', 'users.ban'])
    );

CREATE POLICY "staff_delete_users" ON users
    FOR DELETE USING (
        is_full_access_role() OR has_permission('users.delete')
    );

-- ============================================================
-- Challenge Accounts policies
-- ============================================================

CREATE POLICY "staff_select_challenges" ON challenge_accounts
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['challenges.view', 'challenges.manage'])
    );

CREATE POLICY "staff_update_challenges" ON challenge_accounts
    FOR UPDATE USING (
        is_full_access_role() OR has_permission('challenges.manage')
    );

-- ============================================================
-- Funded Accounts policies
-- ============================================================

CREATE POLICY "staff_select_funded" ON funded_accounts
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['challenges.view', 'challenges.manage'])
    );

CREATE POLICY "staff_update_funded" ON funded_accounts
    FOR UPDATE USING (
        is_full_access_role() OR has_permission('challenges.manage')
    );

-- ============================================================
-- Trades policies
-- ============================================================

CREATE POLICY "staff_select_trades" ON trades
    FOR SELECT USING (
        is_full_access_role() OR has_permission('trades.view')
    );

-- ============================================================
-- Orders policies
-- ============================================================

CREATE POLICY "staff_select_orders" ON orders
    FOR SELECT USING (
        is_full_access_role() OR has_permission('trades.view')
    );

CREATE POLICY "staff_update_orders" ON orders
    FOR UPDATE USING (
        is_full_access_role() OR has_permission('trades.view')
    );

-- ============================================================
-- Payout Requests policies
-- ============================================================

CREATE POLICY "staff_select_payouts" ON payout_requests
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['payouts.view', 'payouts.approve', 'payouts.reject'])
    );

CREATE POLICY "staff_update_payouts" ON payout_requests
    FOR UPDATE USING (
        is_full_access_role() OR has_any_permission(ARRAY['payouts.approve', 'payouts.reject'])
    );

-- ============================================================
-- Payout Status History policies (read-only for staff)
-- ============================================================

CREATE POLICY "staff_select_payout_history" ON payout_status_history
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['payouts.view', 'payouts.approve', 'payouts.reject'])
    );

CREATE POLICY "staff_insert_payout_history" ON payout_status_history
    FOR INSERT WITH CHECK (
        is_full_access_role() OR has_any_permission(ARRAY['payouts.approve', 'payouts.reject'])
    );

-- ============================================================
-- KYC Submissions policies
-- ============================================================

CREATE POLICY "staff_select_kyc" ON kyc_submissions
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['kyc.view', 'kyc.approve', 'kyc.reject'])
    );

CREATE POLICY "staff_update_kyc" ON kyc_submissions
    FOR UPDATE USING (
        is_full_access_role() OR has_any_permission(ARRAY['kyc.approve', 'kyc.reject'])
    );

-- KYC Documents
CREATE POLICY "staff_select_kyc_docs" ON kyc_documents
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['kyc.view', 'kyc.approve', 'kyc.reject'])
    );

-- ============================================================
-- Risk Alerts policies
-- ============================================================

CREATE POLICY "staff_select_risk" ON risk_alerts
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['risk.view', 'risk.manage'])
    );

CREATE POLICY "staff_update_risk" ON risk_alerts
    FOR UPDATE USING (
        is_full_access_role() OR has_permission('risk.manage')
    );

CREATE POLICY "staff_insert_risk" ON risk_alerts
    FOR INSERT WITH CHECK (
        is_full_access_role() OR has_permission('risk.manage')
    );

-- ============================================================
-- Affiliates policies
-- ============================================================

CREATE POLICY "staff_select_affiliates" ON affiliates
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['affiliates.view', 'affiliates.manage'])
    );

CREATE POLICY "staff_update_affiliates" ON affiliates
    FOR UPDATE USING (
        is_full_access_role() OR has_permission('affiliates.manage')
    );

-- Referrals
CREATE POLICY "staff_select_referrals" ON referrals
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['affiliates.view', 'affiliates.manage'])
    );

-- Commissions
CREATE POLICY "staff_select_commissions" ON commissions
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['affiliates.view', 'affiliates.manage'])
    );

CREATE POLICY "staff_update_commissions" ON commissions
    FOR UPDATE USING (
        is_full_access_role() OR has_permission('affiliates.manage')
    );

CREATE POLICY "staff_insert_commissions" ON commissions
    FOR INSERT WITH CHECK (
        is_full_access_role() OR has_permission('affiliates.manage')
    );

-- ============================================================
-- Support Tickets policies
-- ============================================================

CREATE POLICY "staff_select_support" ON support_tickets
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['support.view', 'support.manage'])
    );

CREATE POLICY "staff_update_support" ON support_tickets
    FOR UPDATE USING (
        is_full_access_role() OR has_permission('support.manage')
    );

-- Ticket Messages
CREATE POLICY "staff_select_ticket_messages" ON ticket_messages
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['support.view', 'support.manage'])
    );

CREATE POLICY "staff_insert_ticket_messages" ON ticket_messages
    FOR INSERT WITH CHECK (
        is_full_access_role() OR has_permission('support.manage')
    );

-- ============================================================
-- Marketing policies (promotions, coupons, announcements)
-- ============================================================

CREATE POLICY "staff_select_promotions" ON promotions
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['marketing.view', 'marketing.manage'])
    );

CREATE POLICY "staff_all_promotions" ON promotions
    FOR ALL USING (
        is_full_access_role() OR has_permission('marketing.manage')
    );

CREATE POLICY "staff_select_coupons" ON coupon_codes
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['marketing.view', 'marketing.manage'])
    );

CREATE POLICY "staff_all_coupons" ON coupon_codes
    FOR ALL USING (
        is_full_access_role() OR has_permission('marketing.manage')
    );

CREATE POLICY "staff_select_announcements" ON announcements
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['marketing.view', 'marketing.manage'])
    );

CREATE POLICY "staff_all_announcements" ON announcements
    FOR ALL USING (
        is_full_access_role() OR has_permission('marketing.manage')
    );

-- ============================================================
-- Configuration policies
-- ============================================================

CREATE POLICY "staff_select_config" ON configurations
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['settings.view', 'settings.edit'])
    );

CREATE POLICY "staff_insert_config" ON configurations
    FOR INSERT WITH CHECK (
        is_full_access_role() OR has_permission('settings.edit')
    );

CREATE POLICY "staff_update_config" ON configurations
    FOR UPDATE USING (
        is_full_access_role() OR has_permission('settings.edit')
    );

-- ============================================================
-- Certificates policies
-- ============================================================

CREATE POLICY "staff_select_certificates" ON certificates
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['certificates.view', 'certificates.manage'])
    );

CREATE POLICY "staff_all_certificates" ON certificates
    FOR ALL USING (
        is_full_access_role() OR has_permission('certificates.manage')
    );

-- ============================================================
-- Audit Records policies (SELECT only - immutable table)
-- ============================================================

CREATE POLICY "staff_select_audit" ON audit_records
    FOR SELECT USING (
        is_full_access_role() OR has_permission('audit.view')
    );

-- Allow any authenticated staff to INSERT audit records
-- (needed for audit logging from any operation)
CREATE POLICY "staff_insert_audit" ON audit_records
    FOR INSERT WITH CHECK (TRUE);

-- ============================================================
-- Notifications policies (staff sees only their own)
-- ============================================================

CREATE POLICY "staff_own_notifications" ON notifications
    FOR SELECT USING (
        recipient_id = auth.uid()
    );

CREATE POLICY "staff_update_own_notifications" ON notifications
    FOR UPDATE USING (
        recipient_id = auth.uid()
    );

-- System can insert notifications for any recipient
CREATE POLICY "staff_insert_notifications" ON notifications
    FOR INSERT WITH CHECK (TRUE);

-- ============================================================
-- User Notes policies
-- ============================================================

CREATE POLICY "staff_select_user_notes" ON user_notes
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['users.view', 'users.edit'])
    );

CREATE POLICY "staff_insert_user_notes" ON user_notes
    FOR INSERT WITH CHECK (
        is_full_access_role() OR has_any_permission(ARRAY['users.view', 'users.edit'])
    );

-- ============================================================
-- Challenge Timeline policies
-- ============================================================

CREATE POLICY "staff_select_challenge_timeline" ON challenge_timeline
    FOR SELECT USING (
        is_full_access_role() OR has_any_permission(ARRAY['challenges.view', 'challenges.manage'])
    );

CREATE POLICY "staff_insert_challenge_timeline" ON challenge_timeline
    FOR INSERT WITH CHECK (
        is_full_access_role() OR has_permission('challenges.manage')
    );
