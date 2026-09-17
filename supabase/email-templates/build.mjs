// Regenerates the Supabase auth email templates from the same renderer the
// contact function uses, so login emails and form emails always match.
//   node supabase/email-templates/build.mjs [previewDir]
// Needs Node 23.6+ (runs the .ts file directly).
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { authTemplates, notificationEmail, confirmationEmail } from "../functions/contact/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const t = authTemplates();
writeFileSync(join(here, "magic-link.html"), t.magicLink.html);
writeFileSync(join(here, "confirm-signup.html"), t.confirmSignup.html);
console.log("wrote magic-link.html      subject:", t.magicLink.subject);
console.log("wrote confirm-signup.html  subject:", t.confirmSignup.subject);

const out = process.argv[2];
if (out) {
  mkdirSync(out, { recursive: true });
  const demoUrl = "https://eqaxhjscluhnkbifrwqx.supabase.co/auth/v1/verify?token=demo&type=magiclink";
  const fill = (h) => h.replaceAll("{{ .ConfirmationURL }}", demoUrl).replaceAll("{{ .Email }}", "client@example.com");
  writeFileSync(join(out, "auth-magic-link.html"), fill(t.magicLink.html));
  const sample = { kind: "contact", name: "Anna Kovacs", contact: "anna@example.com",
    service: "Discord server setup", message: "Hi Marcell,\nWe run a 12k gaming server and need roles, onboarding and a ticket bot.\nBudget around $600.", honeypot: "" };
  writeFileSync(join(out, "notify-contact.html"), notificationEmail(sample, new Date("2026-09-17T10:24:00Z")).html);
  for (const kind of ["contact", "waitlist", "invoice", "referral"])
    writeFileSync(join(out, `confirm-${kind}.html`), confirmationEmail({ ...sample, kind }).html);
  console.log("previews ->", out);
}
