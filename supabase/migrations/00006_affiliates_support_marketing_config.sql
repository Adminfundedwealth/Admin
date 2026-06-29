-- ============================================================
-- Migration: Affiliates, Support, Marketing, Config, Certificates
-- Admin-owned operational tables only.
-- References Main Site "users" via UUID (no hard FK to avoid coupling).
-- Does NOT alter any Main Site or Terminal table.
-- ============================================================

-- ============================================================
-- Commission Structures
-- ============================================================

CREATE TABLE commission_structures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL 
        CHECK (type IN ('flat_rate', 'percentage', 'tiered', 'recurring')),
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Affiliates
-- ============================================================

CREATE TABLE affiliates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,                       -- References Main Site users.id (soft FK)
    name VARCHAR(200) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    affiliate_code VARCHAR(50) UNIQUE NOT NULL,
    commission_structure_id UUID REFERENCES commission_structures(id),
    total_referrals INTEGER DEFAULT 0,
    total_revenue_generated DECIMAL(15,2) DEFAULT 0,
    commission_earned DECIMAL(15,2) DEFAULT 0,
    commission_paid DECIMAL(15,2) DEFAULT 0,
    commission_pending DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'terminated')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_affiliates_code ON affiliates(affiliate_code);
CREATE INDEX idx_affiliates_email ON affiliates(email);
CREATE INDEX idx_affiliates_status ON affiliates(status);
CREATE INDEX idx_affiliates_user ON affiliates(user_id) WHERE user_id IS NOT NULL;

-- ============================================================
-- Referrals
-- ============================================================

CREATE TABLE referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID NOT NULL REFERENCES affiliates(id),
    referred_user_id UUID NOT NULL,     -- References Main Site users.id (soft FK)
    purchase_id UUID,
    purchase_amount DECIMAL(15,2),
    converted BOOLEAN DEFAULT FALSE,
    converted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_referrals_affiliate ON referrals(affiliate_id, created_at DESC);
CREATE INDEX idx_referrals_user ON referrals(referred_user_id);
CREATE INDEX idx_referrals_converted ON referrals(affiliate_id, converted) WHERE converted = TRUE;

-- ============================================================
-- Commissions
-- ============================================================

CREATE TABLE commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID NOT NULL REFERENCES affiliates(id),
    referral_id UUID REFERENCES referrals(id),
    amount DECIMAL(15,2) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('earned', 'reversal', 'payout')),
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'paid', 'reversed')),
    payout_request_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_commissions_affiliate ON commissions(affiliate_id, status);
CREATE INDEX idx_commissions_status ON commissions(status, created_at DESC);

-- ============================================================
-- Support Tickets
-- ============================================================

CREATE TABLE support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(20) UNIQUE NOT NULL,
    user_id UUID NOT NULL,              -- References Main Site users.id (soft FK)
    subject VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    priority VARCHAR(10) NOT NULL 
        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'escalated', 'resolved', 'closed')),
    assigned_agent_id UUID REFERENCES staff_members(id),
    escalation_reason TEXT,
    escalated_to_team VARCHAR(100),
    sla_breached BOOLEAN DEFAULT FALSE,
    resolution_time_seconds INTEGER,
    satisfaction_rating INTEGER CHECK (satisfaction_rating IS NULL OR satisfaction_rating BETWEEN 1 AND 5),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tickets_status ON support_tickets(status, priority DESC, created_at);
CREATE INDEX idx_tickets_agent ON support_tickets(assigned_agent_id, status);
CREATE INDEX idx_tickets_user ON support_tickets(user_id, created_at DESC);
CREATE INDEX idx_tickets_sla ON support_tickets(sla_breached, status) 
    WHERE sla_breached = TRUE;
CREATE INDEX idx_tickets_number ON support_tickets(ticket_number);

-- Ticket Messages
CREATE TABLE ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('user', 'staff')),
    sender_id UUID NOT NULL,
    message TEXT NOT NULL,
    attachments JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_messages ON ticket_messages(ticket_id, created_at);

-- ============================================================
-- Promotions
-- ============================================================

CREATE TABLE promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    discount_type VARCHAR(10) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value DECIMAL(15,2) NOT NULL,
    applicable_challenge_types TEXT[],
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit BETWEEN 1 AND 1000000),
    usage_count INTEGER DEFAULT 0,
    status VARCHAR(10) DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'expired', 'disabled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_discount CHECK (
        (discount_type = 'percentage' AND discount_value BETWEEN 1 AND 100) OR
        (discount_type = 'fixed' AND discount_value BETWEEN 0.01 AND 999999.99)
    )
);

CREATE INDEX idx_promotions_status ON promotions(status, start_date);
CREATE INDEX idx_promotions_active ON promotions(status, end_date) WHERE status = 'active';

-- ============================================================
-- Coupon Codes
-- ============================================================

CREATE TABLE coupon_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(32) UNIQUE NOT NULL CHECK (char_length(code) >= 4),
    discount_type VARCHAR(10) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value DECIMAL(15,2) NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    usage_limit_per_user INTEGER CHECK (usage_limit_per_user IS NULL OR usage_limit_per_user BETWEEN 1 AND 100),
    total_usage_limit INTEGER CHECK (total_usage_limit IS NULL OR total_usage_limit BETWEEN 1 AND 1000000),
    total_usage_count INTEGER DEFAULT 0,
    min_purchase_amount DECIMAL(15,2) DEFAULT 0 
        CHECK (min_purchase_amount BETWEEN 0 AND 999999.99),
    status VARCHAR(10) DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'disabled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_coupon_discount CHECK (
        (discount_type = 'percentage' AND discount_value BETWEEN 1 AND 100) OR
        (discount_type = 'fixed' AND discount_value BETWEEN 0.01 AND 999999.99)
    )
);

CREATE INDEX idx_coupons_code ON coupon_codes(code);
CREATE INDEX idx_coupons_status ON coupon_codes(status, end_date);

-- ============================================================
-- Announcements
-- ============================================================

CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(150) NOT NULL,
    content TEXT NOT NULL CHECK (char_length(content) <= 5000),
    target_audience VARCHAR(20) NOT NULL
        CHECK (target_audience IN ('all_users', 'active_traders', 'funded_traders', 'affiliates')),
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    priority VARCHAR(10) NOT NULL 
        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    created_by UUID NOT NULL REFERENCES staff_members(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_announcements_active ON announcements(start_date, end_date);

-- ============================================================
-- Configuration Engine (versioned key-value with JSON)
-- ============================================================

CREATE TABLE configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_current BOOLEAN DEFAULT TRUE,
    modified_by UUID REFERENCES staff_members(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category, key, version)
);

CREATE INDEX idx_config_current ON configurations(category, key) WHERE is_current = TRUE;
CREATE INDEX idx_config_history ON configurations(category, key, version DESC);

-- ============================================================
-- Certificates (Admin issues certificates referencing platform data)
-- ============================================================

CREATE TABLE certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_number VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID NOT NULL,              -- References Main Site users.id (soft FK)
    type VARCHAR(20) NOT NULL CHECK (type IN ('challenge_completion', 'funded_trader')),
    challenge_account_id UUID,          -- References Terminal challenge_accounts.id (soft FK)
    funded_account_id UUID,             -- References Terminal funded_accounts.id (soft FK)
    trader_name VARCHAR(200) NOT NULL,
    details JSONB NOT NULL,
    pdf_storage_path TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    revoked_reason TEXT,
    revoked_by UUID REFERENCES staff_members(id),
    revoked_at TIMESTAMPTZ,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_certificates_user ON certificates(user_id, type);
CREATE INDEX idx_certificates_number ON certificates(certificate_number);
CREATE INDEX idx_certificates_type ON certificates(type, generated_at DESC);

-- ============================================================
-- System Health Checks
-- ============================================================

CREATE TABLE system_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(100) NOT NULL,
    status VARCHAR(10) NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
    response_time_ms INTEGER,
    error_message TEXT,
    checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_health_service ON system_health_checks(service_name, checked_at DESC);
CREATE INDEX idx_health_latest ON system_health_checks(checked_at DESC);

-- ============================================================
-- Background Jobs
-- ============================================================

CREATE TABLE background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name VARCHAR(100) NOT NULL,
    payload JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'completed', 'failed', 'permanently_failed')),
    error_message TEXT,
    attempt_number INTEGER DEFAULT 0 CHECK (attempt_number <= 3),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_status ON background_jobs(status, created_at DESC);
CREATE INDEX idx_jobs_failed ON background_jobs(status) WHERE status = 'failed';
CREATE INDEX idx_jobs_name ON background_jobs(job_name, status);

-- ============================================================
-- Data Exports
-- ============================================================

CREATE TABLE data_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff_members(id),
    source_center VARCHAR(50) NOT NULL,
    filters JSONB,
    record_count INTEGER,
    max_records INTEGER DEFAULT 500000,
    format VARCHAR(10) DEFAULT 'csv',
    status VARCHAR(20) DEFAULT 'processing'
        CHECK (status IN ('processing', 'completed', 'failed')),
    file_path TEXT,
    error_message TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_exports_staff ON data_exports(staff_id, created_at DESC);
CREATE INDEX idx_exports_status ON data_exports(status, created_at DESC);
CREATE INDEX idx_exports_expiry ON data_exports(expires_at) WHERE status = 'completed';

-- ============================================================
-- Updated_at triggers for tables that need them
-- ============================================================

CREATE TRIGGER commission_structures_updated_at
    BEFORE UPDATE ON commission_structures FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER affiliates_updated_at
    BEFORE UPDATE ON affiliates FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER support_tickets_updated_at
    BEFORE UPDATE ON support_tickets FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER promotions_updated_at
    BEFORE UPDATE ON promotions FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER coupon_codes_updated_at
    BEFORE UPDATE ON coupon_codes FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER announcements_updated_at
    BEFORE UPDATE ON announcements FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
