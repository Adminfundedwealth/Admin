-- ─────────────────────────────────────────────────────────────────────────────
-- FundedWealth Admin — Certificate Engine: Supabase Migration
-- Run this once in your Supabase SQL editor (or via supabase db push).
--
-- Creates the `certificates` table that the Admin certificate module reads/writes.
-- The backend Certificate Engine also writes to this table via service-role key.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create the certificates table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.certificates (
  -- Primary key
  id                 uuid primary key default gen_random_uuid(),

  -- Relationships
  user_id            uuid not null,          -- references public.users(id)
  payout_id          uuid,                   -- references payout_reviews(id), nullable
  account_id         uuid,                   -- references trading/challenge accounts, nullable

  -- Certificate identity
  certificate_number text,                   -- human-readable serial: FW-CERT-2026-0001
  certificate_type   text not null
    check (certificate_type in (
      'profit_certificate',
      'funded_trader',
      'phase_completion'
    )),

  -- Lifecycle status
  status             text not null default 'pending'
    check (status in (
      'pending',
      'generated',
      'downloaded',
      'verified',
      'failed'
    )),

  -- Financial data shown on the certificate
  amount             numeric(15, 2),

  -- URLs returned by the backend Certificate Engine
  download_url       text,                   -- signed CDN URL for the PDF
  verification_url   text,                   -- public shareable verification link
  preview_url        text,                   -- thumbnail image URL

  -- Error tracking
  failure_reason     text,

  -- Timestamps
  generated_at       timestamptz,            -- when the PDF was generated
  downloaded_at      timestamptz,            -- first time the trader downloaded it
  email_sent_at      timestamptz,            -- last email delivery timestamp
  verified_at        timestamptz,            -- last verification check timestamp

  -- Staff provenance
  issued_by          uuid,                   -- staff_members.id who triggered generation

  -- Row metadata
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 2. Indexes for common query patterns
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists certificates_user_id_idx
  on public.certificates (user_id);

create index if not exists certificates_payout_id_idx
  on public.certificates (payout_id)
  where payout_id is not null;

create index if not exists certificates_status_idx
  on public.certificates (status);

create index if not exists certificates_created_at_idx
  on public.certificates (created_at desc);

create index if not exists certificates_certificate_type_idx
  on public.certificates (certificate_type);

-- 3. Updated-at trigger (auto-updates updated_at on every row change)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists certificates_set_updated_at on public.certificates;
create trigger certificates_set_updated_at
  before update on public.certificates
  for each row
  execute function public.set_updated_at();

-- 4. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
-- Admin uses service-role key (bypasses RLS) for all writes.
-- Main site traders should only see their own certificates.
-- Enable RLS and add a policy for trader-facing reads if your main site
-- queries this table directly with the anon key.
alter table public.certificates enable row level security;

-- Service role (Admin + Certificate Engine) bypasses RLS automatically.
-- Trader read policy: users can only read their own certificates.
-- Uncomment if your main site reads this table with the anon/user JWT:
-- create policy "Traders can view own certificates"
--   on public.certificates
--   for select
--   using (user_id = auth.uid());

-- 5. Comments
-- ─────────────────────────────────────────────────────────────────────────────
comment on table  public.certificates                is 'Trader profit/funded certificates issued by the backend Certificate Engine.';
comment on column public.certificates.id             is 'UUID primary key.';
comment on column public.certificates.user_id        is 'Trader user ID from public.users.';
comment on column public.certificates.payout_id      is 'Linked payout request ID (nullable).';
comment on column public.certificates.certificate_type is 'profit_certificate | funded_trader | phase_completion';
comment on column public.certificates.status         is 'pending → generated → downloaded → verified. failed is terminal.';
comment on column public.certificates.download_url   is 'Signed CDN URL returned by the Certificate Engine. May expire — refresh via regenerate action.';
comment on column public.certificates.verification_url is 'Public shareable URL that anyone can open to verify the certificate is genuine.';
comment on column public.certificates.issued_by      is 'staff_members.id of the staff member who triggered generation.';
