# Client portal — setup

About 20 minutes. Until step 4 is done the portal shows a "not switched on yet"
notice instead of a sign-in form, so it is safe to deploy before finishing.

## 1. Create the project

1. <https://supabase.com> → New project. Pick the region closest to your clients.
2. Save the database password somewhere safe — it is not recoverable.

## 2. Create the tables

SQL Editor → New query → paste all of `schema.sql` → Run.

This creates `clients`, `projects`, `time_entries`, `invoices`, turns on Row
Level Security with read-only, own-rows-only policies, and adds a trigger that
links a new signup to the client row with the same email address.

## 3. Turn on the sign-in methods

Authentication → Providers.

| Provider | What you need |
|---|---|
| **Email** | On by default. Turn **off** "Confirm password" — the site uses magic links, there are no passwords. |
| **Google** | An OAuth client at <https://console.cloud.google.com> → APIs & Services → Credentials. Free. |
| **Discord** | An application at <https://discord.com/developers/applications> → OAuth2. Free. |

Both Google and Discord ask for a redirect URL. Use the one Supabase shows on
the provider page — it looks like `https://<project>.supabase.co/auth/v1/callback`.

Then Authentication → URL Configuration:
- **Site URL**: `https://mxtei.com`
- **Redirect URLs**: add `https://mxtei.com/portal/` and, for local testing,
  `http://localhost:3456/portal/`

## 4. Point the site at it

Project Settings → API. Copy **Project URL** and the **anon / public** key into
the `SUPABASE` block at the top of `docs/v2/assets/portal.js`.

> Use the **anon** key. Never the `service_role` key — that one bypasses Row
> Level Security and would expose every client's invoices to anyone who opened
> the page source. The anon key is designed to be public and is only safe
> because RLS is on, which is why step 2 comes first.

## 5. Add a client

Table Editor → `clients` → Insert row. The only field that matters is `email` —
it must match the address they sign in with. Then add rows to `projects`,
`time_entries` and `invoices` with that client's `id`.

When they sign up with that email, the trigger links their account automatically.
Anyone who signs up without a matching client row sees an empty portal telling
them to get in touch — they gain access to nothing.

## Checking it worked

Sign in as yourself with an email that has **no** client row. You should see the
"nothing linked to this address" message and no data at all. If you can see
another client's rows, stop and re-run `schema.sql` — RLS is not on.

## Where invoices come from

`invoices.pay_url` is what the **Pay** button in the portal opens. Paste the
Stripe Payment Link there, or a per-invoice Stripe invoice URL if you move to
Stripe Invoicing later. Leave it empty and the row shows without a Pay button.
