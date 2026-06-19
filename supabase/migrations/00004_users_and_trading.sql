-- ============================================================
-- Migration: User and Trading Domain
-- Task 4: Users, Challenge Accounts, Funded Accounts, Trades, Orders
-- ============================================================

-- Users (Traders on the platform)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100),
    phone VARCHAR(50),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    country VARCHAR(100),
    kyc_status VARCHAR(20) DEFAULT 'pending' 
        CHECK (kyc_status IN ('pending', 'submitted', 'verified', 'rejected')),
    account_status VARCHAR(20) DEFAULT 'active'
        CHECK (account_status IN ('active', 'suspended', 'banned', 'deactivated')),
    ban_reason TEXT,
    referred_by UUID,
    last_login_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full-text search vector for global search (Ctrl+K)
ALTER TABLE users ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        to_tsvector('english',
            coalesce(email, '') || ' ' ||
            coalesce(username, '') || ' ' ||
            coalesce(first_name, '') || ' ' ||
            coalesce(last_name, '') || ' ' ||
            coalesce(phone, '')
        )
    ) STORED;

CREATE INDEX idx_users_search ON users USING GIN(search_vector);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL;
CREATE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_users_status ON users(account_status);
CREATE INDEX idx_users_kyc_status ON users(kyc_status);
CREATE INDEX idx_users_country ON users(country) WHERE country IS NOT NULL;
CREATE INDEX idx_users_created ON users(created_at DESC);

-- ============================================================
-- Challenge Accounts
-- ============================================================

CREATE TABLE challenge_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    account_number VARCHAR(50) UNIQUE NOT NULL,
    challenge_type VARCHAR(50) NOT NULL,
    phase INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'passed', 'failed', 'expired', 'archived')),
    initial_balance DECIMAL(15,2) NOT NULL,
    current_balance DECIMAL(15,2) NOT NULL,
    profit_target_pct DECIMAL(5,2) NOT NULL,
    daily_drawdown_limit_pct DECIMAL(5,2) NOT NULL,
    max_drawdown_limit_pct DECIMAL(5,2) NOT NULL,
    min_trading_days INTEGER NOT NULL,
    max_trading_days INTEGER,
    trading_days_completed INTEGER DEFAULT 0,
    profit_pct DECIMAL(8,4) DEFAULT 0,
    max_daily_drawdown_pct DECIMAL(8,4) DEFAULT 0,
    max_drawdown_pct DECIMAL(8,4) DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_challenge_user ON challenge_accounts(user_id, created_at DESC);
CREATE INDEX idx_challenge_status ON challenge_accounts(status, created_at DESC);
CREATE INDEX idx_challenge_type ON challenge_accounts(challenge_type, status);
CREATE INDEX idx_challenge_account_number ON challenge_accounts(account_number);

-- ============================================================
-- Funded Accounts
-- ============================================================

CREATE TABLE funded_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    account_number VARCHAR(50) UNIQUE NOT NULL,
    challenge_account_id UUID REFERENCES challenge_accounts(id),
    account_size DECIMAL(15,2) NOT NULL,
    current_equity DECIMAL(15,2) NOT NULL,
    profit_loss DECIMAL(15,2) DEFAULT 0,
    profit_split_pct DECIMAL(5,2) NOT NULL DEFAULT 80.00,
    daily_drawdown_limit_pct DECIMAL(5,2) NOT NULL,
    max_drawdown_limit_pct DECIMAL(5,2) NOT NULL,
    daily_drawdown_used_pct DECIMAL(8,4) DEFAULT 0,
    max_drawdown_used_pct DECIMAL(8,4) DEFAULT 0,
    violation_count INTEGER DEFAULT 0,
    payout_eligible BOOLEAN DEFAULT FALSE,
    ineligibility_reason TEXT,
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'breached', 'closed')),
    funded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_funded_user ON funded_accounts(user_id, created_at DESC);
CREATE INDEX idx_funded_status ON funded_accounts(status);
CREATE INDEX idx_funded_account_number ON funded_accounts(account_number);
CREATE INDEX idx_funded_eligible ON funded_accounts(payout_eligible, status) 
    WHERE payout_eligible = TRUE;

-- ============================================================
-- Trades
-- ============================================================

CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,
    account_type VARCHAR(10) NOT NULL CHECK (account_type IN ('challenge', 'funded')),
    user_id UUID NOT NULL REFERENCES users(id),
    symbol VARCHAR(20) NOT NULL,
    direction VARCHAR(5) NOT NULL CHECK (direction IN ('buy', 'sell')),
    lot_size DECIMAL(10,4) NOT NULL,
    entry_price DECIMAL(15,5) NOT NULL,
    exit_price DECIMAL(15,5),
    profit_loss DECIMAL(15,2),
    commission DECIMAL(10,2) DEFAULT 0,
    swap DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(10) DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opened_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trades_account ON trades(account_id, account_type, opened_at DESC);
CREATE INDEX idx_trades_user ON trades(user_id, opened_at DESC);
CREATE INDEX idx_trades_symbol ON trades(symbol, opened_at DESC);
CREATE INDEX idx_trades_status ON trades(status, opened_at DESC);
CREATE INDEX idx_trades_closed_at ON trades(closed_at DESC) WHERE closed_at IS NOT NULL;
CREATE INDEX idx_trades_direction ON trades(direction, symbol);
CREATE INDEX idx_trades_pnl ON trades(profit_loss) WHERE profit_loss IS NOT NULL;

-- ============================================================
-- Orders
-- ============================================================

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,
    account_type VARCHAR(10) NOT NULL CHECK (account_type IN ('challenge', 'funded')),
    user_id UUID NOT NULL REFERENCES users(id),
    symbol VARCHAR(20) NOT NULL,
    order_type VARCHAR(20) NOT NULL 
        CHECK (order_type IN ('market', 'limit', 'stop', 'stop_limit')),
    direction VARCHAR(5) NOT NULL CHECK (direction IN ('buy', 'sell')),
    volume DECIMAL(10,4) NOT NULL,
    price DECIMAL(15,5),
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'filled', 'cancelled', 'rejected')),
    rejection_reason TEXT,
    acknowledged BOOLEAN DEFAULT FALSE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executed_at TIMESTAMPTZ,
    fill_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_status ON orders(status, submitted_at DESC);
CREATE INDEX idx_orders_account ON orders(account_id, submitted_at DESC);
CREATE INDEX idx_orders_user ON orders(user_id, submitted_at DESC);
CREATE INDEX idx_orders_symbol ON orders(symbol, submitted_at DESC);
CREATE INDEX idx_orders_rejected ON orders(status, acknowledged) 
    WHERE status = 'rejected' AND acknowledged = FALSE;

-- ============================================================
-- User Internal Notes (staff notes on user profiles)
-- ============================================================

CREATE TABLE user_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES staff_members(id),
    category VARCHAR(50) NOT NULL,
    body TEXT NOT NULL CHECK (char_length(body) >= 10 AND char_length(body) <= 5000),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_notes_user ON user_notes(user_id, created_at DESC);

-- ============================================================
-- Challenge Account Timeline (history of all actions)
-- ============================================================

CREATE TABLE challenge_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_account_id UUID NOT NULL REFERENCES challenge_accounts(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    actor_id UUID REFERENCES staff_members(id),
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_challenge_timeline ON challenge_timeline(challenge_account_id, created_at DESC);

-- ============================================================
-- Updated_at triggers for new tables
-- ============================================================

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER challenge_accounts_updated_at
    BEFORE UPDATE ON challenge_accounts FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER funded_accounts_updated_at
    BEFORE UPDATE ON funded_accounts FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
