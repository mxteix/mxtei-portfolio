# mxReach

The outreach tool from `PLAN.md`: find the right person, draft the first message,
follow up until they answer. This folder is the app. It is **not** published to
mxtei.com (only `docs/` is), and mxReach is **not launched**: sign-in is invite-only.

## What works

The first build slice from `PLAN.md` §8, end to end:

1. **Data model** with per-workspace isolation (RLS) and a state machine in SQL:
   `supabase/migrations/`.
2. **Presets + finder cascade.** Four audience presets. Finding an email goes:
   shared cache → the person's own published pages (site, link-in-bio, one hop
   to a contact page) or a company-domain lookup (Hunter), in the preset's order.
3. **Verification before anything sends.** Syntax → does the domain take mail →
   Hunter's verifier. Only `valid` / `accept_all` addresses ever get email.
4. **Sequences with stop-on-reply.** Email sends itself; Discord/Instagram/LinkedIn
   steps land in **Today** for you to send (copy → open DM → paste → "Sent").
   Replies and bounces are read from Gmail thread headers every tick; a reply
   stops the sequence, a bounce suppresses the address for every customer.
5. **One connected Gmail sending real email.** Plain text, threaded follow-ups,
   one-click unsubscribe (RFC 8058), a footer with sender + postal address,
   per-mailbox daily cap, one email per mailbox per 5-minute tick.

Plus **Hit rates** (`/stats`): found/tried per preset and branch. That's the
"measure ~50 real targets per audience" number from the plan.

## Map

| Where | What |
|---|---|
| `supabase/migrations/` | Schema, RLS, state-machine functions, presets |
| `lib/channels.ts`, `lib/today-queue.ts` | Brought over from the claude.ai project: channel handoff + Today queue |
| `lib/finder/` | Cascade, page reader (SSRF-safe, robots.txt), Hunter, verification |
| `lib/engine/` | The worker: `draft` → `send` → `replies`, run by `/api/cron/tick` |
| `lib/mail/` | Gmail REST client, RFC 5322 builder |
| `app/(app)/` | Today, Contacts, Sequences, Mailboxes, Hit rates, Settings |
| `tests/db/` | The SQL, run in an in-memory Postgres (PGlite): tenancy, state machine, worker claims |
| `tests/unit/` | Everything else that doesn't need a network |

```bash
npm install
npm test          # 80+ tests, no network or database needed
npm run dev       # http://localhost:3100
```

## Setting it up

**First run on your Mac: follow [SETUP.md](SETUP.md)**, the short click-by-click version.
The sections below are the reference, including production.

### 1. Supabase (new project)

Create a **separate** project for mxReach. Customer contact lists don't belong next
to mxtei.com's invoices and referral codes.

1. SQL Editor → run the files in `supabase/migrations/` in order.
2. Authentication → Sign In / Providers → Email: turn **off** "Allow new users to sign up".
   That's what makes it invite-only. Add people under Authentication → Users → Add user.
3. Authentication → URL Configuration: Site URL = `APP_URL`; add
   `APP_URL/auth/confirm` to Redirect URLs.
4. Authentication → SMTP: use the same Resend setup as mxtei.com
   (`smtp.resend.com`, port 465, user `resend`). **Login emails only.** Cold
   outreach never goes through Resend; it sends from the customer's own Gmail.
5. Copy the URL, anon key and service role key into `.env.local`.

### 2. Google Cloud (Gmail)

1. New project → enable the **Gmail API**.
2. OAuth consent screen: External, app name mxReach, add scopes
   `gmail.send` and `gmail.metadata`. Add yourself (and beta users) as **test users**.
3. Credentials → OAuth client ID → Web application. Redirect URI:
   `APP_URL/api/gmail/callback`.

Up to 100 test users can connect without Google's review. Opening it to the public
needs verification, and `gmail.metadata` (needed to see replies) is a *restricted*
scope, so that means a yearly third-party security assessment too. Start that early.
It runs on Google's timeline, like Meta's review for the Instagram module.

### 3. Hunter

Sign up at hunter.io; the free tier covers building. Paste the API key. Without it,
lookups only read published pages, and nothing can be verified, so nothing sends.

### 4. Secrets

```bash
openssl rand -base64 32
```

Run it once each for `TOKEN_ENCRYPTION_KEY` and `CRON_SECRET`, and use
`openssl rand -base64 48` for `APP_SECRET`. Never change `TOKEN_ENCRYPTION_KEY` after
mailboxes are connected.

### 5. Run the worker

The worker is `GET /api/cron/tick` with `Authorization: Bearer $CRON_SECRET`, every
5 minutes. On Vercel, `vercel.json` schedules it, but Hobby plans only allow daily
crons. On Hobby, let Supabase call it instead (Database → Extensions: enable
`pg_cron` and `pg_net`, then in the SQL Editor):

```sql
select cron.schedule('mxreach-tick', '*/5 * * * *', $$
  select net.http_get(
    url := 'https://app.mxtei.com/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
  )
$$);
```

Locally:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3100/api/cron/tick
```

## Rules the code enforces

These come from `PLAN.md` §5, so don't loosen them without deciding to:

- Only email is sent automatically. Social steps are always sent by a person.
- Nothing emails an address that isn't verified, is suppressed, or has unsubscribed.
  Suppression is re-checked at the moment of sending.
- Every email has an unsubscribe link, one-click unsubscribe headers, and the
  sender's postal address. No postal address, no sending.
- The page reader only reads pages the user pointed it at, respects robots.txt,
  identifies itself, and refuses private/internal addresses.
- Erasure requests: `select forget_email('person@example.com')` (service role)
  removes the address from the shared cache and blocks it for every customer.

## Not built yet

Outlook, Stripe billing, team seats, A/B tests, the inbound module (Discord bots +
Instagram comment replies), and app-password/SMTP mailboxes as an alternative to
Google's review.
