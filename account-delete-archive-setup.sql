-- ============================================================
-- Account Delete / Archive Feature
-- Run once in Supabase SQL editor
-- ============================================================

DO $$
BEGIN

  -- ── account_deletions ────────────────────────────────────────
  -- Permanent record of every delete/archive action.
  -- NEVER dropped or truncated — full audit trail.
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'account_deletions'
  ) THEN
    CREATE TABLE public.account_deletions (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      action                text NOT NULL CHECK (action IN ('archive', 'permanent_delete')),

      -- What was acted on
      challenge_account_id  uuid,
      trading_account_id    uuid,
      account_code          text,
      account_type          text,   -- e.g. "1step_evaluation", "flash_funding"
      account_plan          text,
      initial_balance       bigint,
      user_id               uuid,

      -- Who did it
      actor_id              uuid    NOT NULL,
      actor_email           text    NOT NULL,
      actor_role            text    NOT NULL DEFAULT 'Founder',

      -- Why / confirmation
      deletion_reason       text    NOT NULL,
      confirmation_code     text    NOT NULL,   -- the account_code the founder typed

      -- Validation results at time of deletion
      had_open_positions    boolean NOT NULL DEFAULT false,
      had_pending_orders    boolean NOT NULL DEFAULT false,
      was_funded            boolean NOT NULL DEFAULT false,
      founder_override      boolean NOT NULL DEFAULT false,

      -- Snapshot of the account before action (full JSON)
      challenge_snapshot    jsonb,
      trading_snapshot      jsonb,
      provisioning_snapshot jsonb,

      ip_address            text,
      user_agent            text,
      created_at            timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_ad_challenge ON public.account_deletions (challenge_account_id);
    CREATE INDEX idx_ad_trading   ON public.account_deletions (trading_account_id);
    CREATE INDEX idx_ad_actor     ON public.account_deletions (actor_id);
    CREATE INDEX idx_ad_created   ON public.account_deletions (created_at DESC);

    RAISE NOTICE 'Created account_deletions';
  ELSE
    RAISE NOTICE 'account_deletions already exists';
  END IF;

END
$$;
