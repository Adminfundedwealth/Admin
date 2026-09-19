-- ============================================================
-- Migration: Discount Config Table
-- Stores per-plan promo code and discount percentage for the
-- Discount Code Manager (admin.fundedwealth.com/founder/discount-config).
-- The main FundedWealth website reads this table directly to apply
-- active discounts at checkout.
--
-- Safe to run multiple times (idempotent via IF NOT EXISTS).
-- ============================================================

DO $$
BEGIN

  -- ── discount_config ──────────────────────────────────────────────────────
  -- One row per plan_type. Updated via upsert on conflict(plan_type).
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'discount_config'
  ) THEN
    CREATE TABLE public.discount_config (
      id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_type    text        NOT NULL UNIQUE
                               CHECK (plan_type IN ('flash', 'instant', '1step', '2step')),
      code         text        NOT NULL
                               CHECK (char_length(code) BETWEEN 2 AND 30),
      discount_pct integer     NOT NULL
                               CHECK (discount_pct BETWEEN 1 AND 99),
      active       boolean     NOT NULL DEFAULT true,
      updated_by   uuid        REFERENCES public.staff_members(id),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      created_at   timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_discount_config_plan ON public.discount_config (plan_type);
    CREATE INDEX idx_discount_config_active ON public.discount_config (active) WHERE active = true;

    RAISE NOTICE 'Created discount_config table';
  ELSE
    RAISE NOTICE 'discount_config already exists — skipping create';
  END IF;

  -- ── Add updated_by column if it was created without it ───────────────────
  -- Guards against manual table creation that omitted this column.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'discount_config'
      AND column_name  = 'updated_by'
  ) THEN
    ALTER TABLE public.discount_config
      ADD COLUMN updated_by uuid REFERENCES public.staff_members(id);
    RAISE NOTICE 'Added updated_by column to discount_config';
  END IF;

  -- ── Seed production values if table is empty ─────────────────────────────
  -- Only inserts when there are no rows at all (first-time setup).
  -- These are the canonical production values; do not change them here —
  -- use the Discount Code Manager UI to change values going forward.
  IF NOT EXISTS (SELECT 1 FROM public.discount_config LIMIT 1) THEN
    INSERT INTO public.discount_config (plan_type, code, discount_pct, active) VALUES
      ('1step',   'BAPPA', 55, true),
      ('2step',   'BAPPA', 60, true),
      ('flash',   'BAPPA', 50, true),
      ('instant', 'BAPPA', 45, true);
    RAISE NOTICE 'Seeded discount_config with production defaults';
  ELSE
    RAISE NOTICE 'discount_config already has rows — skipping seed';
  END IF;

END
$$;
