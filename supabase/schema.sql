-- mxtei client portal — schema and access rules.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
--
-- SECURITY MODEL, in one line: the browser only ever holds the anon key, which is
-- public by design. Every table below has Row Level Security ON and only SELECT
-- policies scoped to the signed-in user. Nothing the client sends can widen that.
-- If RLS were off, the anon key would expose every client's invoices to everyone.

-- ---------------------------------------------------------------- tables --

create table if not exists public.clients (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users(id) on delete set null,
  email      text not null,
  name       text,
  company    text,
  created_at timestamptz not null default now()
);
comment on column public.clients.user_id is
  'Filled automatically by the trigger below when someone signs up with a matching email.';

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  name        text not null,
  status      text not null default 'active'
                check (status in ('active','paused','complete')),
  hourly_rate numeric(10,2),
  currency    text not null default 'USD',
  started_on  date not null default current_date,
  created_at  timestamptz not null default now()
);

create table if not exists public.time_entries (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  worked_on  date not null default current_date,
  hours      numeric(5,2) not null check (hours > 0),
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  number     text not null unique,
  amount     numeric(10,2) not null check (amount >= 0),
  currency   text not null default 'USD',
  status     text not null default 'unpaid'
               check (status in ('unpaid','paid','void')),
  issued_on  date not null default current_date,
  due_on     date,
  paid_on    date,
  pay_url    text,
  created_at timestamptz not null default now()
);

create index if not exists projects_client_idx     on public.projects(client_id);
create index if not exists time_entries_proj_idx   on public.time_entries(project_id);
create index if not exists invoices_client_idx     on public.invoices(client_id);
create index if not exists clients_email_lower_idx on public.clients(lower(email));

-- ------------------------------------------------------------------ rls --

alter table public.clients      enable row level security;
alter table public.projects     enable row level security;
alter table public.time_entries enable row level security;
alter table public.invoices     enable row level security;

-- Read-only, and only your own rows. No insert/update/delete policies exist,
-- so with RLS on those are denied for everyone using the anon key. You write
-- data from the Supabase dashboard or with the service-role key, never here.

drop policy if exists "read own client row" on public.clients;
create policy "read own client row" on public.clients
  for select using (user_id = auth.uid());

drop policy if exists "read own projects" on public.projects;
create policy "read own projects" on public.projects
  for select using (
    client_id in (select id from public.clients where user_id = auth.uid())
  );

drop policy if exists "read own time entries" on public.time_entries;
create policy "read own time entries" on public.time_entries
  for select using (
    project_id in (
      select p.id from public.projects p
      join public.clients c on c.id = p.client_id
      where c.user_id = auth.uid()
    )
  );

drop policy if exists "read own invoices" on public.invoices;
create policy "read own invoices" on public.invoices
  for select using (
    client_id in (select id from public.clients where user_id = auth.uid())
  );

-- -------------------------------------------------------------- linking --

-- When someone signs up, attach them to the client row you already created for
-- their email. Anyone signing up without a matching row simply sees an empty
-- portal telling them to get in touch — they gain no access to anything.
create or replace function public.link_client_to_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clients
     set user_id = new.id
   where user_id is null
     and lower(email) = lower(new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.link_client_to_user();

-- ------------------------------------------------------------ view: hours --

-- Logged hours rolled up per project, so the portal does one cheap read.
create or replace view public.project_totals
with (security_invoker = on) as
  select p.id as project_id,
         p.client_id,
         coalesce(sum(t.hours), 0)                     as hours,
         coalesce(sum(t.hours) * p.hourly_rate, 0)     as value,
         max(t.worked_on)                              as last_worked_on
    from public.projects p
    left join public.time_entries t on t.project_id = p.id
   group by p.id, p.client_id, p.hourly_rate;
