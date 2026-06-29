-- ============================================================
-- Migration: Admin-Specific Domain Tables
-- References existing Main Site (users) and Terminal (challenge_accounts,
-- trading_accounts) tables via FK — does NOT create them.
-- ============================================================

-- ============================================================
-- User Internal Notes (staff notes on user profiles)
-- References Main Site "users" table (already exists)
-- ============================================================

CREATE TABLE user_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,  -- FK to Main Site users.id
    author_id UUID NOT NULL REFERENCES staff_members(id),
    category VARCHAR(50) NOT NULL,
    body TEXT NOT NULL CHECK (char_length(body) >= 10 AND char_length(body) <= 5000),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_notes_user ON user_notes(user_id, created_at DESC);
CREATE INDEX idx_user_notes_author ON user_notes(author_id, created_at DESC);

-- ============================================================
-- Challenge Account Timeline (history of admin actions on challenges)
-- References Terminal "challenge_accounts" table (already exists)
-- ============================================================

CREATE TABLE challenge_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_account_id UUID NOT NULL,  -- FK to Terminal challenge_accounts.id
    action VARCHAR(50) NOT NULL,
    actor_id UUID REFERENCES staff_members(id),
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_challenge_timeline ON challenge_timeline(challenge_account_id, created_at DESC);
CREATE INDEX idx_challenge_timeline_actor ON challenge_timeline(actor_id, created_at DESC);
