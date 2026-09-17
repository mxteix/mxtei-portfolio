-- mxtei — store every form submission (contact, waitlist, invoice, referral).
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- The contact edge function writes here BEFORE sending any email, so a lead is
-- never lost even if email delivery fails. The mxReach waitlist lives here too:
--   select name, contact, created_at from form_submissions
--    where kind = 'waitlist' order by created_at;

create table if not exists public.form_submissions (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('contact','waitlist','invoice','referral')),
  name       text,
  contact    text not null,
  service    text,
  message    text,
  ip_hash    text,                      -- salted SHA-256; raw IPs are never stored
  emailed    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists form_submissions_ip_idx   on public.form_submissions (ip_hash, created_at desc);
create index if not exists form_submissions_time_idx on public.form_submissions (created_at desc);
create index if not exists form_submissions_kind_idx on public.form_submissions (kind, created_at desc);

-- RLS on with NO policies: visitors (anon key) and signed-in clients can neither
-- read nor write this table. Only the edge function, server-side with the service
-- role, touches it. Nobody's enquiry is ever exposed through the site.
alter table public.form_submissions enable row level security;
