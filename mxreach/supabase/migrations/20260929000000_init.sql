-- mxReach — initial schema.
--
-- Runs in mxReach's own Supabase project, not the mxtei.com one: customers'
-- contact lists don't belong next to invoices and referral codes.
--
-- Tenancy: every row carries workspace_id and RLS allows members of that
-- workspace only. Child rows reference their parent by (id, workspace_id), so a
-- row can never point at another workspace's contact, sequence or mailbox.
--
-- The sequence state machine lives in SQL functions (advance, stop, mark sent,
-- claim) so each transition is one transaction: a double click or two cron
-- ticks can't advance an enrollment twice.

-- ── workspaces ───────────────────────────────────────────────

create table public.workspaces (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  plan           text not null default 'pro' check (plan in ('pro', 'max', 'team', 'company')),
  sender_name    text,
  -- Postal address in every email footer. Required before any email sends:
  -- CAN-SPAM needs it, and EU rules require the sender to be identifiable.
  sender_address text,
  created_at     timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner', 'member')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- security definer so policies can call it without recursing into the
-- workspace_members policy.
create function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  )
$$;

-- ── presets (global reference data) ──────────────────────────
-- An audience is a preset row, never a fork of the code: which finders run,
-- in what order, and which sequence to start from.

create table public.presets (
  id          text primary key,
  name        text not null,
  description text not null,
  finders     text[] not null check (finders <@ array['domain_api', 'public_page']),
  starter     jsonb not null,
  sort        int not null default 0
);

-- ── contacts ─────────────────────────────────────────────────

create table public.contacts (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  name           text,
  first_name     text,
  last_name      text,
  email          text check (email = lower(email)),
  email_status   text not null default 'unknown'
                 check (email_status in ('unknown', 'valid', 'accept_all', 'risky', 'invalid')),
  email_source   text check (email_source in ('manual', 'cache', 'domain_api', 'public_page')),
  company        text,
  company_domain text,
  role_title     text,
  website_url    text,
  preset_id      text references public.presets (id),
  notes          text,
  created_at     timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index contacts_email_idx on public.contacts (workspace_id, email) where email is not null;
create index contacts_ws_created_idx on public.contacts (workspace_id, created_at desc);

-- Social handles. Email lives on contacts.email; a row here for 'email' only
-- overrides it.
create table public.contact_channels (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  contact_id   uuid not null,
  channel      text not null check (channel in ('email', 'discord', 'instagram', 'linkedin')),
  handle       text not null check (length(trim(handle)) > 0),
  unique (contact_id, channel),
  foreign key (contact_id, workspace_id) references public.contacts (id, workspace_id) on delete cascade
);

-- ── mailboxes ────────────────────────────────────────────────
-- Customers send from their own inboxes. Cold outreach never goes through
-- mxtei.com's Resend account.

create table public.mailboxes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider     text not null check (provider in ('gmail')),
  email        text not null check (email = lower(email)),
  daily_cap    int not null default 30 check (daily_cap between 1 and 200),
  status       text not null default 'active' check (status in ('active', 'error')),
  last_error   text,
  created_at   timestamptz not null default now(),
  unique (workspace_id, email),
  unique (id, workspace_id)
);

-- OAuth refresh tokens, AES-GCM encrypted by the app. Service role only:
-- RLS on, no policies, no grants to signed-in users.
create table public.mailbox_secrets (
  mailbox_id        uuid primary key references public.mailboxes (id) on delete cascade,
  refresh_token_enc text not null,
  updated_at        timestamptz not null default now()
);

-- ── sequences ────────────────────────────────────────────────

create table public.sequences (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  preset_id    text references public.presets (id),
  mailbox_id   uuid,
  -- true: emails wait in Today for approval instead of sending on their own.
  review_email boolean not null default false,
  status       text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  created_at   timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (mailbox_id, workspace_id) references public.mailboxes (id, workspace_id)
    on delete set null (mailbox_id)
);

create table public.sequence_steps (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  sequence_id  uuid not null,
  position     int not null check (position > 0),
  channel      text not null check (channel in ('email', 'discord', 'instagram', 'linkedin')),
  delay_hours  int not null default 0 check (delay_hours >= 0),
  subject      text,
  body         text not null,
  unique (sequence_id, position),
  unique (id, workspace_id),
  foreign key (sequence_id, workspace_id) references public.sequences (id, workspace_id) on delete cascade
);

-- current_step is the position whose message comes next (or is outstanding).
-- next_action_at is when to draft it; null while a message waits to be sent,
-- and once the enrollment has stopped or completed.
create table public.enrollments (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null,
  sequence_id        uuid not null,
  contact_id         uuid not null,
  state              text not null default 'active' check (state in ('active', 'stopped', 'completed')),
  current_step       int not null,
  next_action_at     timestamptz,
  stopped_reason     text check (stopped_reason in ('replied', 'unsubscribed', 'bounced', 'manual', 'completed')),
  stopped_at         timestamptz,
  replies_checked_at timestamptz,
  created_at         timestamptz not null default now(),
  unique (sequence_id, contact_id),
  unique (id, workspace_id),
  foreign key (sequence_id, workspace_id) references public.sequences (id, workspace_id) on delete cascade,
  foreign key (contact_id, workspace_id) references public.contacts (id, workspace_id) on delete cascade
);
create index enrollments_due_idx on public.enrollments (next_action_at) where state = 'active';

create table public.messages (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  enrollment_id       uuid,
  contact_id          uuid not null,
  step_id             uuid,
  mailbox_id          uuid,
  channel             text not null check (channel in ('email', 'discord', 'instagram', 'linkedin')),
  status              text not null
                      check (status in ('queued', 'awaiting_user', 'sending', 'sent', 'skipped', 'failed', 'bounced')),
  subject_rendered    text,
  body_rendered       text,
  -- Why a message needs a look (e.g. a template variable had no value).
  note                text,
  scheduled_for       timestamptz,
  sending_at          timestamptz,
  attempts            int not null default 0,
  sent_at             timestamptz,
  failed_reason       text,
  provider_message_id text,
  provider_thread_id  text,
  rfc_message_id      text,
  created_at          timestamptz not null default now(),
  -- One message per step per enrollment: drafting is idempotent.
  unique (enrollment_id, step_id),
  foreign key (contact_id, workspace_id) references public.contacts (id, workspace_id) on delete cascade,
  foreign key (enrollment_id, workspace_id) references public.enrollments (id, workspace_id)
    on delete set null (enrollment_id),
  foreign key (step_id, workspace_id) references public.sequence_steps (id, workspace_id)
    on delete set null (step_id),
  foreign key (mailbox_id, workspace_id) references public.mailboxes (id, workspace_id)
    on delete set null (mailbox_id)
);
create index messages_queue_idx on public.messages (workspace_id, status, scheduled_for);
create index messages_send_idx on public.messages (scheduled_for) where status = 'queued';
create index messages_mailbox_sent_idx on public.messages (mailbox_id, sent_at) where status = 'sent';

-- ── suppression, lookups, cache, audit ───────────────────────

-- workspace_id null = global (hard bounce, erasure request). Handles are
-- stored lowercased.
create table public.suppressions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  channel      text not null check (channel in ('email', 'discord', 'instagram', 'linkedin')),
  handle       text not null check (handle = lower(trim(handle))),
  reason       text not null check (reason in ('unsubscribed', 'bounced', 'manual', 'erased')),
  created_at   timestamptz not null default now(),
  unique nulls not distinct (workspace_id, channel, handle)
);
create index suppressions_lookup_idx on public.suppressions (channel, handle);

-- Every finder attempt, per branch. This is the "measure ~50 real targets per
-- audience" data: hit rate per preset and branch decides whether bought data
-- is enough or a niche needs its own sourcing.
create table public.lookups (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id   uuid,
  preset_id    text references public.presets (id),
  branch       text not null check (branch in ('cache', 'domain_api', 'public_page', 'verify')),
  outcome      text not null check (outcome in ('found', 'not_found', 'error', 'skipped')),
  email        text,
  detail       text,
  created_at   timestamptz not null default now(),
  foreign key (contact_id, workspace_id) references public.contacts (id, workspace_id)
    on delete set null (contact_id)
);
create index lookups_ws_created_idx on public.lookups (workspace_id, created_at desc);

-- Shared across customers so a repeat lookup is free. Service role only.
-- Erasure must reach it: see forget_email().
create table public.finder_cache (
  key           text primary key,
  email         text check (email = lower(email)),
  source        text not null check (source in ('domain_api', 'public_page')),
  verify_status text check (verify_status in ('unknown', 'valid', 'accept_all', 'risky', 'invalid')),
  checked_at    timestamptz not null default now()
);
create index finder_cache_email_idx on public.finder_cache (email);

create table public.audit_log (
  id           bigserial primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor        uuid default auth.uid(),
  action       text not null,
  entity       text not null,
  entity_id    uuid,
  created_at   timestamptz not null default now()
);

-- Hit rate per preset and branch. security_invoker so RLS applies.
create view public.lookup_stats with (security_invoker = true) as
  select workspace_id, preset_id, branch,
         count(*) filter (where outcome = 'found')     as found,
         count(*) filter (where outcome = 'not_found') as not_found,
         count(*) filter (where outcome = 'error')     as errors,
         count(*)                                      as attempts
  from public.lookups
  group by workspace_id, preset_id, branch;

-- ── row level security ───────────────────────────────────────

alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.presets           enable row level security;
alter table public.contacts          enable row level security;
alter table public.contact_channels  enable row level security;
alter table public.mailboxes         enable row level security;
alter table public.mailbox_secrets   enable row level security;
alter table public.sequences         enable row level security;
alter table public.sequence_steps    enable row level security;
alter table public.enrollments       enable row level security;
alter table public.messages          enable row level security;
alter table public.suppressions      enable row level security;
alter table public.lookups           enable row level security;
alter table public.finder_cache      enable row level security;
alter table public.audit_log         enable row level security;

create policy "members read their workspace" on public.workspaces
  for select to authenticated using (public.is_member(id));
create policy "members update their workspace" on public.workspaces
  for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

create policy "members see co-members" on public.workspace_members
  for select to authenticated using (public.is_member(workspace_id));

create policy "presets are readable" on public.presets
  for select to authenticated using (true);

create policy "members" on public.contacts         for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "members" on public.contact_channels for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "members" on public.sequences        for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "members" on public.sequence_steps   for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "members" on public.enrollments      for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "members" on public.messages         for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

-- Mailboxes are created by the OAuth callback (service role). Members can
-- see them, change the daily cap, and disconnect.
create policy "members read" on public.mailboxes for select to authenticated
  using (public.is_member(workspace_id));
create policy "members update" on public.mailboxes for update to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "members delete" on public.mailboxes for delete to authenticated
  using (public.is_member(workspace_id));

-- Workspace suppressions only. Global rows stay hidden: they'd reveal who
-- unsubscribed or bounced across every customer. is_suppressed() checks them.
create policy "members" on public.suppressions for all to authenticated
  using (workspace_id is not null and public.is_member(workspace_id))
  with check (workspace_id is not null and public.is_member(workspace_id));

create policy "members read" on public.lookups for select to authenticated
  using (public.is_member(workspace_id));
create policy "members insert" on public.lookups for insert to authenticated
  with check (public.is_member(workspace_id));

create policy "members read" on public.audit_log for select to authenticated
  using (public.is_member(workspace_id));
create policy "members insert" on public.audit_log for insert to authenticated
  with check (public.is_member(workspace_id) and actor is not distinct from auth.uid());

-- Explicit grants rather than relying on project defaults.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
revoke all on public.mailbox_secrets, public.finder_cache from authenticated;

-- ── functions ────────────────────────────────────────────────

-- First sign-in: create the user's workspace. Returns the workspace id.
create function public.ensure_workspace() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  ws uuid;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;

  select m.workspace_id into ws from public.workspace_members m
  where m.user_id = uid order by m.created_at limit 1;

  if ws is null then
    insert into public.workspaces (name)
    values (coalesce(nullif(split_part((select u.email from auth.users u where u.id = uid), '@', 1), ''), 'My workspace'))
    returning id into ws;
    insert into public.workspace_members (workspace_id, user_id, role) values (ws, uid, 'owner');
  end if;

  return ws;
end $$;

-- Is this contact suppressed on this channel, in this workspace or globally?
-- Email falls back to contacts.email, the same as the Today queue does.
-- security definer so it can see global rows; returns false for workspaces
-- the caller isn't in.
create function public.is_suppressed(p_workspace uuid, p_channel text, p_contact uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  h text;
begin
  if auth.uid() is not null and not public.is_member(p_workspace) then return false; end if;

  select coalesce(cc.handle, case when p_channel = 'email' then c.email end) into h
  from public.contacts c
  left join public.contact_channels cc on cc.contact_id = c.id and cc.channel = p_channel
  where c.id = p_contact and c.workspace_id = p_workspace;

  if h is null then return false; end if;

  return exists (
    select 1 from public.suppressions s
    where s.channel = p_channel and s.handle = lower(trim(h))
      and (s.workspace_id = p_workspace or s.workspace_id is null)
  );
end $$;

-- Stop an enrollment and cancel everything still waiting further down the
-- sequence: the part that's easy to forget and embarrassing when you do.
create function public.stop_enrollment(p_enrollment uuid, p_reason text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_enrollment is null then return; end if;

  update public.enrollments
  set state = 'stopped', stopped_reason = p_reason, stopped_at = now(), next_action_at = null
  where id = p_enrollment and state = 'active';

  update public.messages
  set status = 'skipped', failed_reason = 'enrollment stopped: ' || p_reason
  where enrollment_id = p_enrollment and status in ('queued', 'awaiting_user');
end $$;

-- Move to the next step, timed from now, or complete the enrollment.
create function public.advance_enrollment(p_enrollment uuid) returns void
language plpgsql set search_path = '' as $$
declare
  e public.enrollments;
  nxt public.sequence_steps;
begin
  select * into e from public.enrollments where id = p_enrollment for update;
  if not found or e.state <> 'active' then return; end if;

  select * into nxt from public.sequence_steps
  where sequence_id = e.sequence_id and position > e.current_step
  order by position limit 1;

  if not found then
    update public.enrollments
    set state = 'completed', stopped_reason = 'completed', stopped_at = now(), next_action_at = null
    where id = p_enrollment;
  else
    update public.enrollments
    set current_step = nxt.position, next_action_at = now() + make_interval(hours => nxt.delay_hours)
    where id = p_enrollment;
  end if;
end $$;

-- Enroll contacts in a sequence, starting at its first step. Contacts already
-- enrolled are left alone. Returns how many were added.
create function public.enroll_contacts(p_sequence uuid, p_contacts uuid[]) returns int
language plpgsql set search_path = '' as $$
declare
  s public.sequences;
  first public.sequence_steps;
  added int;
begin
  select * into s from public.sequences where id = p_sequence;
  if not found then raise exception 'sequence not found'; end if;

  select * into first from public.sequence_steps where sequence_id = p_sequence order by position limit 1;
  if not found then raise exception 'sequence has no steps'; end if;

  insert into public.enrollments (workspace_id, sequence_id, contact_id, current_step, next_action_at)
  select s.workspace_id, s.id, c.id, first.position, now() + make_interval(hours => first.delay_hours)
  from public.contacts c
  where c.id = any (p_contacts) and c.workspace_id = s.workspace_id
  on conflict (sequence_id, contact_id) do nothing;

  get diagnostics added = row_count;
  return added;
end $$;

-- The user says they sent an assisted message. We can't verify it on social
-- channels, so the button says "Sent", not "Send". Suppression is re-checked
-- here: a contact can unsubscribe between drafting and clicking.
-- Returns 'sent', 'suppressed' or 'already_handled'.
create function public.mark_message_sent(p_message uuid) returns text
language plpgsql set search_path = '' as $$
declare
  m public.messages;
begin
  select * into m from public.messages where id = p_message for update;
  if not found then raise exception 'message not found'; end if;
  if m.status <> 'awaiting_user' then return 'already_handled'; end if;

  if public.is_suppressed(m.workspace_id, m.channel, m.contact_id) then
    update public.messages set status = 'skipped', failed_reason = 'suppressed before send' where id = m.id;
    perform public.stop_enrollment(m.enrollment_id, 'unsubscribed');
    return 'suppressed';
  end if;

  update public.messages set status = 'sent', sent_at = now() where id = m.id;
  if m.enrollment_id is not null then perform public.advance_enrollment(m.enrollment_id); end if;

  insert into public.audit_log (workspace_id, action, entity, entity_id)
  values (m.workspace_id, 'message.sent_manually', 'message', m.id);
  return 'sent';
end $$;

-- Skip this step without stopping the sequence.
create function public.skip_message(p_message uuid, p_reason text default 'skipped by user') returns text
language plpgsql set search_path = '' as $$
declare
  m public.messages;
begin
  select * into m from public.messages where id = p_message for update;
  if not found then raise exception 'message not found'; end if;
  if m.status not in ('awaiting_user', 'queued') then return 'already_handled'; end if;

  update public.messages set status = 'skipped', failed_reason = p_reason where id = m.id;
  if m.enrollment_id is not null then perform public.advance_enrollment(m.enrollment_id); end if;

  insert into public.audit_log (workspace_id, action, entity, entity_id)
  values (m.workspace_id, 'message.skipped', 'message', m.id);
  return 'skipped';
end $$;

-- Review mode: the user approved a drafted email; the worker sends it from
-- the connected mailbox.
create function public.approve_email(p_message uuid) returns text
language plpgsql set search_path = '' as $$
declare
  m public.messages;
begin
  select * into m from public.messages where id = p_message for update;
  if not found then raise exception 'message not found'; end if;
  if m.status <> 'awaiting_user' or m.channel <> 'email' then return 'already_handled'; end if;

  update public.messages set status = 'queued', scheduled_for = now(), note = null where id = m.id;
  insert into public.audit_log (workspace_id, action, entity, entity_id)
  values (m.workspace_id, 'message.approved', 'message', m.id);
  return 'queued';
end $$;

-- ── worker functions (service role only) ─────────────────────

-- Claim queued emails for sending: at most p_per_mailbox per mailbox per
-- call, so a five-minute cron spreads a day's sends out like a person would
-- instead of firing them in one burst. skip locked, so overlapping ticks
-- never take the same message.
create function public.claim_email_sends(p_per_mailbox int) returns setof public.messages
language sql set search_path = '' as $$
  with ranked as (
    select id, row_number() over (
      partition by coalesce(mailbox_id::text, id::text) order by scheduled_for
    ) as rn
    from public.messages m
    where m.status = 'queued' and m.channel = 'email' and m.scheduled_for <= now()
      -- Pausing a sequence holds what's already queued, too.
      and not exists (
        select 1 from public.enrollments e
        join public.sequences s on s.id = e.sequence_id
        where e.id = m.enrollment_id and s.status <> 'active'
      )
  ),
  picked as (
    select m.id from public.messages m
    join ranked r on r.id = m.id and r.rn <= p_per_mailbox
    where m.status = 'queued'
    for update of m skip locked
  )
  update public.messages m
  set status = 'sending', sending_at = now(), attempts = m.attempts + 1
  from picked
  where m.id = picked.id
  returning m.*
$$;

-- A worker died mid-send: the email may or may not have gone out. Hand it to
-- the user rather than risk sending it twice.
create function public.release_stale_sends(p_minutes int) returns int
language plpgsql set search_path = '' as $$
declare
  n int;
begin
  update public.messages
  set status = 'awaiting_user',
      note = 'Sending was interrupted. Check your Sent folder before approving it again.'
  where status = 'sending' and sending_at < now() - make_interval(mins => p_minutes);
  get diagnostics n = row_count;
  return n;
end $$;

-- Active enrollments with sent email threads to check for replies, least
-- recently checked first. Marks them checked.
create function public.reply_check_batch(p_limit int)
returns table (enrollment_id uuid, mailbox_id uuid, thread_id text, sent jsonb)
language sql set search_path = '' as $$
  with batch as (
    select e.id from public.enrollments e
    where e.state = 'active'
      and exists (
        select 1 from public.messages m
        where m.enrollment_id = e.id and m.status = 'sent' and m.channel = 'email'
          and m.provider_thread_id is not null
      )
    order by e.replies_checked_at nulls first
    limit p_limit
    for update of e skip locked
  ),
  touched as (
    update public.enrollments e set replies_checked_at = now()
    from batch where e.id = batch.id
    returning e.id
  )
  select m.enrollment_id, m.mailbox_id, m.provider_thread_id,
         jsonb_agg(jsonb_build_object('id', m.id, 'provider_id', m.provider_message_id) order by m.sent_at)
  from public.messages m
  join touched t on t.id = m.enrollment_id
  where m.status = 'sent' and m.channel = 'email' and m.provider_thread_id is not null
  group by m.enrollment_id, m.mailbox_id, m.provider_thread_id
$$;

-- The provider accepted the email: record it and move the sequence on.
create function public.finish_email_send(
  p_message uuid, p_provider_id text, p_thread_id text, p_rfc_id text
) returns void
language plpgsql set search_path = '' as $$
declare
  m public.messages;
begin
  update public.messages
  set status = 'sent', sent_at = now(), provider_message_id = p_provider_id,
      provider_thread_id = p_thread_id, rfc_message_id = p_rfc_id, failed_reason = null
  where id = p_message and status = 'sending'
  returning * into m;

  if found and m.enrollment_id is not null then
    perform public.advance_enrollment(m.enrollment_id);
  end if;
end $$;

-- Unsubscribe link: suppress the contact's email for this workspace and stop
-- every active sequence they're in there.
create function public.unsubscribe_contact(p_workspace uuid, p_contact uuid) returns boolean
language plpgsql set search_path = '' as $$
declare
  addr text;
  e record;
begin
  select email into addr from public.contacts where id = p_contact and workspace_id = p_workspace;
  if not found then return false; end if;

  if addr is not null then
    insert into public.suppressions (workspace_id, channel, handle, reason)
    values (p_workspace, 'email', lower(trim(addr)), 'unsubscribed')
    on conflict do nothing;
  end if;

  for e in select id from public.enrollments
           where contact_id = p_contact and workspace_id = p_workspace and state = 'active' loop
    perform public.stop_enrollment(e.id, 'unsubscribed');
  end loop;
  return true;
end $$;

-- Hard bounce: the address is dead for everyone. Suppress it globally, mark
-- the contact invalid and stop the enrollment.
create function public.record_bounce(p_message uuid) returns void
language plpgsql set search_path = '' as $$
declare
  m public.messages;
  addr text;
begin
  select * into m from public.messages where id = p_message;
  if not found then return; end if;

  select email into addr from public.contacts where id = m.contact_id;
  if addr is not null then
    insert into public.suppressions (workspace_id, channel, handle, reason)
    values (null, 'email', lower(trim(addr)), 'bounced') on conflict do nothing;
    update public.contacts set email_status = 'invalid' where email = lower(trim(addr));
    update public.finder_cache set verify_status = 'invalid' where email = lower(trim(addr));
  end if;

  update public.messages set status = 'bounced' where id = m.id and status = 'sent';
  perform public.stop_enrollment(m.enrollment_id, 'bounced');
end $$;

-- Erasure request (GDPR art. 17) for an address mxReach found: drop it from
-- the shared cache and make sure no customer can email it again.
create function public.forget_email(p_email text) returns void
language plpgsql set search_path = '' as $$
begin
  delete from public.finder_cache where email = lower(trim(p_email));
  insert into public.suppressions (workspace_id, channel, handle, reason)
  values (null, 'email', lower(trim(p_email)), 'erased') on conflict do nothing;
end $$;

-- Supabase's default privileges grant every new function to anon and
-- authenticated, so revoke from both and grant back only the user-facing ones.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_member(uuid), public.ensure_workspace(), public.is_suppressed(uuid, text, uuid),
  public.stop_enrollment(uuid, text), public.advance_enrollment(uuid),
  public.enroll_contacts(uuid, uuid[]), public.mark_message_sent(uuid),
  public.skip_message(uuid, text), public.approve_email(uuid)
to authenticated;
grant execute on all functions in schema public to service_role;
