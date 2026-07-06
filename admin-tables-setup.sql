
DO $$
BEGIN
  -- emergency_credentials
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='emergency_credentials') THEN
    CREATE TABLE public.emergency_credentials (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trading_account_id   uuid,
      challenge_account_id uuid,
      user_id              uuid,
      user_email           text NOT NULL,
      terminal_login       text NOT NULL,
      temporary_password   text NOT NULL,
      activation_token     text NOT NULL UNIQUE,
      credential_expiry    timestamptz NOT NULL,
      product_slug         text NOT NULL,
      account_size         bigint NOT NULL,
      provisioned_by       text NOT NULL DEFAULT 'founder_emergency',
      provisioned_at       timestamptz NOT NULL DEFAULT now(),
      used                 boolean NOT NULL DEFAULT false,
      created_at           timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_ec_email  ON public.emergency_credentials(user_email);
    CREATE INDEX idx_ec_ta     ON public.emergency_credentials(trading_account_id);
    CREATE INDEX idx_ec_token  ON public.emergency_credentials(activation_token);
    RAISE NOTICE 'Created emergency_credentials';
  ELSE
    RAISE NOTICE 'emergency_credentials already exists';
  END IF;

  -- sso_tokens
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='sso_tokens') THEN
    CREATE TABLE public.sso_tokens (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      token          text NOT NULL UNIQUE,
      terminal_login text NOT NULL,
      email          text,
      expires_at     timestamptz NOT NULL,
      used           boolean NOT NULL DEFAULT false,
      created_at     timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_sso_token ON public.sso_tokens(token);
    RAISE NOTICE 'Created sso_tokens';
  ELSE
    RAISE NOTICE 'sso_tokens already exists';
  END IF;
END
$$;
