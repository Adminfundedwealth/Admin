-- ============================================================
-- Migration: Audit System
-- Task 3: Database Schema - Audit System
-- Immutable audit records with 7-year retention
-- ============================================================

-- Audit Records (Immutable - no UPDATE/DELETE allowed)
CREATE TABLE audit_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL REFERENCES staff_members(id),
    actor_role VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    target_entity_type VARCHAR(100) NOT NULL,
    target_entity_id VARCHAR(255) NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    ip_address INET NOT NULL,
    device_info JSONB NOT NULL,
    batch_id UUID,
    metadata JSONB,
    missing_permission VARCHAR(100)
) PARTITION BY RANGE (timestamp);

-- Create partitions for the current year and next year
-- Additional partitions should be created via cron or migration
CREATE TABLE audit_records_y2025m01 PARTITION OF audit_records
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE audit_records_y2025m02 PARTITION OF audit_records
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE audit_records_y2025m03 PARTITION OF audit_records
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE audit_records_y2025m04 PARTITION OF audit_records
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE audit_records_y2025m05 PARTITION OF audit_records
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE audit_records_y2025m06 PARTITION OF audit_records
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE audit_records_y2025m07 PARTITION OF audit_records
    FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE audit_records_y2025m08 PARTITION OF audit_records
    FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE audit_records_y2025m09 PARTITION OF audit_records
    FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE audit_records_y2025m10 PARTITION OF audit_records
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE audit_records_y2025m11 PARTITION OF audit_records
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE audit_records_y2025m12 PARTITION OF audit_records
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE TABLE audit_records_y2026m01 PARTITION OF audit_records
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_records_y2026m02 PARTITION OF audit_records
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE audit_records_y2026m03 PARTITION OF audit_records
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_records_y2026m04 PARTITION OF audit_records
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_records_y2026m05 PARTITION OF audit_records
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_records_y2026m06 PARTITION OF audit_records
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_records_y2026m07 PARTITION OF audit_records
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_records_y2026m08 PARTITION OF audit_records
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_records_y2026m09 PARTITION OF audit_records
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE audit_records_y2026m10 PARTITION OF audit_records
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE audit_records_y2026m11 PARTITION OF audit_records
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE audit_records_y2026m12 PARTITION OF audit_records
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Default partition for any records outside defined ranges
CREATE TABLE audit_records_default PARTITION OF audit_records DEFAULT;

-- ============================================================
-- Indexes for audit_records
-- ============================================================

CREATE INDEX idx_audit_actor ON audit_records(actor_id, timestamp DESC);
CREATE INDEX idx_audit_action ON audit_records(action, timestamp DESC);
CREATE INDEX idx_audit_target ON audit_records(target_entity_type, target_entity_id, timestamp DESC);
CREATE INDEX idx_audit_batch ON audit_records(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_audit_timestamp ON audit_records(timestamp DESC);
CREATE INDEX idx_audit_ip ON audit_records(ip_address);

-- ============================================================
-- Immutability enforcement via triggers
-- Prevents any UPDATE or DELETE on audit_records
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit records are immutable and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_immutable_update
    BEFORE UPDATE ON audit_records FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER audit_immutable_delete
    BEFORE DELETE ON audit_records FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

-- ============================================================
-- Notifications table
-- ============================================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
    priority VARCHAR(10) NOT NULL 
        CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    event_source VARCHAR(100) NOT NULL,
    link_to VARCHAR(500),
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_unread ON notifications(recipient_id, read, created_at DESC)
    WHERE read = FALSE;
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, created_at DESC);

-- ============================================================
-- Function to auto-create monthly partitions for audit_records
-- Should be called via cron to create future partitions
-- ============================================================

CREATE OR REPLACE FUNCTION create_audit_partition(partition_date DATE)
RETURNS VOID AS $$
DECLARE
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    start_date := date_trunc('month', partition_date);
    end_date := start_date + INTERVAL '1 month';
    partition_name := 'audit_records_y' || to_char(start_date, 'YYYY') || 'm' || to_char(start_date, 'MM');
    
    -- Check if partition already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF audit_records FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
    END IF;
END;
$$ LANGUAGE plpgsql;
