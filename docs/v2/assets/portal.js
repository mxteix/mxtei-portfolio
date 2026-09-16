/* mxtei client portal — Supabase auth + read-only project/invoice views.
   Loaded only by /login/ and /portal/. */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  SUPABASE — fill these two in to turn the portal on.
   *
   *  Supabase dashboard → Project Settings → API
   *    url      = "Project URL"
   *    anonKey  = the "anon / public" key (NOT the service_role key)
   *
   *  The anon key is meant to be public — it is safe in this file ONLY
   *  because every table has Row Level Security on (see supabase/schema.sql).
   *  Never paste the service_role key here; it bypasses RLS entirely.
   *
   *  While these are empty both pages show a "not set up yet" notice
   *  instead of a login form that cannot work.
   * ------------------------------------------------------------------ */
  var SUPABASE = {
    url:     "https://eqaxhjscluhnkbifrwqx.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxYXhoanNjbHVobmtiaWZyd3F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1ODA1MzMsImV4cCI6MjEwNTE1NjUzM30.jjYyFY58Yj_Nz3JXMECjy67_RwE9iSrb745SPOkuVeY"
  };

  var configured = !!(SUPABASE.url && SUPABASE.anonKey);
  var sb = null;

  function client() {
    if (!configured) return null;
    if (!sb) {
      if (!window.supabase || !window.supabase.createClient) return null;
      sb = window.supabase.createClient(SUPABASE.url, SUPABASE.anonKey);
    }
    return sb;
  }

  function el(id) { return document.getElementById(id); }
  function show(node, on) { if (node) node.hidden = !on; }

  function notice(node, text, kind) {
    if (!node) return;
    node.textContent = text;
    node.className = "formmsg" + (kind ? " " + kind : "");
  }

  function money(amount, currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency", currency: currency || "USD", maximumFractionDigits: 2
      }).format(amount);
    } catch (e) { return (currency || "USD") + " " + Number(amount).toFixed(2); }
  }

  function date(d) {
    if (!d) return "—";
    try {
      return new Date(d + "T00:00:00").toLocaleDateString(undefined,
        { year: "numeric", month: "short", day: "numeric" });
    } catch (e) { return d; }
  }

  /* ---- login ----------------------------------------------------------- */
  function initLogin() {
    var wrap = el("login-card");
    if (!wrap) return;

    if (!configured) {
      show(el("login-unconfigured"), true);
      show(el("login-ready"), false);
      return;
    }
    show(el("login-unconfigured"), false);
    show(el("login-ready"), true);

    var c = client();
    if (!c) { notice(el("login-msg"), "Couldn't load the sign-in library. Refresh and try again.", "err"); return; }

    // already signed in? go straight through
    c.auth.getSession().then(function (r) {
      if (r && r.data && r.data.session) location.replace("../portal/");
    });

    var redirect = new URL("../portal/", location.href).href;

    Array.prototype.forEach.call(document.querySelectorAll("[data-oauth]"), function (btn) {
      btn.addEventListener("click", function () {
        notice(el("login-msg"), "Opening " + btn.getAttribute("data-oauth") + "…", "");
        c.auth.signInWithOAuth({
          provider: btn.getAttribute("data-oauth"),
          options: { redirectTo: redirect }
        }).then(function (r) {
          if (r.error) notice(el("login-msg"), r.error.message, "err");
        });
      });
    });

    var form = el("magic-form");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = el("magic-email").value.trim();
      if (!email) { notice(el("login-msg"), "Enter the email address you gave me.", "err"); return; }
      var btn = form.querySelector(".send");
      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
      c.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirect } })
        .then(function (r) {
          if (r.error) {
            notice(el("login-msg"), r.error.message, "err");
            if (btn) { btn.disabled = false; btn.textContent = "Email me a link"; }
          } else {
            notice(el("login-msg"), "Check your inbox — the sign-in link is on its way.", "ok");
            if (btn) btn.textContent = "Link sent";
          }
        });
    });
  }

  /* ---- portal ---------------------------------------------------------- */
  function initPortal() {
    var root = el("portal");
    if (!root) return;

    if (!configured) { show(el("portal-unconfigured"), true); show(el("portal-loading"), false); return; }
    var c = client();
    if (!c) { show(el("portal-unconfigured"), true); show(el("portal-loading"), false); return; }

    var signOut = el("signout");
    if (signOut) signOut.addEventListener("click", function () {
      c.auth.signOut().then(function () { location.replace("../login/"); });
    });

    c.auth.getSession().then(function (r) {
      var session = r && r.data && r.data.session;
      if (!session) { location.replace("../login/"); return; }
      load(c, session);
    });
  }

  function load(c, session) {
    Promise.all([
      c.from("clients").select("id,name,company,email").maybeSingle(),
      c.from("projects").select("id,name,status,hourly_rate,currency,started_on").order("started_on", { ascending: false }),
      c.from("project_totals").select("project_id,hours,value,last_worked_on"),
      c.from("invoices").select("number,amount,currency,status,issued_on,due_on,paid_on,pay_url").order("issued_on", { ascending: false })
    ]).then(function (res) {
      var err = res.find(function (r) { return r.error; });
      if (err) {
        show(el("portal-loading"), false);
        show(el("portal-error"), true);
        var e = el("portal-error-msg");
        if (e) e.textContent = err.error.message;
        return;
      }
      render(res[0].data, res[1].data || [], res[2].data || [], res[3].data || [], session);
    });
  }

  function render(clientRow, projects, totals, invoices, session) {
    show(el("portal-loading"), false);

    var who = el("portal-who");
    if (who) {
      var name = (clientRow && (clientRow.name || clientRow.company)) ||
                 (session.user && session.user.email) || "there";
      who.textContent = name;
    }

    // Someone signed up whose email isn't on any client record yet.
    if (!clientRow) { show(el("portal-empty"), true); return; }
    show(el("portal-body"), true);

    var byProject = {};
    totals.forEach(function (t) { byProject[t.project_id] = t; });

    var hours = totals.reduce(function (a, t) { return a + Number(t.hours || 0); }, 0);
    var open  = invoices.filter(function (i) { return i.status === "unpaid"; });
    var owed  = open.reduce(function (a, i) { return a + Number(i.amount || 0); }, 0);
    var cur   = (invoices[0] && invoices[0].currency) || (projects[0] && projects[0].currency) || "USD";

    setStat("stat-projects", projects.filter(function (p) { return p.status === "active"; }).length);
    setStat("stat-hours", hours.toFixed(hours % 1 ? 1 : 0));
    setStat("stat-owed", money(owed, cur));

    var plist = el("project-list");
    if (plist) {
      plist.innerHTML = projects.length ? projects.map(function (p) {
        var t = byProject[p.id] || {};
        return '<div class="prow">' +
          '<div class="pmain"><b>' + esc(p.name) + '</b>' +
            '<span class="pstatus ' + p.status + '">' + p.status + '</span></div>' +
          '<div class="pmeta">' +
            '<span><i>Hours</i>' + Number(t.hours || 0) + '</span>' +
            '<span><i>Rate</i>' + (p.hourly_rate ? money(p.hourly_rate, p.currency) + '/hr' : '—') + '</span>' +
            '<span><i>Last worked</i>' + date(t.last_worked_on) + '</span>' +
          '</div></div>';
      }).join("") : '<p class="pempty">No projects yet.</p>';
    }

    var ilist = el("invoice-list");
    if (ilist) {
      ilist.innerHTML = invoices.length ? invoices.map(function (i) {
        var pay = i.status === "unpaid" && i.pay_url
          ? '<a class="cta solid ipay" href="' + esc(i.pay_url) + '" target="_blank" rel="noopener">Pay</a>' : "";
        return '<div class="irow">' +
          '<div class="imain"><b>' + esc(i.number) + '</b>' +
            '<span class="istatus ' + i.status + '">' + i.status + '</span></div>' +
          '<div class="imeta">' +
            '<span><i>Amount</i>' + money(i.amount, i.currency) + '</span>' +
            '<span><i>Issued</i>' + date(i.issued_on) + '</span>' +
            '<span><i>' + (i.status === "paid" ? "Paid" : "Due") + '</i>' +
              date(i.status === "paid" ? i.paid_on : i.due_on) + '</span>' +
          '</div>' + pay + '</div>';
      }).join("") : '<p class="pempty">No invoices yet.</p>';
    }
  }

  function setStat(id, v) { var n = el(id); if (n) n.textContent = v; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function start() { initLogin(); initPortal(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
