# mxReach setup: first run on your Mac

About 45 minutes in total. You'll fill in **one file**:
`mxreach/.env.local`. It's already made, its secrets are already generated, and it has
6 empty lines. Each step below says which line to fill.

---

## 1. Supabase · ~10 min

Open your mxReach project at supabase.com/dashboard.

**a. Create the database** (2 min)
1. Left menu → **SQL Editor** → **New query**.
2. Open `mxreach/supabase/setup.sql`, select all, copy, paste, click **Run**.
3. You should see "Success. No rows returned". Run it only once.

**b. Make it invite-only** (1 min)
1. **Authentication** → **Sign In / Providers**.
2. Turn **off** "Allow new users to sign up" → **Save**.

**c. Add yourself** (1 min)
1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Email: the address you'll sign in with. Password: anything (it's never used).
3. Tick **Auto Confirm User** → **Create user**.

**d. Allow the login link to come back to your Mac** (1 min)
1. **Authentication** → **URL Configuration**.
2. Site URL: `http://localhost:3100`
3. Redirect URLs → **Add URL**: `http://localhost:3100/**` → **Save**.

**e. Copy the keys into `.env.local`** (2 min)
1. **Project Settings** (gear icon) → **Data API**: copy the **Project URL**
   → paste after `NEXT_PUBLIC_SUPABASE_URL=`
2. **Project Settings** → **API Keys**:
   - **publishable** key (or **anon** on the Legacy tab) → after `NEXT_PUBLIC_SUPABASE_ANON_KEY=`
   - **secret** key (or **service_role** on the Legacy tab) → after `SUPABASE_SERVICE_ROLE_KEY=`

> Login emails use Supabase's built-in sender for now. It only delivers to your
> own Supabase account address and about 2 an hour, which is fine for testing.
> Before inviting anyone else, switch on custom SMTP with the same Resend
> settings as mxtei.com (Authentication → Emails → SMTP Settings).

---

## 2. Google Cloud (Gmail) · ~20 min

Go to console.cloud.google.com and sign in with the Gmail you'll send from.

**a. Project + Gmail API** (3 min)
1. Top bar project picker → **New project** → name `mxReach` → **Create** → select it.
2. Search bar: **Gmail API** → **Enable**.

**b. Consent screen** (5 min)
1. Search bar: **Google Auth Platform** → **Get started**.
2. App name: `mxReach` · Support email: yours → **Next**.
3. Audience: **External** → **Next**.
4. Contact email: yours → **Next** → agree → **Create**.

**c. Allow yourself in** (1 min)
1. **Audience** → **Test users** → **Add users** → your Gmail → **Save**.

**d. Permissions** (3 min)
1. **Data Access** → **Add or remove scopes**.
2. Scroll to **Manually add scopes**, paste both lines:
   ```text
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/gmail.metadata
   ```
3. **Add to table** → **Update** → **Save**.

**e. The client** (3 min)
1. **Clients** → **Create client**.
2. Application type: **Web application** · Name: `mxReach local`.
3. Authorized redirect URIs → **Add URI**: `http://localhost:3100/api/gmail/callback`
4. **Create**. Copy into `.env.local`:
   - **Client ID** → after `GOOGLE_CLIENT_ID=`
   - **Client secret** → after `GOOGLE_CLIENT_SECRET=`

---

## 3. Hunter · ~5 min

1. Sign up at hunter.io (free plan).
2. Dashboard → **API** (or **API keys**) → copy the key → after `HUNTER_API_KEY=`

---

## 4. Tell Claude "done" · then ~30 min together

Claude starts the app and walks through the first real run with you:

1. Sign in with the address from 1c.
2. **Settings**: your name and postal address (every email must include it).
3. **Mailboxes** → **Connect Gmail**. Google shows "app isn't verified": that's expected
   while it's in testing. Click **Continue**.
4. **Contacts**: add a second address of yours → **Verify**.
5. **Sequences** → new from a preset → replace every `[[...]]` → pick the mailbox → **Go live**
   → enroll the contact.
6. The email arrives. Reply to it, and the follow-ups stop.
7. Click the unsubscribe link in the footer.

---

### If something goes wrong

| You see | Fix |
|---|---|
| The "isn't configured yet" page | A line in `.env.local` is empty; restart the app after filling it |
| No login email | Check spam; with the built-in sender only your Supabase account email works |
| Login link says "expired" | Redirect URL from 1d is missing, or you opened it in another browser |
| Google says "access blocked" | You're not on the Test users list (2c) |
| Mailboxes says "needs both permissions" | Reconnect, and leave both boxes ticked on Google's screen |

*For maintainers: after changing a migration, run `npm run setup-sql`. `npm test`
fails until `supabase/setup.sql` matches the migrations.*
