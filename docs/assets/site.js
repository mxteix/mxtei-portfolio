/* mxtei — page behaviour: particle layer, reveals, header-offset anchor scroll,
   and the contact / waitlist form. No framework, no build step. */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  PAYMENT LINKS — edit this and nothing else to turn on card payments.
   *
   *  Create a Payment Link in your Stripe dashboard (Payments → Payment
   *  Links) and paste the https://buy.stripe.com/... URL below. While it is
   *  empty, the "Pay by card" button falls back to the invoice form, so the
   *  page is never broken — it just asks you to send an invoice instead.
   *
   *  Card details are handled entirely on Stripe's hosted checkout. No card
   *  field is ever rendered on this site.
   * ------------------------------------------------------------------ */
  var PAY_LINKS = {
    stripe: "https://buy.stripe.com/5kQ9AT77ndGl3Wz4IHgQE00"
  };

  function payLinks() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-pay]"), function (el) {
      var url = PAY_LINKS[el.getAttribute("data-pay")];
      if (!url) return;                       // leave the in-page fallback alone
      el.href = url;
      el.rel = "noopener";
      el.target = "_blank";
    });
  }

  /* Clearance for the sticky header. Measured rather than hardcoded: the header
     is ~58px on desktop but taller on a narrow screen, and a fixed 68 would drop
     anchor targets underneath it. */
  function headerOffset() {
    var h = document.querySelector(".hdr");
    return (h ? h.getBoundingClientRect().height : 58) + 10;
  }

  /* ---- particle layer -------------------------------------------------- */
  /* Built in JS so the three pages share one source of truth and the markup
     stays readable. Purely decorative — nothing here is content. */
  var STREAKS = [
    { top:"-4%", w:170, h:1.6, head:5,   dur:34, delay:-3,  a:.85, glow:14, bright:true },
    { top:"6%",  w:120, h:1.2, head:4,   dur:52, delay:-19, a:.6,  glow:10, bright:false },
    { top:"18%", w:210, h:2,   head:6,   dur:26, delay:-11, a:.75, glow:18, bright:true },
    { top:"31%", w:90,  h:1,   head:3.5, dur:61, delay:-42, a:.5,  glow:8,  bright:false },
    { top:"44%", w:150, h:1.4, head:4.5, dur:41, delay:-27, a:.7,  glow:14, bright:true },
    { top:"58%", w:110, h:1.2, head:4,   dur:47, delay:-8,  a:.55, glow:10, bright:false }
  ];
  var FLIES = [
    { top:"12%", left:"8%",  path:"A", dur:68,  delay:-4,  size:3,   c:"#FFC08A", g:"10px 2px rgba(255,140,60,.7)",  pulse:7 },
    { top:"34%", left:"22%", path:"B", dur:84,  delay:-23, size:2.5, c:"#FFB067", g:"9px 2px rgba(255,120,45,.6)",   pulse:9 },
    { top:"66%", left:"14%", path:"C", dur:96,  delay:-41, size:3.5, c:"#FFD2A8", g:"12px 3px rgba(255,150,70,.65)", pulse:6 },
    { top:"22%", left:"48%", path:"B", dur:74,  delay:-12, size:2,   c:"#FF9A55", g:"8px 2px rgba(255,110,40,.55)",  pulse:11 },
    { top:"78%", left:"57%", path:"A", dur:102, delay:-58, size:3,   c:"#FFC08A", g:"10px 2px rgba(255,140,60,.6)",  pulse:8 },
    { top:"46%", left:"72%", path:"C", dur:88,  delay:-31, size:2.5, c:"#FFB067", g:"9px 2px rgba(255,130,50,.6)",   pulse:10 },
    { top:"8%",  left:"83%", path:"B", dur:110, delay:-7,  size:3,   c:"#FFD2A8", g:"11px 3px rgba(255,150,70,.6)",  pulse:7.5 },
    { top:"60%", left:"90%", path:"A", dur:79,  delay:-49, size:2,   c:"#FF9A55", g:"8px 2px rgba(255,110,40,.5)",   pulse:12 },
    { top:"88%", left:"33%", path:"C", dur:92,  delay:-17, size:3.5, c:"#FFC08A", g:"12px 3px rgba(255,140,60,.65)", pulse:6.5 },
    { top:"52%", left:"4%",  path:"B", dur:70,  delay:-36, size:2.5, c:"#FFB067", g:"9px 2px rgba(255,130,50,.55)",  pulse:9.5 },
    { top:"30%", left:"63%", path:"A", dur:118, delay:-63, size:2,   c:"#FFD2A8", g:"8px 2px rgba(255,150,70,.5)",   pulse:13 },
    { top:"72%", left:"42%", path:"C", dur:81,  delay:-26, size:3,   c:"#FFC08A", g:"10px 2px rgba(255,140,60,.6)",  pulse:8.5 }
  ];

  function particles() {
    var layer = document.querySelector(".particles");
    if (!layer) return;
    var html = "";
    STREAKS.forEach(function (s) {
      var tail = s.bright
        ? "rgba(255,176,103,0),rgba(255,170,95," + s.a + "),rgba(255,248,240,1)"
        : "rgba(255,150,70,0),rgba(255,160,90," + s.a + "),rgba(255,230,205,.8)";
      html += '<div class="streak" style="top:' + s.top + ';width:' + s.w + 'px;height:' + s.h + 'px;' +
              'background:linear-gradient(90deg,' + tail + ');' +
              'box-shadow:0 0 ' + s.glow + 'px rgba(255,140,60,.55);' +
              'animation-duration:' + s.dur + 's;animation-delay:' + s.delay + 's">' +
              '<i style="width:' + s.head + 'px;height:' + s.head + 'px;margin-top:' + (-s.head / 2) + 'px"></i></div>';
    });
    FLIES.forEach(function (f) {
      html += '<div class="fly" style="top:' + f.top + ';left:' + f.left + ';' +
              'animation-name:mxFly' + f.path + ';animation-duration:' + f.dur + 's;animation-delay:' + f.delay + 's">' +
              '<b style="width:' + f.size + 'px;height:' + f.size + 'px;background:' + f.c + ';' +
              'box-shadow:0 0 ' + f.g + ';animation-duration:' + f.pulse + 's"></b></div>';
    });
    layer.innerHTML = html;
  }

  /* ---- reveal on scroll ------------------------------------------------ */
  function reveals() {
    var nodes = document.querySelectorAll(".reveal");
    if (!nodes.length) return;

    function showAll() {
      Array.prototype.forEach.call(nodes, function (n) { n.classList.add("in"); });
    }
    if (!("IntersectionObserver" in window)) { showAll(); return; }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: .12, rootMargin: "0px 0px -8% 0px" });
    Array.prototype.forEach.call(nodes, function (n) { io.observe(n); });

    // Safety net: some contexts (background tab on load, print, embedded panes)
    // never deliver an intersection. Copy must never be left invisible.
    setTimeout(showAll, 2500);
  }

  /* ---- reviews rail + "view all" dialog -------------------------------- */
  function reviews() {
    var sec = document.getElementById("reviews");
    if (!sec) return;
    var rail = sec.querySelector(".quotes");
    var prev = sec.querySelector('[data-q="prev"]'), next = sec.querySelector('[data-q="next"]');
    var dlg = sec.querySelector(".qdlg"), all = sec.querySelector('[data-q="all"]');
    if (!rail) return;

    function step() {
      var card = rail.querySelector(".quote");
      return card ? card.getBoundingClientRect().width + 14 : rail.clientWidth * .8;
    }
    function sync() {
      var max = rail.scrollWidth - rail.clientWidth - 2;
      if (prev) prev.disabled = rail.scrollLeft <= 2;
      if (next) next.disabled = rail.scrollLeft >= max;
      rail.classList.toggle("at-end", rail.scrollLeft >= max);
    }
    function go(dir) {
      var n = Math.max(1, Math.floor(rail.clientWidth / step()));
      rail.scrollBy({ left: dir * n * step(), behavior: "smooth" });
    }
    if (prev) prev.addEventListener("click", function () { go(-1); });
    if (next) next.addEventListener("click", function () { go(1); });
    rail.addEventListener("scroll", sync, { passive: true });
    rail.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    });
    window.addEventListener("resize", sync);
    sync();

    if (!dlg || !all) return;
    var count = rail.querySelectorAll(".quote").length;
    all.textContent = "View all " + count;
    if (typeof dlg.showModal !== "function") { all.hidden = true; return; }
    var grid = dlg.querySelector(".qdlg-grid");
    all.addEventListener("click", function () {
      if (!grid.children.length) {
        Array.prototype.forEach.call(rail.querySelectorAll(".quote"), function (q) {
          grid.appendChild(q.cloneNode(true));
        });
      }
      dlg.showModal();
      document.body.classList.add("qlock");
      grid.scrollTop = 0;
    });
    dlg.addEventListener("close", function () { document.body.classList.remove("qlock"); });
    dlg.querySelector('[data-q="close"]').addEventListener("click", function () { dlg.close(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });   // backdrop
  }

  /* ---- anchor scroll with header offset --------------------------------
     scrollIntoView lands under the sticky header, so scroll by hand. */
  function anchors() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute("href").slice(1);
      if (!id) return;
      var el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      var top = el.getBoundingClientRect().top + window.scrollY - headerOffset();
      window.scrollTo({ top: top, behavior: "smooth" });
      if (history.replaceState) history.replaceState(null, "", "#" + id);
    });
    // deep link arriving from another page
    if (location.hash) {
      var el = document.getElementById(location.hash.slice(1));
      if (el) requestAnimationFrame(function () {
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - headerOffset());
      });
    }
  }

  /* ---- forms -----------------------------------------------------------
     Primary path: the Supabase "contact" function, which stores the submission
     and sends branded emails from mxtei (supabase/functions/contact).
     Fallbacks, in order, so a visitor is never left with a dead button:
       function unreachable / not deployed / server error  -> Formspree
       function stored it but couldn't email (emailed:false) -> also Formspree,
         so a lead is never silent
       Formspree fails too                                 -> mailto link   */
  var CONTACT_FN = "https://eqaxhjscluhnkbifrwqx.supabase.co/functions/v1/contact";
  // Public anon key (safe by design; the function is the only thing it can call here).
  var SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxYXhoanNjbHVobmtiaWZyd3F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1ODA1MzMsImV4cCI6MjEwNTE1NjUzM30.jjYyFY58Yj_Nz3JXMECjy67_RwE9iSrb745SPOkuVeY";
  var FORM_ID = "maqrngno";
  var MAILTO = "mxldisc@gmail.com,marcellszoke@icloud.com";

  var SUBJECT = { waitlist: "mxReach waitlist", invoice: "Invoice request",
                  referral: "Referral code request", contact: "New message" };
  var DONE = {
    waitlist: ["You're on the list — check your inbox for a confirmation.", "You're on the list"],
    invoice:  ["Got it — I'll send the invoice or payment link today.", "Request sent"],
    referral: ["Done — your six-digit code is on its way to your inbox.", "Code sent"],
    contact:  ["Message sent — I'll get back to you shortly.", "Sent"]
  };

  function viaFormspree(kind, data) {
    return fetch("https://formspree.io/f/" + FORM_ID, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name || "", contact: data.contact, service: data.service || "",
        referral_code: data.referral_code || "",
        message: data.message || "(" + kind + " — no message)",
        _subject: (SUBJECT[kind] || "New message") + " — " + (data.name || "website")
      })
    }).then(function (r) { if (!r.ok) throw new Error("formspree " + r.status); });
  }

  function viaFunction(kind, data) {
    return fetch(CONTACT_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON,
                 Authorization: "Bearer " + SUPABASE_ANON },
      body: JSON.stringify({ kind: kind, name: data.name || "", contact: data.contact,
        service: data.service || "", message: data.message || "",
        referral_code: data.referral_code || "",
        company_website: data.company_website || "" })
    });
  }

  function forms() {
    Array.prototype.forEach.call(document.querySelectorAll("form[data-mxform]"), function (form) {
      var msg = form.querySelector(".formmsg");
      var btn = form.querySelector(".send");
      var kind = form.getAttribute("data-mxform");
      var sending = false;

      // Honeypot: invisible to people, irresistible to form-filling bots.
      var hp = document.createElement("input");
      hp.type = "text"; hp.name = "company_website"; hp.tabIndex = -1;
      hp.autocomplete = "off"; hp.className = "hp"; hp.setAttribute("aria-hidden", "true");
      form.appendChild(hp);

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (sending) return;

        var data = {};
        Array.prototype.forEach.call(form.elements, function (el) {
          if (el.name) data[el.name] = el.value.trim();
        });
        if (!data.contact) { say("Add an email or Discord so I can reply.", "err"); return; }
        // The calendar's choice rides in the message, so every path carries it.
        if (data.dates) data.message = "When: " + data.dates + (data.message ? "\n\n" + data.message : "");
        delete data.dates;

        sending = true;
        if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
        say("", "");

        viaFunction(kind, data).then(function (res) {
          if (res.status === 429) { var rate = new Error("rate"); rate.rate = true; throw rate; }
          if (res.status === 400) {
            return res.json().catch(function () { return {}; }).then(function (j) {
              var bad = new Error("invalid");
              if (j && j.error === "email_required") bad.emailRequired = true; else bad.invalid = true;
              throw bad;
            });
          }
          if (!res.ok) return viaFormspree(kind, data);            // not deployed / server error
          return res.json().then(function (j) {
            if (j && j.emailed === false) return viaFormspree(kind, data).catch(function () {});
          });
        }, function () {
          return viaFormspree(kind, data);                          // network / CORS failure
        }).then(function () {
          form.reset();
          var d = DONE[kind] || DONE.contact;
          say(d[0], "ok");
          if (btn) btn.textContent = d[1];
        }).catch(function (err) {
          if (err && err.rate) {
            say("That's a lot of messages in a short time — try again in a few minutes.", "err");
          } else if (err && err.emailRequired) {
            say("Your code is sent by email, so I need an email address here.", "err");
          } else if (err && err.invalid) {
            say("Something in the form wasn't accepted — check your email or Discord and try again.", "err");
          } else {
            var body = "Reach me at: " + data.contact + "\n\n" + (data.message || "");
            say('Couldn\'t send just now — <a href="mailto:' + MAILTO +
                "?subject=" + encodeURIComponent(SUBJECT[kind] || "New message") +
                "&body=" + encodeURIComponent(body) + '">email me directly instead →</a>', "err");
          }
          if (btn) { btn.disabled = false; btn.textContent = btn.getAttribute("data-label") || "Send"; }
          sending = false;
        });
      });

      function say(text, cls) {
        if (!msg) return;
        msg.innerHTML = text;
        msg.className = "formmsg" + (cls ? " " + cls : "");
      }
    });
  }

  /* ---- nav: dropdowns + mobile drawer ---------------------------------- */
  function nav() {
    var drops  = [].slice.call(document.querySelectorAll(".drop"));
    var burger = document.querySelector(".burger");
    var drawer = document.querySelector(".drawer");

    function closeDrops(except) {
      drops.forEach(function (d) {
        if (d === except) return;
        d.classList.remove("open");
        var b = d.querySelector(".dropbtn");
        if (b) b.setAttribute("aria-expanded", "false");
      });
    }

    drops.forEach(function (d) {
      var btn = d.querySelector(".dropbtn");
      if (!btn) return;
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var open = d.classList.contains("open");
        closeDrops(d);
        d.classList.toggle("open", !open);
        btn.setAttribute("aria-expanded", String(!open));
      });
      // a chosen link should not leave the panel hanging open behind it
      d.querySelectorAll(".menu a").forEach(function (a) {
        a.addEventListener("click", function () { closeDrops(null); });
      });
    });

    function setDrawer(open) {
      if (!drawer || !burger) return;
      drawer.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", String(open));
      // stop the page scrolling behind the panel
      document.body.style.overflow = open ? "hidden" : "";
    }

    if (burger && drawer) {
      burger.addEventListener("click", function (e) {
        e.stopPropagation();
        setDrawer(!drawer.classList.contains("open"));
      });
      drawer.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function () { setDrawer(false); });
      });
    }

    document.addEventListener("click", function (e) {
      if (!e.target.closest(".drop")) closeDrops(null);
      if (drawer && drawer.classList.contains("open") &&
          !e.target.closest(".drawer") && !e.target.closest(".burger")) setDrawer(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var openDrop = document.querySelector(".drop.open");
      if (openDrop) {
        closeDrops(null);
        var b = openDrop.querySelector(".dropbtn");
        if (b) b.focus();                       // don't strand the keyboard user
      }
      if (drawer && drawer.classList.contains("open")) { setDrawer(false); burger.focus(); }
    });

    // leaving the narrow breakpoint with the drawer open would lock scroll forever
    if (window.matchMedia) {
      var mq = window.matchMedia("(max-width:860px)");
      var onChange = function (m) { if (!m.matches) setDrawer(false); };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  /* ---- service card -> contact form ------------------------------------
     Reading a rate and asking for that service should be one click, not a
     scroll and a retype. */
  function serviceLinks() {
    document.addEventListener("click", function (e) {
      var card = e.target.closest && e.target.closest("[data-service]");
      if (!card) return;
      var sel = document.getElementById("c-service");
      if (!sel) return;
      var want = card.getAttribute("data-service");
      Array.prototype.forEach.call(sel.options, function (o) {
        if (o.text === want) sel.value = o.value || o.text;
      });
    });
  }

  /* ---- referral codes ---------------------------------------------------
     Six digits. A ?ref=482917 link fills the code in automatically. Every code
     box on the page stays in sync, and the contact form and calculator both
     react to whether the code checks out.
     States: valid | invalid | unknown (couldn't reach the checker) | empty. */
  var refState = { code: "", state: "empty" };
  var refCache = {};
  var refTimer = null;

  function refBoxes() { return [].slice.call(document.querySelectorAll("[data-ref-input]")); }

  function paintRef(active) {
    var msg = { valid: ["Code applied — 15% off your first invoice.", "ok"],
                invalid: ["I can’t find that code. Check the six digits?", "err"],
                unknown: ["Saved — I’ll confirm it when I reply.", ""],
                checking: ["Checking…", ""],
                empty: ["", ""] }[refState.state] || ["", ""];
    var pretty = refState.code ? refState.code.replace(/(\d{3})(\d{3})/, "$1 $2") : "";
    refBoxes().forEach(function (box) {
      // The box being typed in keeps a partial code (just stripped of non-digits);
      // every other box mirrors the finished code, or clears with it.
      var shown = box === active
        ? (refState.code ? pretty : String(box.value || "").replace(/\D/g, "").slice(0, 6))
        : pretty;
      if (box.value !== shown) box.value = shown;
      box.classList.toggle("is-valid", refState.state === "valid");
      box.classList.toggle("is-invalid", refState.state === "invalid");
      var status = box.parentElement.querySelector("[data-ref-status]");
      if (status) { status.textContent = msg[0]; status.className = "ref-status" + (msg[1] ? " " + msg[1] : ""); }
    });
    document.dispatchEvent(new CustomEvent("mx:ref", { detail: { code: refState.code, state: refState.state } }));
  }

  function checkRef(code) {
    if (refCache[code]) { refState = { code: code, state: refCache[code] }; paintRef(); return; }
    fetch(CONTACT_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON,
                 Authorization: "Bearer " + SUPABASE_ANON },
      body: JSON.stringify({ action: "check", code: code })
    }).then(function (r) {
      if (!r.ok) throw new Error("check " + r.status);
      return r.json();
    }).then(function (j) {
      var state = j && j.valid ? "valid" : "invalid";
      refCache[code] = state;
      if (refState.code === code) { refState.state = state; paintRef(); }
    }).catch(function () {
      // Checker unreachable (not deployed yet, offline). Keep the code and let
      // Marcell confirm it rather than rejecting something that may be fine.
      if (refState.code === code) { refState.state = "unknown"; paintRef(); }
    });
  }

  function setRef(raw, active) {
    var code = String(raw || "").replace(/\D/g, "").slice(0, 6);
    refState = { code: code, state: code.length === 6 ? "checking" : "empty" };
    paintRef(active);
    clearTimeout(refTimer);
    if (code.length === 6) refTimer = setTimeout(function () { checkRef(code); }, 250);
  }

  function referralCodes() {
    var boxes = refBoxes();
    var fromUrl = "";
    try { fromUrl = new URLSearchParams(location.search).get("ref") || ""; } catch (e) { /* older browser */ }
    var stored = "";
    try { stored = sessionStorage.getItem("mx_ref") || ""; } catch (e) { /* private mode */ }

    boxes.forEach(function (box) {
      box.addEventListener("input", function () {
        setRef(box.value, box);
        try { sessionStorage.setItem("mx_ref", refState.code); } catch (e) { /* private mode */ }
      });
    });

    var initial = String(fromUrl || stored).replace(/\D/g, "").slice(0, 6);
    if (initial.length === 6) {
      setRef(initial);
      try { sessionStorage.setItem("mx_ref", initial); } catch (e) { /* private mode */ }
    }
  }

  /* ---- pricing calculator ----------------------------------------------
     Freelance work only: hourly or fixed-price. Subscriptions are mxReach's and
     live on its own page, never in here.
       hourly    one rate per service
       package   tiers C/B/A per service, plus S for companies (no price, talk)
     The referral toggle takes 15% off the first invoice. "Request this" hands
     the estimate to the contact form, on this page or, via sessionStorage, on
     the homepage. Reads window.MX_PRICING (assets/pricing.js). */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function pct(x) { return Math.round(x * 100) + "%"; }
  function setService(sel, text) {
    Array.prototype.forEach.call(sel.options, function (o) {
      if (o.text === text) sel.value = o.value || o.text;
    });
  }

  function calculators() {
    var P = window.MX_PRICING;
    if (!P) return;
    Array.prototype.forEach.call(document.querySelectorAll("[data-calc]"), function (root) {
      var q = function (s) { return root.querySelector(s); };
      var st = { mode: "hourly", svc: 0, hours: 10, tier: 1 };
      var sel = q('[data-f="service"]');
      var tabs = [].slice.call(root.querySelectorAll("[data-mode]"));
      var reqBtn = q("[data-calc-request]");

      function list() { return st.mode === "package" ? P.packages : P.hourly; }

      function fillServices() {
        var items = list();
        if (st.svc >= items.length) st.svc = 0;
        sel.innerHTML = items.map(function (it, i) {
          return '<option value="' + i + '">' + esc(it.name) + "</option>";
        }).join("");
        sel.value = String(st.svc);
      }

      // Keep the same service selected when switching between hourly and packages.
      function switchMode(mode) {
        if (mode === st.mode) return;
        var cur = list()[st.svc], id = cur ? cur.id : "";
        st.mode = mode;
        if (mode === "package" && id === "botsplus") id = "bots";
        var idx = list().map(function (x) { return x.id; }).indexOf(id);
        st.svc = idx < 0 ? 0 : idx;
        fillServices();
        render();
      }

      function renderTiers(item) {
        var box = q('[data-o="tiers"]');
        if (box.getAttribute("data-for") !== item.id) {
          box.setAttribute("data-for", item.id);
          var group = "tier-" + Math.random().toString(36).slice(2, 8);
          box.innerHTML = item.tiers.map(function (t, i) {
            var price = t.talk ? "Let’s talk" : (t.from ? "from " : "") + money(t.price);
            return '<label class="calc-tier' + (t.talk ? " is-s" : "") + '">' +
              '<input type="radio" name="' + group + '" value="' + i + '">' +
              '<span class="calc-tier-top"><em>Tier ' + esc(t.tier) + "</em><b>" + esc(price) + "</b></span>" +
              '<span class="calc-tier-name">' + esc(t.name) + "</span>" +
              '<span class="calc-tier-blurb">' + esc(t.blurb) + "</span></label>";
          }).join("");
        }
        Array.prototype.forEach.call(box.querySelectorAll("input"), function (r) {
          r.checked = Number(r.value) === st.tier;
        });
      }

      function render() {
        tabs.forEach(function (b) {
          var on = b.getAttribute("data-mode") === st.mode;
          b.setAttribute("aria-selected", String(on));
          b.tabIndex = on ? 0 : -1;
        });
        Array.prototype.forEach.call(root.querySelectorAll("[data-show]"), function (el) {
          el.hidden = el.getAttribute("data-show") !== st.mode;
        });

        var item = list()[st.svc];
        var lines = [], total = 0, from = false, talk = false, note = "", form = "", summary = "";

        if (st.mode === "hourly") {
          total = st.hours * item.rate;
          lines.push([st.hours + " h × " + money(item.rate) + "/h", money(total)]);
          note = "Estimate. The hours are agreed before work starts and billed against what’s logged.";
          form = item.form;
          summary = item.name + " — " + st.hours + " hours at " + money(item.rate) + "/h";
        } else {
          renderTiers(item);
          var t = item.tiers[st.tier] || item.tiers[0];
          form = t.form;
          if (t.talk) {
            talk = true;
            lines.push(["Tier S · " + t.name, "Let’s talk"]);
            note = "For companies we scope the work together first. Send me a message and I’ll reply to you personally.";
            summary = item.name + " — Tier S (company)";
          } else {
            total = t.price; from = t.from;
            lines.push(["Tier " + t.tier + " · " + t.name, (from ? "from " : "") + money(total)]);
            note = from ? "Starting price. The final quote depends on scope, and I confirm it before starting."
                        : "Fixed price for this scope, confirmed before I start.";
            summary = item.name + " — Tier " + t.tier + " (" + t.name + "), " + (from ? "from " : "") + money(total);
          }
        }

        var refField = q(".calc-ref");
        if (refField) refField.hidden = talk;      // nothing to discount until it's scoped
        var refApplies = !talk && (refState.state === "valid" || refState.state === "unknown");
        if (refApplies) {
          var save = total * P.referral.discount;
          var pending = refState.state === "unknown" ? " (to confirm)" : "";
          lines.push(["Referral " + refState.code.replace(/(\d{3})(\d{3})/, "$1 $2") +
                      " — " + pct(P.referral.discount) + " off first invoice" + pending,
                      "−" + money(save), true]);
          total -= save;
          summary += ", referral code " + refState.code;
        }

        q('[data-o="lines"]').innerHTML = lines.map(function (l) {
          return '<div class="calc-line' + (l[2] ? " is-save" : "") + '"><span>' + esc(l[0]) +
                 "</span><b>" + esc(l[1]) + "</b></div>";
        }).join("");
        q('[data-o="label"]').textContent = talk ? "Price" : "Estimated total";
        q('[data-o="total"]').textContent = talk ? "Let’s talk" : (from ? "from " : "") + money(total);
        q('[data-o="note"]').textContent = note;
        q('[data-o="hours"]').textContent = st.hours;
        root.classList.toggle("is-talk", talk);
        if (reqBtn) reqBtn.textContent = talk ? "Talk to me" : "Request this";

        root._quote = {
          service: form,
          text: talk
            ? "Company enquiry: " + summary + ". I'd like to talk about scope and pricing.\n\n"
            : "Calculator estimate: " + summary + "\nEstimated total: " + (from ? "from " : "") + money(total) + "\n\n"
        };
      }

      root.addEventListener("click", function (e) {
        var tab = e.target.closest && e.target.closest("[data-mode]");
        if (tab && root.contains(tab)) switchMode(tab.getAttribute("data-mode"));
      });
      // Arrow keys move between tabs, as a tablist should.
      root.querySelector('[role="tablist"]').addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        var i = tabs.map(function (b) { return b.getAttribute("data-mode"); }).indexOf(st.mode);
        var next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        switchMode(next.getAttribute("data-mode"));
        next.focus();
        e.preventDefault();
      });
      root.addEventListener("input", function (e) {
        if (e.target.getAttribute && e.target.getAttribute("data-f") === "hours") {
          st.hours = Number(e.target.value);
          render();
        }
      });
      root.addEventListener("change", function (e) {
        var t = e.target, f = t.getAttribute && t.getAttribute("data-f");
        if (f === "service") { st.svc = Number(t.value); render(); }
        else if (t.type === "radio") { st.tier = Number(t.value); render(); }
      });

      if (reqBtn) reqBtn.addEventListener("click", function () {
        var quote = root._quote;
        if (!quote) return;
        var fsel = document.getElementById("c-service"), msg = document.getElementById("c-msg");
        if (fsel && msg) {
          setService(fsel, quote.service);
          // never overwrite something the visitor typed themselves
          if (!msg.value || msg.getAttribute("data-from-calc")) {
            msg.value = quote.text;
            msg.setAttribute("data-from-calc", "1");
          }
        } else {
          try { sessionStorage.setItem("mx_quote", JSON.stringify(quote)); } catch (err) { /* private mode */ }
        }
      });

      document.addEventListener("mx:ref", render);

      fillServices();
      render();
    });
  }

  /* ---- mxReach billing toggle ------------------------------------------
     Monthly or annual. Annual is 12 months with two free (~17% off). Prices
     live in data attributes on each plan, so the page is correct without JS
     (it shows monthly and the toggle stays hidden). */
  function billingToggles() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-billing]"), function (wrap) {
      var buttons = [].slice.call(wrap.querySelectorAll("[data-period]"));
      var scope = wrap.parentElement;
      wrap.hidden = false;
      function apply(period) {
        buttons.forEach(function (b) {
          var on = b.getAttribute("data-period") === period;
          b.setAttribute("aria-pressed", String(on));
        });
        Array.prototype.forEach.call(scope.querySelectorAll("[data-monthly]"), function (plan) {
          var m = Number(plan.getAttribute("data-monthly")), y = Number(plan.getAttribute("data-annual"));
          var price = plan.querySelector(".price");
          if (period === "annual") {
            price.innerHTML = "<b>" + money(y) + "</b><span>/ year</span>" +
              '<small class="price-sub">' + money(y / 12) + "/mo &middot; save " + money(m * 12 - y) + "</small>";
          } else {
            price.innerHTML = "<b>" + money(m) + "</b><span>/ month</span>";
          }
        });
      }
      buttons.forEach(function (b) {
        b.addEventListener("click", function () { apply(b.getAttribute("data-period")); });
      });
      apply("monthly");
    });
  }

  // Arriving on the homepage from an estimate on another page.
  function prefillQuote() {
    var raw = null;
    try { raw = sessionStorage.getItem("mx_quote"); sessionStorage.removeItem("mx_quote"); } catch (e) { return; }
    if (!raw) return;
    var quote;
    try { quote = JSON.parse(raw); } catch (e) { return; }
    var sel = document.getElementById("c-service"), msg = document.getElementById("c-msg");
    if (sel) setService(sel, quote.service);
    if (msg && !msg.value) { msg.value = quote.text; msg.setAttribute("data-from-calc", "1"); }
  }

  /* ---- "when do you need it" calendar -----------------------------------
     A date picker inside the contact form. Pick one day, or a start and an
     end. Days Marcell is booked come from assets/availability.json and can't
     be picked. The choice travels in the hidden "dates" field and is folded
     into the message on submit, so it reaches the same inbox, database row
     and Formspree fallback as everything else; no server change needed.     */
  var MONTHS = ["January","February","March","April","May","June","July",
                "August","September","October","November","December"];
  var DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  function iso(d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function fromIso(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function fmtDay(d, withYear) {
    return DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3) +
      (withYear ? " " + d.getFullYear() : "");
  }

  function calendar() {
    var root = document.querySelector("[data-when]");
    if (!root) return;
    var grid = root.querySelector("[data-cal-grid]");
    var monthEl = root.querySelector("[data-cal-month]");
    var prev = root.querySelector("[data-cal-prev]");
    var next = root.querySelector("[data-cal-next]");
    var summary = root.querySelector("[data-cal-summary]");
    var clearBtn = root.querySelector("[data-cal-clear]");
    var flexible = root.querySelector("[data-cal-flexible]");
    var value = root.querySelector("[data-cal-value]");
    var form = root.closest("form");
    var HINT = summary.textContent;

    var today = new Date(); today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var busy = {};
    var lead = 2;
    var first = addDays(today, lead);
    var last = addDays(today, 365);
    var view = new Date(first.getFullYear(), first.getMonth(), 1);
    var start = null, end = null, focus = first;

    function isBusy(d) { return !!busy[iso(d)]; }
    function pickable(d) { return d >= first && d <= last && !isBusy(d); }

    function describe() {
      if (!start) return "";
      var s = fromIso(start), e = end ? fromIso(end) : null;
      if (!e || end === start) return fmtDay(s, true);
      var days = Math.round((e - s) / 864e5) + 1;
      return fmtDay(s, s.getFullYear() !== e.getFullYear()) + " → " + fmtDay(e, true) + " (" + days + " days)";
    }

    function sync() {
      var text = describe();
      var crossesBusy = false;
      if (start && end && end !== start) {
        for (var d = fromIso(start); d <= fromIso(end); d = addDays(d, 1)) if (isBusy(d)) { crossesBusy = true; break; }
      }
      summary.textContent = text
        ? (end ? text + "." : text + ". Pick an end day, or leave it as one day.") +
          (crossesBusy ? " I'm booked on some of those days, so it may run a little longer." : "")
        : HINT;
      summary.className = "cal-summary" + (text ? " set" : "");
      clearBtn.hidden = !text;
      value.value = (text || (flexible.checked ? "No fixed dates" : "")) +
        (text && flexible.checked ? " (flexible)" : "");
    }

    function render() {
      monthEl.textContent = MONTHS[view.getMonth()] + " " + view.getFullYear();
      prev.disabled = view <= new Date(first.getFullYear(), first.getMonth(), 1);
      next.disabled = new Date(view.getFullYear(), view.getMonth() + 1, 1) > last;
      grid.innerHTML = "";

      var offset = (view.getDay() + 6) % 7; // Monday first
      for (var i = 0; i < offset; i++) grid.appendChild(document.createElement("span"));

      var dim = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      var lo = start, hi = end || start;
      for (var day = 1; day <= dim; day++) {
        var d = new Date(view.getFullYear(), view.getMonth(), day);
        var key = iso(d);
        var b = document.createElement("button");
        b.type = "button";
        b.className = "cal-day";
        b.textContent = day;
        b.setAttribute("data-date", key);
        var label = fmtDay(d, true);
        if (isBusy(d)) { b.classList.add("is-busy"); label += ", booked"; }
        if (!pickable(d)) b.disabled = true;
        if (key === iso(today)) b.classList.add("is-today");
        if (lo && key === lo) b.classList.add("is-start");
        if (hi && key === hi) b.classList.add("is-end");
        if (lo && hi && key > lo && key < hi) b.classList.add("in-range");
        b.setAttribute("aria-pressed", lo && key >= lo && key <= hi ? "true" : "false");
        b.setAttribute("aria-label", label);
        b.tabIndex = key === iso(focus) ? 0 : -1;
        grid.appendChild(b);
      }
      // Keep one day reachable by Tab even when the focused one is off-screen.
      if (!grid.querySelector('[tabindex="0"]')) {
        var firstOn = grid.querySelector(".cal-day:not([disabled])");
        if (firstOn) firstOn.tabIndex = 0;
      }
    }

    function choose(key) {
      if (!start || end) { start = key; end = null; }
      else if (key < start) { start = key; }
      else { end = key; }
      focus = fromIso(key);
      render(); sync();
    }

    grid.addEventListener("click", function (e) {
      var b = e.target.closest(".cal-day");
      if (b && !b.disabled) choose(b.getAttribute("data-date"));
    });

    grid.addEventListener("keydown", function (e) {
      var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (!step) return;
      e.preventDefault();
      var d = addDays(focus, step);
      if (d < first || d > last) return;
      focus = d;
      if (d.getMonth() !== view.getMonth() || d.getFullYear() !== view.getFullYear()) {
        view = new Date(d.getFullYear(), d.getMonth(), 1);
      }
      render();
      var b = grid.querySelector('[data-date="' + iso(d) + '"]');
      if (b) b.focus();
    });

    prev.addEventListener("click", function () { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); });
    next.addEventListener("click", function () { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); });
    clearBtn.addEventListener("click", function () { start = end = null; render(); sync(); });
    flexible.addEventListener("change", sync);
    if (form) form.addEventListener("reset", function () {
      start = end = null;
      setTimeout(function () { flexible.checked = false; render(); sync(); }, 0);
    });

    render(); sync();

    fetch("assets/availability.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (a) {
        if (!a) return;
        if (typeof a.leadDays === "number" && a.leadDays >= 0) {
          lead = a.leadDays;
          first = addDays(today, lead);
          if (focus < first) focus = first;
        }
        (a.busy || []).forEach(function (b) {
          var from = fromIso(typeof b === "string" ? b : b.from);
          var to = fromIso(typeof b === "string" ? b : (b.to || b.from));
          for (var d = from, n = 0; d <= to && n < 400; d = addDays(d, 1), n++) busy[iso(d)] = true;
        });
        // Drop a selection that just became unavailable.
        if (start && !pickable(fromIso(start))) start = end = null;
        if (end && !pickable(fromIso(end))) end = null;
        render(); sync();
      })
      .catch(function () { /* without the file, every future day is pickable */ });
  }

  function init() {
    nav();
    serviceLinks();
    referralCodes();
    calculators();
    billingToggles();
    prefillQuote();
    payLinks();
    particles();
    reveals();
    reviews();
    anchors();
    calendar();
    forms();
    if (window.mxFire) window.mxFire.start();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
