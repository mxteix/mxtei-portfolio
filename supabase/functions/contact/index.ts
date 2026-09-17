// mxtei contact endpoint — Supabase Edge Function (Deno).
//
// Receives the four site forms (contact, waitlist, invoice, referral). Every
// submission is stored first, so a lead is never lost even if email fails. Then
// Marcell gets a formatted notification and the visitor gets a branded
// confirmation from mxtei.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function ->
// Via editor -> name it "contact" -> paste this file. See supabase/EMAIL-SETUP.md.
//
// Secrets (Edge Functions -> Secrets):
//   RESEND_API_KEY  resend.com -> API Keys
//   FROM_EMAIL      mxtei <hello@mxtei.com>   (domain must be verified in Resend)
//   NOTIFY_EMAIL    where enquiries go        (default marcellszoke@icloud.com)
//   IP_SALT         any long random string    (IPs are hashed, never stored raw)
//   DAILY_CAP       optional, default 45      (Resend free tier is 100 emails/day)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// No imports on purpose: it pastes straight into the dashboard editor, and Node
// imports the same renderer to build the Supabase auth templates, so the login
// emails and the form emails can never drift apart visually.

// deno-lint-ignore no-explicit-any
declare const Deno: any;

export type Kind = "contact" | "waitlist" | "invoice" | "referral";
export interface Submission {
  kind: Kind; name: string; contact: string; service: string; message: string; honeypot: string;
  referral_code: string;   // a code the visitor is using, not one they own
}

/** What the notification email should mention about referral codes. */
export interface NotifyInfo {
  issued?: string;
  used?: { code: string; valid: boolean; ownerName?: string; self?: boolean };
}

const SITE = "https://mxtei.com";
const LOGO = SITE + "/assets/email/logo.png";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const ALLOWED_ORIGINS = ["https://mxtei.com", "https://www.mxtei.com", "http://localhost:3456"];

function env(name: string, fallback = ""): string {
  return typeof Deno !== "undefined" ? (Deno.env.get(name) ?? fallback) : fallback;
}

/* ============================================================== rendering === */

export function esc(v: unknown): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(v ?? "").replace(/[&<>"']/g, (c) => map[c]);
}

/** Only a plain first name is ever echoed back to a visitor's inbox. Anything
 *  else is dropped, so the confirmation can't be used to mail arbitrary text. */
export function safeFirstName(name: string): string {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return /^[\p{L}][\p{L}'’-]{0,29}$/u.test(first) ? first : "";
}

export function isEmail(v: string): boolean {
  return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(v);
}

/* ---------------------------------------------------------- referral codes --
   Six digits, emailed to the person who asks. One code per email address:
   asking again returns the same code, so codes can't be farmed. */

/** "482 917" or " 482917 " -> "482917"; anything else -> "". */
export function normalizeCode(v: unknown): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits.length === 6 ? digits : "";
}

export function formatCode(code: string): string {
  return code.slice(0, 3) + " " + code.slice(3);
}

/** Reject codes a person would guess: all one digit, or a run like 123456. */
export function isGuessable(code: string): boolean {
  if (/^(\d)\1{5}$/.test(code)) return true;
  const n = code.split("").map(Number);
  const run = (step: number) => n.every((d, i) => i === 0 || d === (n[i - 1] + step + 10) % 10);
  return run(1) || run(-1);
}

/** Uniform over 000000-999999 (rejection sampling, so no modulo bias). */
export function generateCode(): string {
  const buf = new Uint32Array(1);
  const limit = Math.floor(4294967296 / 1000000) * 1000000;
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] >= limit) continue;
    const code = String(buf[0] % 1000000).padStart(6, "0");
    if (!isGuessable(code)) return code;
  }
}

interface Layout {
  title: string; preheader: string; eyebrow: string; heading: string; bodyHtml: string; footnote?: string;
}

/** Every Layout field is HTML: callers escape user content before passing it in. */
export function layout(o: Layout): string {
  const foot = o.footnote
    ? `<p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#6B625C;">${o.footnote}</p>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${o.title}</title>
</head>
<body style="margin:0;padding:0;background:#F3EFEA;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${o.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3EFEA;">
<tr><td align="center" style="padding:32px 14px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="background:#0B0A09;border-radius:16px 16px 0 0;padding:26px 36px;">
<a href="${SITE}" style="text-decoration:none;"><img src="${LOGO}" width="180" height="40" alt="mxtei" style="display:block;border:0;outline:none;"></a>
</td></tr>
<tr><td style="height:3px;line-height:3px;font-size:0;background:#FF5A1F;background-image:linear-gradient(90deg,#FF4D0F,#FF9A12,#FFD84A);">&nbsp;</td></tr>
<tr><td style="background:#FFFFFF;padding:38px 36px 34px;font-family:${FONT};color:#3A3431;">
<p style="margin:0 0 10px;font-size:13px;line-height:1.4;font-weight:600;color:#C2410C;">${o.eyebrow}</p>
<h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:#0B0A09;">${o.heading}</h1>
${o.bodyHtml}
</td></tr>
<tr><td style="background:#FFFFFF;border-top:1px solid #EDE7E0;border-radius:0 0 16px 16px;padding:22px 36px 28px;font-family:${FONT};">
${foot}<p style="margin:0;font-size:12px;line-height:1.7;color:#736A63;">mxtei &middot; Freelance builds, community growth &amp; mxReach<br>
<a href="${SITE}" style="color:#736A63;text-decoration:underline;">mxtei.com</a> &middot; <a href="mailto:marcellszoke@icloud.com" style="color:#736A63;text-decoration:underline;">marcellszoke@icloud.com</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function para(html: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3A3431;">${html}</p>`;
}

export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px;">
<tr><td align="center" bgcolor="#FF5A1F" style="border-radius:999px;">
<a href="${href}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:15px;line-height:1;font-weight:700;color:#0B0A09;text-decoration:none;border-radius:999px;">${label}</a>
</td></tr></table>`;
}

function fallbackLink(href: string): string {
  return `<p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#736A63;">Button not working? Paste this link into your browser:<br><a href="${href}" style="color:#C2410C;word-break:break-all;">${href}</a></p>`;
}

/** Supabase auth emails. The {{ }} placeholders are Supabase's own template tags. */
export function authTemplates() {
  const url = "{{ .ConfirmationURL }}";
  const email = "{{ .Email }}";
  return {
    magicLink: {
      subject: "Your mxtei sign-in link",
      html: layout({
        title: "Sign in to mxtei",
        preheader: "Your sign-in link for the mxtei client portal. It works once and expires after an hour.",
        eyebrow: "Client portal",
        heading: "Sign in to mxtei",
        bodyHtml: para("Use the button below to sign in to your client portal &mdash; your projects, logged hours and invoices are all in one place.")
          + button(url, "Sign in to your portal") + fallbackLink(url),
        footnote: `This link was requested for ${email}. It works once and expires after an hour. If you didn&rsquo;t ask to sign in, you can safely ignore this email &mdash; nobody can get into your portal without it.`,
      }),
    },
    confirmSignup: {
      subject: "Confirm your email for mxtei",
      html: layout({
        title: "Confirm your email",
        preheader: "One click to confirm your email and open your mxtei client portal.",
        eyebrow: "Client portal",
        heading: "Confirm your email",
        bodyHtml: para("Confirm this address to open your mxtei client portal. Once you&rsquo;re in, you&rsquo;ll see your projects, the hours logged against them and every invoice.")
          + button(url, "Confirm and sign in") + fallbackLink(url),
        footnote: `This confirmation was requested for ${email}. If you didn&rsquo;t sign up, ignore this email and nothing will happen.`,
      }),
    },
  };
}

const KIND: Record<Kind, { label: string; subject: string; heading: string }> = {
  contact:  { label: "Project enquiry",  subject: "New project enquiry",         heading: "New project enquiry" },
  waitlist: { label: "mxReach waitlist", subject: "New mxReach waitlist signup", heading: "New waitlist signup" },
  invoice:  { label: "Invoice request",  subject: "New invoice request",         heading: "Invoice request" },
  referral: { label: "Referral program", subject: "New referral code request",   heading: "Referral code request" },
};

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim().slice(0, 150);

function detailRow(label: string, valueHtml: string): string {
  return `<tr><td style="padding:10px 0;border-bottom:1px solid #F0EBE5;font-size:13px;color:#736A63;width:110px;vertical-align:top;">${label}</td>`
    + `<td style="padding:10px 0;border-bottom:1px solid #F0EBE5;font-size:15px;color:#191614;vertical-align:top;">${valueHtml}</td></tr>`;
}

/** Email to Marcell. User content is escaped; nothing here reaches the visitor. */
export function notificationEmail(s: Submission, at: Date, info: NotifyInfo = {}) {
  const k = KIND[s.kind];
  const who = s.name || s.contact;
  const contactHtml = isEmail(s.contact)
    ? `<a href="mailto:${esc(s.contact)}" style="color:#C2410C;">${esc(s.contact)}</a>` : esc(s.contact);
  let codeRow = "";
  if (info.used) {
    const u = info.used;
    codeRow = detailRow("Referral code", u.self
      ? `<b style="color:#B45309;">${esc(formatCode(u.code))} &mdash; this is their own code</b>`
      : u.valid
        ? `<b>${esc(formatCode(u.code))}</b> &mdash; valid${u.ownerName ? ", from " + esc(u.ownerName) : ""}`
        : `${esc(formatCode(u.code))} &mdash; <b style="color:#B45309;">not found</b>`);
  }
  if (info.issued) codeRow += detailRow("Code issued", "<b>" + esc(formatCode(info.issued)) + "</b>");
  const rows = [
    s.name ? detailRow("Name", esc(s.name)) : "",
    detailRow("Contact", contactHtml),
    s.service ? detailRow("Service", esc(s.service)) : "",
    codeRow,
    detailRow("Received", esc(at.toUTCString())),
  ].join("");
  const message = s.message
    ? `<div style="margin:22px 0 0;padding:18px 20px;background:#F7F4F0;border-left:3px solid #FF5A1F;border-radius:8px;font-size:15px;line-height:1.65;color:#191614;">${esc(s.message).replace(/\n/g, "<br>")}</div>` : "";
  const first = safeFirstName(s.name);
  const action = isEmail(s.contact)
    ? button(`mailto:${esc(s.contact)}?subject=${encodeURIComponent("Re: your mxtei " + k.label.toLowerCase())}`,
        `Reply to ${esc(first || "them")}`)
    : para(`<span style="color:#736A63;">They left a non-email contact &mdash; reply on Discord or wherever they indicated.</span>`);

  const html = layout({
    title: esc(k.heading),
    preheader: esc(oneLine(`${k.label} from ${who}`)),
    eyebrow: esc(k.label),
    heading: esc(k.heading),
    bodyHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT};">${rows}</table>${message}${action}`,
    footnote: `Submitted through the ${esc(k.label.toLowerCase())} form on mxtei.com. Every submission is also saved in Supabase &rarr; form_submissions.`,
  });
  const text = [
    k.heading, "",
    s.name ? `Name:     ${s.name}` : "", `Contact:  ${s.contact}`,
    s.service ? `Service:  ${s.service}` : "", `Received: ${at.toUTCString()}`,
    s.message ? `\n${s.message}` : "",
  ].filter((l) => l !== "").join("\n");
  return { subject: oneLine(`${k.subject} — ${who}`), html, text };
}

/** Email to the visitor. Fixed copy only; the one echoed value is a validated first name. */
export function confirmationEmail(s: Submission) {
  const first = safeFirstName(s.name);
  const g = first ? `, ${esc(first)}` : "";
  const why = (form: string) =>
    `You&rsquo;re receiving this because this address was entered in the ${form} on mxtei.com. If that wasn&rsquo;t you, ignore this email &mdash; you won&rsquo;t hear from me again.`;

  const copy: Record<Kind, { subject: string; eyebrow: string; heading: string; body: string[]; cta: [string, string]; form: string }> = {
    contact: {
      subject: "Thanks — I’ve got your message", eyebrow: "Message received", heading: "Thanks for getting in touch",
      body: [`Thanks${g}. I read every enquiry myself and usually reply within a few hours.`,
             `If it&rsquo;s urgent, Discord is the fastest way to reach me: <strong>@ttwb</strong>.`],
      cta: [SITE + "/#work", "See my recent work"], form: "contact form",
    },
    waitlist: {
      subject: "You’re on the mxReach waitlist", eyebrow: "mxReach", heading: "You&rsquo;re on the list",
      body: [`Thanks${g} &mdash; you&rsquo;re on the waitlist for mxReach, my outreach tool for reaching sponsors, businesses and partners.`,
             `I&rsquo;ll email you the moment early access opens. There&rsquo;s no charge and nothing to do until then.`],
      cta: [SITE + "/mxreach/", "Read about mxReach"], form: "mxReach waitlist form",
    },
    invoice: {
      subject: "Invoice request received", eyebrow: "Billing", heading: "Your invoice is on its way",
      body: [`Thanks${g}. I&rsquo;ll send your invoice or payment link today.`,
             `You can pay by card, PayPal, Wise, Revolut, bank transfer or crypto &mdash; whichever suits you.`],
      cta: [SITE + "/pay/", "See payment options"], form: "invoice request form",
    },
    referral: {
      subject: "Your referral code is on its way", eyebrow: "Referral program", heading: "Referral code requested",
      body: [`Thanks${g}. I&rsquo;ll send your personal referral code today.`,
             `Anyone who uses it gets 15% off their first invoice, and you get 15% credit on your next one once theirs is paid.`],
      cta: [SITE + "/referral/#terms", "Read the terms"], form: "referral form",
    },
  };
  const c = copy[s.kind];
  const plain = (h: string) => h.replace(/<[^>]+>/g, "").replace(/&rsquo;/g, "’").replace(/&mdash;/g, "—").replace(/&amp;/g, "&");
  const html = layout({
    title: c.heading, preheader: plain(c.body[0]), eyebrow: c.eyebrow, heading: c.heading,
    bodyHtml: c.body.map(para).join("") + button(c.cta[0], c.cta[1]), footnote: why(c.form),
  });
  const text = [plain(c.heading), "", ...c.body.map(plain), "", `${c.cta[1]}: ${c.cta[0]}`, "", "— Marcell, mxtei.com"].join("\n");
  return { subject: c.subject, html, text };
}

/** The code itself, emailed to whoever asked for it. Never shown on the site,
 *  so receiving it proves they own the address. */
export function referralCodeEmail(s: Submission, code: string) {
  const first = safeFirstName(s.name);
  const g = first ? `, ${esc(first)}` : "";
  const link = SITE + "/?ref=" + code + "#contact";
  const digits = code.split("").map(function (d) {
    return `<td style="padding:0 4px;"><div style="width:46px;height:58px;line-height:58px;text-align:center;`
      + `background:#F7F4F0;border:1px solid #E7DFD6;border-radius:10px;font-family:${FONT};`
      + `font-size:28px;font-weight:700;color:#0B0A09;">${d}</div></td>`;
  }).join("");

  const html = layout({
    title: "Your mxtei referral code",
    preheader: "Your referral code is " + formatCode(code) + ". Share it and you both save 15%.",
    eyebrow: "Referral program",
    heading: "Your referral code",
    bodyHtml:
      para(`Thanks${g}. Here&rsquo;s your code &mdash; it&rsquo;s yours, it doesn&rsquo;t expire, and you can share it as often as you like.`)
      + `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 10px;"><tr>${digits}</tr></table>`
      + `<p style="margin:0 0 20px;font-size:13px;color:#736A63;font-family:${FONT};">Or share this link, which fills the code in for them:<br>`
      + `<a href="${link}" style="color:#C2410C;word-break:break-all;">mxtei.com/?ref=${code}</a></p>`
      + para(`<b>They get 15% off their first invoice.</b> They enter the code before we agree scope.`)
      + para(`<b>You get 15% credit on your next invoice</b>, once theirs is paid.`)
      + button(SITE + "/referral/#terms", "Read the terms"),
    footnote: `You&rsquo;re receiving this because this address requested a referral code on mxtei.com. Asking again sends you this same code.`,
  });
  const text = [
    "Your mxtei referral code", "", formatCode(code), "",
    "Share this link, which fills it in for them:", link, "",
    "They get 15% off their first invoice. You get 15% credit on your next one, once theirs is paid.",
    "Terms: " + SITE + "/referral/#terms", "", "— Marcell, mxtei.com",
  ].join("\n");
  return { subject: "Your mxtei referral code: " + formatCode(code), html, text };
}

/* ================================================================ handler === */

export function validate(b: Record<string, unknown> | null): { value: Submission } | { error: string } {
  const kind = String(b?.kind ?? "");
  if (!(kind in KIND)) return { error: "kind" };
  const clip = (v: unknown, n: number) => String(v ?? "").replace(/ /g, "").trim().slice(0, n);
  const contact = clip(b?.contact, 200);
  if (!contact) return { error: "contact" };
  return { value: {
    kind: kind as Kind, name: clip(b?.name, 80), contact, service: clip(b?.service, 80),
    message: clip(b?.message, 5000), honeypot: clip(b?.company_website, 200),
    referral_code: normalizeCode(b?.referral_code),
  } };
}

function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function dbHeaders(): Record<string, string> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  // Legacy keys are JWTs and go in Authorization too; newer sb_secret_ keys must not.
  return key.startsWith("eyJ") ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function countSince(minutes: number, ipHash?: string): Promise<number> {
  const p = new URLSearchParams({ select: "id", created_at: `gte.${new Date(Date.now() - minutes * 60000).toISOString()}` });
  if (ipHash) p.set("ip_hash", `eq.${ipHash}`);
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/form_submissions?${p}`,
    { headers: { ...dbHeaders(), Prefer: "count=exact", Range: "0-0" } });
  const total = Number((r.headers.get("content-range") ?? "").split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

async function store(s: Submission, ipHash: string | null): Promise<string> {
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/form_submissions?select=id`, {
    method: "POST",
    headers: { ...dbHeaders(), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ kind: s.kind, name: s.name || null, contact: s.contact,
      service: s.service || null, message: s.message || null, ip_hash: ipHash,
      referral_code: s.referral_code || null }),
  });
  if (!r.ok) throw new Error(`store failed ${r.status} ${await r.text()}`);
  return (await r.json())[0].id;
}

interface CodeRow { code: string; owner_email: string; owner_name: string | null }

async function lookupCode(code: string): Promise<CodeRow | null> {
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/referral_codes?select=code,owner_email,owner_name&code=eq.${encodeURIComponent(code)}&limit=1`,
    { headers: dbHeaders() });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows.length ? rows[0] : null;
}

/** The code for this email address, creating one the first time. Retries on the
 *  rare collision with an existing code. */
async function ensureCode(email: string, name: string): Promise<string | null> {
  const owner = email.toLowerCase();
  const url = env("SUPABASE_URL");
  const existing = await fetch(`${url}/rest/v1/referral_codes?select=code&owner_email=eq.${encodeURIComponent(owner)}&limit=1`,
    { headers: dbHeaders() });
  if (existing.ok) {
    const rows = await existing.json();
    if (rows.length) return rows[0].code;
  }
  for (let i = 0; i < 6; i++) {
    const code = generateCode();
    const r = await fetch(`${url}/rest/v1/referral_codes`, {
      method: "POST",
      headers: { ...dbHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ code, owner_email: owner, owner_name: name || null }),
    });
    if (r.ok) return code;
    if (r.status === 409) {
      // Either the code or the owner already exists; if the owner, use theirs.
      const again = await fetch(`${url}/rest/v1/referral_codes?select=code&owner_email=eq.${encodeURIComponent(owner)}&limit=1`,
        { headers: dbHeaders() });
      if (again.ok) { const rows = await again.json(); if (rows.length) return rows[0].code; }
      continue;
    }
    console.error("code insert", r.status, await r.text());
    return null;
  }
  return null;
}

async function countChecks(minutes: number, ipHash: string): Promise<number> {
  const p = new URLSearchParams({ select: "id", ip_hash: `eq.${ipHash}`,
    created_at: `gte.${new Date(Date.now() - minutes * 60000).toISOString()}` });
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/code_checks?${p}`,
    { headers: { ...dbHeaders(), Prefer: "count=exact", Range: "0-0" } });
  const total = Number((r.headers.get("content-range") ?? "").split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

async function logCheck(ipHash: string | null): Promise<void> {
  await fetch(`${env("SUPABASE_URL")}/rest/v1/code_checks`, {
    method: "POST",
    headers: { ...dbHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ ip_hash: ipHash }),
  });
}

async function markEmailed(id: string): Promise<void> {
  await fetch(`${env("SUPABASE_URL")}/rest/v1/form_submissions?id=eq.${id}`, {
    method: "PATCH", headers: { ...dbHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ emailed: true }),
  });
}

async function send(to: string, m: { subject: string; html: string; text: string }, replyTo?: string): Promise<boolean> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("FROM_EMAIL", "mxtei <hello@mxtei.com>"), to: [to],
      subject: m.subject, html: m.html, text: m.text, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!r.ok) console.error("resend", r.status, await r.text());
  return r.ok;
}

async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get("origin") ?? "";
  const h = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ error: "method" }, 405, h);
  if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "origin" }, 403, h);

  let body: Record<string, unknown> | null = null;
  try { body = await req.json(); } catch { return json({ error: "json" }, 400, h); }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ipHash = ip ? await sha256(env("IP_SALT") + ip) : null;

  // Is this code real? Answers yes/no only — never who owns it. Rate limited so
  // nobody can work through the million possible codes.
  if (body && body.action === "check") {
    const code = normalizeCode(body.code);
    if (!code) return json({ valid: false }, 200, h);
    if (ipHash && await countChecks(10, ipHash) >= 20) return json({ error: "rate" }, 429, h);
    await logCheck(ipHash);
    return json({ valid: !!(await lookupCode(code)) }, 200, h);
  }

  const v = validate(body);
  if ("error" in v) return json(v, 400, h);
  const s = v.value;

  // Bots fill the hidden field. Tell them it worked and do nothing.
  if (s.honeypot) return json({ ok: true, emailed: true }, 200, h);

  // A referral code can only be delivered by email, so we need one.
  if (s.kind === "referral" && !isEmail(s.contact)) return json({ error: "email_required" }, 400, h);

  if (ipHash && await countSince(10, ipHash) >= 5) return json({ error: "rate" }, 429, h);

  const id = await store(s, ipHash);       // stored before any email is attempted

  const info: NotifyInfo = {};
  if (s.kind === "referral") {
    const issued = await ensureCode(s.contact, s.name);
    if (issued) info.issued = issued;
  }
  if (s.referral_code) {
    const row = await lookupCode(s.referral_code);
    info.used = {
      code: s.referral_code, valid: !!row, ownerName: row?.owner_name ?? undefined,
      self: !!row && row.owner_email.toLowerCase() === s.contact.toLowerCase(),
    };
  }

  let emailed = false;
  const cap = Number(env("DAILY_CAP", "45")) || 45;
  if (env("RESEND_API_KEY") && await countSince(1440) <= cap) {
    const notifyTo = env("NOTIFY_EMAIL", "marcellszoke@icloud.com");
    emailed = await send(notifyTo, notificationEmail(s, new Date(), info), isEmail(s.contact) ? s.contact : undefined);
    if (isEmail(s.contact)) {
      const toVisitor = info.issued ? referralCodeEmail(s, info.issued) : confirmationEmail(s);
      await send(s.contact, toVisitor, notifyTo);   // replies reach Marcell
    }
    if (emailed) await markEmailed(id);
  }
  // emailed:false tells the site to also notify through Formspree, so a lead
  // is never silent when Resend isn't configured or the daily cap is hit.
  return json({ ok: true, emailed }, 200, h);
}

if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve((req: Request) => handle(req).catch((e: unknown) => {
    console.error(e);
    return json({ error: "server" }, 500, cors(req.headers.get("origin") ?? ""));
  }));
}
