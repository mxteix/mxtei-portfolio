# Branded emails — setup

Makes every email from the site come from **mxtei &lt;hello@mxtei.com&gt;** with the
branded design: login links, signup confirmations, and the replies to anyone who
uses a form. About 30 minutes, mostly waiting for DNS.

Nothing breaks while this is half-done. Until the function is deployed, the forms
keep using Formspree automatically.

---

## Part 1 — Resend (the sending service)

1. Sign up at **resend.com** (free: 3,000 emails a month, 100 a day).
2. **Domains → Add domain** → type `mxtei.com` → region **EU (Ireland)**.
3. Resend now shows a short list of DNS records. Keep that tab open.

## Part 2 — Namecheap (prove you own the domain)

1. Namecheap → **Domain List** → **Manage** next to mxtei.com → **Advanced DNS**.
2. For each record Resend showed you, click **Add New Record** and copy it across.
   In the **Host** box, type only the part *before* `.mxtei.com`
   (for example `send`, or `resend._domainkey`).
3. Also add this one (it helps your emails avoid spam folders):
   - Type **TXT**, Host `_dmarc`, Value `v=DMARC1; p=none;`

> ⚠️ **Do not change or delete** the existing records on host `@` — the MX records
> and the `v=spf1 include:spf.efwd...` TXT. Those are what forward email to your inbox.
>
> ⚠️ **If Namecheap won't let you add the MX record** (it may hide the MX option while
> "Mail Settings" is set to *Email Forwarding*): **stop and tell me.** Don't switch
> Mail Settings to fix it — that would turn off your email forwarding. There's a
> clean way around it.

4. Back in Resend, click **Verify**. DNS can take a few minutes to an hour.
5. When it says **Verified**: **API Keys → Create API key** → permission
   *Sending access* → domain `mxtei.com`. Copy the key (starts `re_`). You only see it once.

## Part 3 — Supabase

**Store every form submission**

1. **SQL Editor → New query** → paste `supabase/migrations/002_form_submissions.sql` → **Run**.

**Deploy the email function**

2. **Edge Functions → Deploy a new function → Via Editor**.
3. Name it exactly `contact`. Delete the sample code, paste all of
   `supabase/functions/contact/index.ts`, click **Deploy**.
4. **Edge Functions → Secrets** (or *Manage secrets*) → add these four:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | the `re_...` key from Part 1 |
| `FROM_EMAIL` | `mxtei <hello@mxtei.com>` |
| `NOTIFY_EMAIL` | `marcellszoke@icloud.com` |
| `IP_SALT` | any long random text, 40+ characters — just mash the keyboard |

**Make login emails come from mxtei**

5. **Authentication → Emails → SMTP Settings** → turn on **custom SMTP**:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | the same `re_...` key |
| Sender email | `hello@mxtei.com` |
| Sender name | `mxtei` |

6. **Authentication → Emails → Templates**:
   - **Magic Link** — Subject `Your mxtei sign-in link`, body: paste `supabase/email-templates/magic-link.html`
   - **Confirm signup** — Subject `Confirm your email for mxtei`, body: paste `supabase/email-templates/confirm-signup.html`

## Part 4 — Check it

1. Go to **mxtei.com/login** and request a link to your own email.
   It should arrive from **mxtei**, with the dark header and orange button.
2. Submit the contact form on **mxtei.com** with your own email.
   You should get **two** emails: the enquiry notification, and the visitor confirmation.
3. **Table Editor → form_submissions** should show that submission.

If step 2 only produces a plain Formspree email, the function isn't reachable yet —
check it's named exactly `contact` and that the secrets are saved.

---

## Good to know

- **Replies.** When a visitor replies to their confirmation, it goes to your iCloud
  address, not `hello@`. Login emails come *from* `hello@mxtei.com` — if you want
  replies to those too, add a Namecheap email forward for `hello@`.
- **Daily limit.** Resend's free tier is 100 emails a day, and each form submission
  sends two. The function stops emailing after 45 submissions a day, but still
  **saves every one** and lets Formspree notify you, so no lead is lost.
- **Abuse protection.** Five submissions per visitor per 10 minutes, a hidden bot
  trap, and the confirmation email never repeats what a visitor typed — so the
  form can't be used to send spam to other people.
- **Editing the design.** Change `supabase/functions/contact/index.ts`, then run
  `node supabase/email-templates/build.mjs` to regenerate the two login templates
  so they stay matched. Re-paste whatever changed.
- **mxReach waitlist.** Everyone who joins is in `form_submissions` where
  `kind = 'waitlist'`.
