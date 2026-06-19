-- ============================================================
-- Migration: Authentication and Authorization Tables
-- Task 2: Database Schema - Authentication and Authorization
-- ============================================================

-- Staff Members
CREATE TABLE staff_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    password_hash TEXT NOT NULL,
    totp_secret TEXT,
    totp_enabled BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'locked')),
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    force_password_change BOOLEAN DEFAULT FALSE,
    temp_password_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Roles
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL CHECK (char_length(name) >= 3),
    description TEXT,
    is_system_role BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Role Permissions
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, permission)
);

-- Staff Role Assignments
CREATE TABLE staff_role_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL REFERENCES staff_members(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(staff_id, role_id)
);

-- Sessions
CREATE TABLE staff_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    device_fingerprint VARCHAR(255),
    browser VARCHAR(100),
    os VARCHAR(100),
    ip_address INET NOT NULL,
    geolocation VARCHAR(255),
    is_new_device BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    invalidated_at TIMESTAMPTZ
);

-- Login History
CREATE TABLE login_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff_members(id),
    ip_address INET NOT NULL,
    device_fingerprint VARCHAR(255),
    browser VARCHAR(100),
    os VARCHAR(100),
    geolocation VARCHAR(255),
    success BOOLEAN NOT NULL,
    failure_reason VARCHAR(100),
    is_new_device BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Known Devices
CREATE TABLE staff_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(255) NOT NULL,
    device_name VARCHAR(100),
    browser VARCHAR(100),
    os VARCHAR(100),
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(staff_id, device_fingerprint)
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_staff_sessions_staff_id ON staff_sessions(staff_id);
CREATE INDEX idx_staff_sessions_token ON staff_sessions(token_hash);
CREATE INDEX idx_staff_sessions_active ON staff_sessions(staff_id, invalidated_at) 
    WHERE invalidated_at IS NULL;
CREATE INDEX idx_login_history_staff_id ON login_history(staff_id, created_at DESC);
CREATE INDEX idx_login_history_retention ON login_history(created_at);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_staff_role_assignments_staff ON staff_role_assignments(staff_id);
CREATE INDEX idx_staff_role_assignments_role ON staff_role_assignments(role_id);

-- ============================================================
-- Updated_at trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER staff_members_updated_at
    BEFORE UPDATE ON staff_members FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER roles_updated_at
    BEFORE UPDATE ON roles FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
