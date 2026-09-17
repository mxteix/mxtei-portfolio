-- mxtei — referral codes. Run once in the Supabase SQL Editor.
--
-- One six-digit code per email address. The code is only ever delivered by
-- email, so receiving it proves the person owns that address.

create table if not exists public.referral_codes (
  code        text primary key check (code ~ '^[0-9]{6}$'),
  owner_email text not null,                  -- always stored lowercased
  owner_name  text,
  created_at  timestamptz not null default now()
);

-- One code per person: a second request returns the code they already have
-- instead of minting another, so codes can't be farmed.
create unique index if not exists referral_codes_owner_idx on public.referral_codes (owner_email);

-- Rate-limiting log for "is this code real?" lookups, so the million possible
-- codes can't be worked through. IPs are hashed, never stored raw.
create table if not exists public.code_checks (
  id         bigserial primary key,
  ip_hash    text,
  created_at timestamptz not null default now()
);
create index if not exists code_checks_ip_idx on public.code_checks (ip_hash, created_at desc);

-- Which code a visitor used when they got in touch.
alter table public.form_submissions add column if not exists referral_code text;

-- RLS on with no policies: only the edge function (service role) may touch
-- these. A visitor can never read codes or see who owns them.
alter table public.referral_codes enable row level security;
alter table public.code_checks    enable row level security;
