-- Centralized, time-bounded promotion campaigns shared by Admin and the public API.
-- Existing discount_config rows are copied, not removed or modified.

CREATE TABLE IF NOT EXISTS public.promo_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  description text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'active', 'expired', 'disabled')),
  enabled boolean NOT NULL DEFAULT false,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  priority integer,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.promo_campaigns(id),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9_-]{2,30}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, code),
  UNIQUE (id, campaign_id)
);

CREATE TABLE IF NOT EXISTS public.promo_campaign_plan_eligibility (
  campaign_id uuid NOT NULL REFERENCES public.promo_campaigns(id),
  plan_type text NOT NULL CHECK (plan_type IN ('flash', 'instant', '1step', '2step')),
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id),
  discount_pct integer NOT NULL CHECK (discount_pct BETWEEN 1 AND 99),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, plan_type, promo_code_id),
  FOREIGN KEY (promo_code_id, campaign_id)
    REFERENCES public.promo_codes(id, campaign_id)
);

CREATE TABLE IF NOT EXISTS public.promo_campaign_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.promo_campaigns(id),
  actor_id text,
  event_type text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promo_order_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL UNIQUE,
  campaign_id uuid REFERENCES public.promo_campaigns(id),
  promo_code_id uuid REFERENCES public.promo_codes(id),
  plan_type text NOT NULL CHECK (plan_type IN ('flash', 'instant', '1step', '2step')),
  discount_pct integer NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 99),
  base_amount integer NOT NULL CHECK (base_amount >= 0),
  final_amount integer NOT NULL CHECK (final_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((campaign_id IS NULL) = (promo_code_id IS NULL))
);

CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.promo_campaigns(id),
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id),
  order_id text,
  user_id text,
  plan_type text NOT NULL CHECK (plan_type IN ('flash', 'instant', '1step', '2step')),
  discount_pct integer NOT NULL CHECK (discount_pct BETWEEN 1 AND 99),
  base_amount integer NOT NULL CHECK (base_amount >= 0),
  final_amount integer NOT NULL CHECK (final_amount >= 0),
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_redemptions_order
  ON public.promo_redemptions(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promo_campaigns_live
  ON public.promo_campaigns(enabled, status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_promo_eligibility_plan
  ON public.promo_campaign_plan_eligibility(plan_type, enabled);
CREATE INDEX IF NOT EXISTS idx_promo_codes_lookup
  ON public.promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_history_campaign
  ON public.promo_campaign_history(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_campaign_schedule
  ON public.promo_campaigns(enabled, starts_at, ends_at, priority DESC);

ALTER TABLE public.promo_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_campaign_plan_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_campaign_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_order_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_policy_name text;
  v_table_name text;
BEGIN
  FOREACH v_table_name IN ARRAY ARRAY[
    'promo_campaigns',
    'promo_codes',
    'promo_campaign_plan_eligibility',
    'promo_campaign_history',
    'promo_order_quotes',
    'promo_redemptions'
  ] LOOP
    v_policy_name := 'deny_client_access_' || v_table_name;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = v_table_name
        AND p.policyname = v_policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        v_policy_name, v_table_name
      );
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', v_table_name);
  END LOOP;
END
$$;

-- Save the campaign, its per-plan codes/discounts and audit event atomically.
CREATE OR REPLACE FUNCTION public.save_promo_campaign(
  p_campaign_id uuid,
  p_name text,
  p_description text,
  p_enabled boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_priority integer,
  p_status text,
  p_rules jsonb,
  p_actor_id text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  saved_id uuid;
  old_status text;
  new_status text;
  rule jsonb;
  code_id uuid;
  existing_campaign record;
BEGIN
  IF p_name IS NULL OR char_length(trim(p_name)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Campaign name must be between 1 and 120 characters' USING ERRCODE = '22023';
  END IF;
  IF p_starts_at IS NULL OR (p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at) THEN
    RAISE EXCEPTION 'Campaign end must be later than its start' USING ERRCODE = '22023';
  END IF;
  IF p_timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = p_timezone
  ) THEN
    RAISE EXCEPTION 'Unknown campaign time zone' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('draft', 'scheduled', 'active', 'expired', 'disabled') THEN
    RAISE EXCEPTION 'Invalid campaign status' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_rules) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'At least one eligible plan is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rules) = 0 THEN
    RAISE EXCEPTION 'At least one eligible plan is required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rules) AS input_rule(rule_json)
    GROUP BY rule_json->>'planType', upper(trim(rule_json->>'code'))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A promo code can only be listed once for each plan' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rules) AS input_rule(rule_json)
    GROUP BY rule_json->>'planType'
    HAVING min((rule_json->>'discountPct')::integer) <> max((rule_json->>'discountPct')::integer)
  ) THEN
    RAISE EXCEPTION 'All promo codes for the same plan must use the same discount percentage'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rules) AS input_rule(rule_json)
    WHERE rule_json->>'planType' NOT IN ('flash', 'instant', '1step', '2step')
      OR COALESCE(rule_json->>'code', '') !~* '^[A-Z0-9_-]{2,30}$'
      OR COALESCE((rule_json->>'discountPct')::integer, 0) NOT BETWEEN 1 AND 99
  ) THEN
    RAISE EXCEPTION 'Campaign plan code or discount is invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('promo_campaign_plan_overlap'));

  IF p_campaign_id IS NOT NULL THEN
    SELECT status INTO old_status
    FROM promo_campaigns WHERE id = p_campaign_id FOR UPDATE;
  END IF;

  IF p_enabled AND p_status NOT IN ('draft', 'disabled', 'expired') THEN
    FOR existing_campaign IN
      SELECT DISTINCT c.id, c.priority
      FROM promo_campaigns c
      JOIN promo_campaign_plan_eligibility existing_rule
        ON existing_rule.campaign_id = c.id AND existing_rule.enabled
      JOIN jsonb_array_elements(p_rules) AS incoming_rule(rule_json)
        ON incoming_rule.rule_json->>'planType' = existing_rule.plan_type
      WHERE c.enabled
        AND c.status IN ('scheduled', 'active')
        AND c.id IS DISTINCT FROM p_campaign_id
        AND (p_ends_at IS NULL OR c.starts_at < p_ends_at)
        AND (c.ends_at IS NULL OR p_starts_at < c.ends_at)
    LOOP
      IF p_priority IS NULL OR existing_campaign.priority IS NULL
         OR p_priority = existing_campaign.priority THEN
        RAISE EXCEPTION 'Overlapping enabled campaigns for an eligible plan require distinct explicit priorities'
          USING ERRCODE = '23P01';
      END IF;
    END LOOP;
  END IF;

  IF NOT p_enabled OR p_status IN ('draft', 'disabled', 'expired') THEN
    new_status := CASE WHEN p_status = 'draft' THEN 'draft'
                       WHEN p_status = 'expired' THEN 'expired'
                       ELSE 'disabled' END;
  ELSIF p_ends_at IS NOT NULL AND p_ends_at <= now() THEN
    new_status := 'expired';
  ELSIF p_starts_at > now() THEN
    new_status := 'scheduled';
  ELSE
    new_status := 'active';
  END IF;

  IF p_campaign_id IS NULL THEN
    INSERT INTO promo_campaigns (
      name, description, enabled, starts_at, ends_at, timezone, priority,
      status, created_by, updated_by
    ) VALUES (
      trim(p_name), p_description, p_enabled, p_starts_at, p_ends_at,
      p_timezone, p_priority, new_status, p_actor_id, p_actor_id
    ) RETURNING id INTO saved_id;
  ELSE
    UPDATE promo_campaigns SET
      name = trim(p_name), description = p_description, enabled = p_enabled,
      starts_at = p_starts_at, ends_at = p_ends_at, timezone = p_timezone,
      priority = p_priority, status = new_status, updated_by = p_actor_id,
      updated_at = now()
    WHERE id = p_campaign_id
    RETURNING id INTO saved_id;
    IF saved_id IS NULL THEN
      RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  UPDATE promo_campaign_plan_eligibility
  SET enabled = false, updated_at = now()
  WHERE campaign_id = saved_id;

  FOR rule IN SELECT value FROM jsonb_array_elements(p_rules)
  LOOP
    INSERT INTO promo_codes (campaign_id, code)
    VALUES (saved_id, upper(trim(rule->>'code')))
    ON CONFLICT (campaign_id, code) DO UPDATE SET code = EXCLUDED.code
    RETURNING id INTO code_id;

    INSERT INTO promo_campaign_plan_eligibility (
      campaign_id, plan_type, promo_code_id, discount_pct, enabled, updated_at
    ) VALUES (
      saved_id, rule->>'planType', code_id, (rule->>'discountPct')::integer,
      true, now()
    )
    ON CONFLICT (campaign_id, plan_type, promo_code_id) DO UPDATE SET
      promo_code_id = EXCLUDED.promo_code_id,
      discount_pct = EXCLUDED.discount_pct,
      enabled = EXCLUDED.enabled,
      updated_at = now();
  END LOOP;

  INSERT INTO promo_campaign_history (
    campaign_id, actor_id, event_type, from_status, to_status, details
  ) VALUES (
    saved_id, p_actor_id,
    CASE WHEN old_status IS NULL THEN 'campaign_created' ELSE 'campaign_updated' END,
    old_status, new_status,
    jsonb_build_object('name', trim(p_name), 'rules', p_rules)
  );

  RETURN saved_id;
END
$$;

REVOKE ALL ON FUNCTION public.save_promo_campaign(
  uuid, text, text, boolean, timestamptz, timestamptz, text, integer, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_promo_campaign(
  uuid, text, text, boolean, timestamptz, timestamptz, text, integer, text, jsonb, text
) TO service_role;

-- Backfill the legacy per-plan configuration into a campaign; leave source rows intact.
DO $$
DECLARE
  legacy_campaign_id uuid;
BEGIN
  IF to_regclass('public.discount_config') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.promo_campaign_history
       WHERE event_type = 'legacy_configuration_imported'
     ) THEN
    EXECUTE $migrate$
      WITH inserted AS (
        INSERT INTO public.promo_campaigns (
          name, description, status, enabled, starts_at, ends_at, timezone,
          priority, created_by, updated_by
        )
        SELECT
          'Imported discount configuration',
          'Preserved from the previous per-plan discount configuration.',
          CASE WHEN bool_or(active) THEN 'active' ELSE 'disabled' END,
          bool_or(active), now(), NULL, 'Asia/Kolkata', 0, 'system', 'system'
        FROM public.discount_config
        HAVING count(*) > 0
        RETURNING id
      )
      SELECT id FROM inserted
    $migrate$ INTO legacy_campaign_id;

    IF legacy_campaign_id IS NOT NULL THEN
      EXECUTE $migrate$
        INSERT INTO public.promo_codes (campaign_id, code)
        SELECT $1, upper(trim(code))
        FROM public.discount_config
        GROUP BY upper(trim(code))
        ON CONFLICT (campaign_id, code) DO NOTHING
      $migrate$ USING legacy_campaign_id;

      EXECUTE $migrate$
        INSERT INTO public.promo_campaign_plan_eligibility (
          campaign_id, plan_type, promo_code_id, discount_pct, enabled
        )
        SELECT $1, config.plan_type, codes.id, config.discount_pct, config.active
        FROM public.discount_config config
        JOIN public.promo_codes codes
          ON codes.campaign_id = $1 AND codes.code = upper(trim(config.code))
        ON CONFLICT (campaign_id, plan_type, promo_code_id) DO NOTHING
      $migrate$ USING legacy_campaign_id;

      INSERT INTO public.promo_campaign_history (
        campaign_id, actor_id, event_type, to_status, details
      ) VALUES (
        legacy_campaign_id, 'system', 'legacy_configuration_imported',
        (SELECT status FROM public.promo_campaigns WHERE id = legacy_campaign_id),
        jsonb_build_object('source', 'discount_config')
      );
    END IF;
  END IF;
END
$$;
