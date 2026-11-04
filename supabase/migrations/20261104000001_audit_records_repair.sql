-- Repair the Admin OS audit store without changing the existing legacy audit_logs table.
-- The composite key is required because audit_records is partitioned by timestamp.

CREATE TABLE IF NOT EXISTS public.audit_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.staff_members(id),
  actor_role varchar(100) NOT NULL,
  action varchar(100) NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  target_entity_type varchar(100) NOT NULL,
  target_entity_id varchar(255) NOT NULL,
  previous_state jsonb,
  new_state jsonb,
  ip_address inet NOT NULL,
  device_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  batch_id uuid,
  metadata jsonb,
  missing_permission varchar(100),
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

CREATE TABLE IF NOT EXISTS public.audit_records_default
  PARTITION OF public.audit_records DEFAULT;

CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON public.audit_records(actor_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action
  ON public.audit_records(action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target
  ON public.audit_records(target_entity_type, target_entity_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_batch
  ON public.audit_records(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_timestamp
  ON public.audit_records(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_ip
  ON public.audit_records(ip_address);

CREATE OR REPLACE FUNCTION public.prevent_audit_modification()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are immutable and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.audit_records'::regclass
      AND tgname = 'audit_immutable_update'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER audit_immutable_update
      BEFORE UPDATE ON public.audit_records
      FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_modification();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.audit_records'::regclass
      AND tgname = 'audit_immutable_delete'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER audit_immutable_delete
      BEFORE DELETE ON public.audit_records
      FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_modification();
  END IF;
END
$$;

ALTER TABLE public.audit_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_records'
      AND policyname = 'deny_client_access_audit_records'
  ) THEN
    CREATE POLICY deny_client_access_audit_records
      ON public.audit_records
      FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END
$$;

REVOKE ALL ON public.audit_records FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.audit_records TO service_role;
