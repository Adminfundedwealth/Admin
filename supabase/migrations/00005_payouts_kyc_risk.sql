-- ============================================================
-- Migration: Admin Payouts, KYC Review, and Risk Management
-- These are Admin-owned operational tables.
-- References Main Site "users" and Terminal "funded_accounts" 
-- via UUID columns (no hard FK to avoid cross-service coupling).
-- ============================================================

-- ============================================================
-- Payout Requests (Admin tracks payout workflow)
-- ============================================================

CREATE TABLE payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,              -- References Main Site users.id
    funded_account_id UUID NOT NULL,    -- References Terminal funded_accounts.id
    requested_amount DECIMAL(15,2) NOT NULL 
        CHECK (requested_amount BETWEEN 0.01 AND 999999999.99),
    profit_share_pct DECIMAL(5,2) NOT NULL,
    calculated_payout DECIMAL(15,2) NOT NULL,
    account_pnl_since_last_payout DECIMAL(15,2),
    status VARCHAR(30) NOT NULL DEFAULT 'request_received'
        CHECK (status IN ('request_received', 'under_review', 'approved', 
                          'payment_processing', 'payment_completed', 'payment_failed')),
    eligibility_status VARCHAR(20) NOT NULL,
    eligibility_reason TEXT,
    payment_method VARCHAR(50),
    transaction_reference VARCHAR(255),
    rejection_reason TEXT,
    failure_reason TEXT,
    reviewer_id UUID REFERENCES staff_members(id),
    approver_id UUID REFERENCES staff_members(id),
    reviewed_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payouts_status ON payout_requests(status, created_at DESC);
CREATE INDEX idx_payouts_user ON payout_requests(user_id, created_at DESC);
CREATE INDEX idx_payouts_funded_account ON payout_requests(funded_account_id, created_at DESC);
CREATE INDEX idx_payouts_reviewer ON payout_requests(reviewer_id) WHERE reviewer_id IS NOT NULL;
CREATE INDEX idx_payouts_pending ON payout_requests(status, created_at)
    WHERE status IN ('request_received', 'under_review');

-- Payout Status History (append-only - tracks all transitions)
CREATE TABLE payout_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id UUID NOT NULL REFERENCES payout_requests(id),
    previous_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    changed_by UUID NOT NULL REFERENCES staff_members(id),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payout_history_payout ON payout_status_history(payout_id, created_at DESC);

-- Prevent modification of payout history (append-only)
CREATE OR REPLACE FUNCTION prevent_payout_history_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Payout status history records are append-only and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payout_history_immutable_update
    BEFORE UPDATE ON payout_status_history FOR EACH ROW
    EXECUTE FUNCTION prevent_payout_history_modification();

CREATE TRIGGER payout_history_immutable_delete
    BEFORE DELETE ON payout_status_history FOR EACH ROW
    EXECUTE FUNCTION prevent_payout_history_modification();

-- ============================================================
-- KYC Submissions (Admin reviews KYC)
-- ============================================================

CREATE TABLE kyc_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,              -- References Main Site users.id
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_review', 'approved', 'rejected', 'resubmit_requested')),
    submission_count INTEGER DEFAULT 1 CHECK (submission_count BETWEEN 1 AND 3),
    reviewer_id UUID REFERENCES staff_members(id),
    review_started_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    rejection_reasons TEXT[],
    resubmit_instructions TEXT,
    escalated BOOLEAN DEFAULT FALSE,
    overdue BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kyc_status ON kyc_submissions(status, created_at DESC);
CREATE INDEX idx_kyc_user ON kyc_submissions(user_id, created_at DESC);
CREATE INDEX idx_kyc_reviewer ON kyc_submissions(reviewer_id) WHERE reviewer_id IS NOT NULL;
CREATE INDEX idx_kyc_overdue ON kyc_submissions(overdue, status) WHERE overdue = TRUE;
CREATE INDEX idx_kyc_pending ON kyc_submissions(status, created_at)
    WHERE status = 'pending';

-- KYC Documents
CREATE TABLE kyc_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES kyc_submissions(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL
        CHECK (document_type IN ('government_id_front', 'government_id_back', 
                                  'proof_of_address', 'selfie_with_id', 'additional')),
    storage_path TEXT NOT NULL,
    file_name VARCHAR(255),
    file_size INTEGER,
    mime_type VARCHAR(100),
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kyc_documents_submission ON kyc_documents(submission_id);

-- ============================================================
-- Risk Alerts (Admin monitors risk events)
-- ============================================================

CREATE TABLE risk_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,           -- References Terminal challenge/funded account
    account_type VARCHAR(10) NOT NULL CHECK (account_type IN ('challenge', 'funded')),
    user_id UUID NOT NULL,              -- References Main Site users.id
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(10) NOT NULL 
        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    original_severity VARCHAR(10)
        CHECK (original_severity IN ('low', 'medium', 'high', 'critical')),
    breach_type VARCHAR(50),
    breach_amount DECIMAL(15,2),
    threshold_violated DECIMAL(15,2),
    description TEXT,
    recommended_action TEXT,
    status VARCHAR(20) DEFAULT 'open'
        CHECK (status IN ('open', 'acknowledged', 'resolved', 'escalated')),
    acknowledged_by UUID REFERENCES staff_members(id),
    resolved_by UUID REFERENCES staff_members(id),
    resolution_outcome VARCHAR(50)
        CHECK (resolution_outcome IS NULL OR resolution_outcome IN (
            'account_suspended', 'rule_adjusted', 'false_positive', 'escalated'
        )),
    action_taken TEXT,
    escalated_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_risk_severity ON risk_alerts(severity DESC, status, created_at DESC);
CREATE INDEX idx_risk_status ON risk_alerts(status, created_at DESC);
CREATE INDEX idx_risk_account ON risk_alerts(account_id, account_type);
CREATE INDEX idx_risk_user ON risk_alerts(user_id, created_at DESC);
CREATE INDEX idx_risk_open_unacked ON risk_alerts(status, created_at) 
    WHERE status = 'open';
CREATE INDEX idx_risk_escalation ON risk_alerts(status, created_at)
    WHERE status = 'open' AND acknowledged_at IS NULL;
CREATE INDEX idx_risk_type ON risk_alerts(alert_type, severity DESC);

-- ============================================================
-- Updated_at triggers
-- ============================================================

CREATE TRIGGER payout_requests_updated_at
    BEFORE UPDATE ON payout_requests FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER kyc_submissions_updated_at
    BEFORE UPDATE ON kyc_submissions FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
