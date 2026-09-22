# mxReach — build plan

Everything decided as of 2026-09-22, before any product code exists.
Not published: the live site is `docs/`, this folder is repo-only.

---

## 1. What it is

An outreach tool that finds the right contacts, writes the first message, and follows
up until someone replies. Sold as a subscription. Marcell's freelance services are a
separate business with separate pricing (hourly / fixed-price) — never mix the two.

**Audience is broad, not just Discord/dev:** music artists, video creators, streamers,
community owners, startup founders, agencies. Anyone who needs to reach sponsors,
partners, businesses or clients.

**Status:** not launched. The site markets it as waitlist-only with planned pricing.
Nothing on the site may claim a working signup or take money for it.

## 2. Pricing (set by Marcell)

| Plan | Monthly | Annual | Seats | Inboxes | New contacts/mo |
|---|---|---|---|---|---|
| Pro | $29 | $290 | 1 | 2 | 200 |
| Max | $49 | $490 | 1 | 5 | 400 |
| Team | $119 | $1,190 | 3 (+$35) | 15 | 1,000 |
| Company | talk to Marcell | — | custom | custom | custom |

- Annual = 12 months with two free (~17% off), inside the 15–20% band Marcell asked for.
- Contact top-ups: **500 for $25** ($0.05 each, ~5x cost). Expected to become a real
  profit line as customers scale.
- No free trial that allows sending — cold-outreach tools attract spammers and one bad
  account damages shared sending reputation. Card up front, or a money-back guarantee.
- Founding-member offer (Pro $199/yr, Max $349/yr for the first 100 waitlist members)
  is **proposed, not approved**. Don't publish it.

## 3. Unit economics

Margins hold at roughly 70% at ~$0.015 per contact found:

| Plan | Price | Est. cost | Margin |
|---|---|---|---|
| Pro | $29 | ~$8 | ~72% |
| Max | $49 | ~$15 | ~70% |
| Team | $119 | ~$37 | ~69% |

**Buy contact data, don't build sourcing to save money.** Wholesale enrichment APIs are
~$0.007–0.02 per email (Prospeo, Findymail, LeadMagic, Hunter — checked Sept 2026).
The $0.10–0.20 figures are *retail top-ups* inside platforms like Apollo, not what an
API integration costs. Building custom sourcing would cost 60–80 hours (~$4–6k of
Marcell's billable time) to save ~$0.005/contact: it repays only after ~1M contacts.

**Timing: buy after, never before.** Free tiers during the build; pay-as-you-go at
launch; subscriptions bill in advance so revenue arrives before data cost. Avoid
prepaid credit packs until match rates are known.

## 4. Architecture

**One product, one codebase.** Not separate versions per audience — that multiplies
auth, billing, inbox, deliverability and support for one person, and fragments the
positioning. Audience differences are data and copy, not code:

- **Finders** (pluggable): company-domain enrichment API; public-profile crawler; more later.
- **Presets** (config rows, not forks): "Video creators", "Music artists", "Startup
  founders", "Community owners" — each picks which finders run, what to extract, and
  which message templates to start from.

**Contact cascade**, stopping at the first hit:

1. Has a company domain → enrichment API (~$0.01)
2. No domain → crawl their public presence (site, link-in-bio, YouTube About,
   IG contact button) for a *published business* address (~free)
3. Verify before sending (~$0.001, non-negotiable for deliverability)
4. Cache, shared across customers — repeat lookups are free, so average cost falls
   with usage. (Mind GDPR: deletion and suppression must reach the cache.)

**Sending: customers connect their own mailboxes** (Gmail/Outlook OAuth), and mxReach
sends as them. Cold outreach must **never** go through mxtei.com or the Resend account —
transactional providers prohibit cold email, and it would burn the sending reputation
the invoices, login links and referral codes depend on. This is why "connected inboxes"
is a plan limit.

**Deliverability is the hard part**, not the sequencing logic: inbox rotation, warm-up,
per-inbox daily caps, bounce/spam monitoring, accurate reply detection so follow-ups
really stop.

## 5. Compliance stance

**Email is the only channel we automate sending on.**

- **Social = research + human-sent drafts.** Find the right person and their published
  business contact, then email them. mxReach may draft a DM and queue it; the human sends it.
- **No selfbots, no unofficial APIs, no detection evasion.** Automating Discord user
  accounts gets them terminated; Instagram/LinkedIn cold DM automation gets accounts
  restricted and vendors sued. The ban lands on the customer, who then blames mxReach —
  and Marcell's first customers come from his own communities.
- Stripe can also drop merchants whose product depends on violating platform terms.
- Stick to contact details **published for business contact**. Build unsubscribe
  handling and a suppression list from the start. Marcell is an EU business; some EU
  countries require consent even for B2B email.

The site copy already matches this ("Email first, social as backup"; Max/Team list
"Social research + drafted DMs"). Don't let the product drift away from it.

## 6. Second module: inbound automation (agreed "soon", not yet scoped)

Discord bots and **Instagram comment-triggered replies** — someone comments on a post
and gets an automatic DM. This is Meta's officially sanctioned **private reply**
(one DM per comment, within 7 days), the mechanic ManyChat is built on.

Why it may be worth shipping *before* outbound: no contact-data cost, no deliverability
work, no ban risk, demo-able immediately, and Marcell already builds this for clients by
hand. It can run on his own accounts to drive mxReach waitlist signups.

Should be a **second module of the same platform** (shared accounts, billing, inbox,
templates), not a separate app.

Obstacle: Instagram needs a Meta app, business verification and App Review for
`instagram_manage_messages` (days-to-weeks queue, demo video required), plus the
customer connecting an IG Professional account linked to a Facebook Page. **Submit for
review early** and build the Discord side while waiting — Discord needs no approval
until a bot is in 75+ servers. Competitors ManyChat/Chatfuel sit at ~$15–30/month, so
price accordingly; the edge is Marcell's standing in these communities, not features.

Open question for Marcell: sell it to clients, run it on his own accounts for mxtei, or both.

## 7. Launch positioning

Support every audience, but **market to one first**: sponsors and partnerships for
creators and communities. That is where Marcell has proof no competitor can copy —
1M+ members reached, 270k+ followers, 30+ partnerships closed. Startup/B2B outreach is
the most crowded corner (Instantly, Smartlead, Apollo) and shouldn't lead the story.

Waitlist signups collect in Supabase: `form_submissions` where `kind = 'waitlist'`.

## 8. First build slice

A thin slice that works end to end, not breadth:

1. Data model: customers, campaigns, contacts, sequences
2. One preset, finder cascade running on free credits
3. Verification before anything sends
4. Sequence engine with stop-on-reply
5. One connected mailbox sending a real email

Then: social drafts, A/B tests, team seats, inbound module.

**Measure early:** take ~50 real targets from each audience (artists, video creators,
startup founders) and record the hit rate of each cascade branch. That single number
decides whether bought data is enough or whether the niche needs custom sourcing —
and if it does, that's differentiation (data Apollo doesn't have), not cost saving.

## 9. Existing infrastructure it can reuse

Already live and working (see `supabase/`):

- Supabase project `eqaxhjscluhnkbifrwqx` — Postgres, auth (email magic links), RLS
- Edge function `contact` — a working pattern for validation, rate limiting, hashed
  IPs, honeypot, and Resend sending
- Branded email templates + renderer in `supabase/functions/contact/index.ts`
- Stripe account with a live payment link (subscriptions not set up yet — mxReach plans
  would be the first real use of Stripe subscriptions)
- Client portal at mxtei.com/portal with read-only RLS
