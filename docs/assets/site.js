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
     Same Formspree endpoint the current site uses. On failure we fall back to
     a mailto so a visitor is never left with a dead button. */
  var FORM_ID = "maqrngno";
  var MAILTO = "mxldisc@gmail.com,marcellszoke@icloud.com";

  function forms() {
    Array.prototype.forEach.call(document.querySelectorAll("form[data-mxform]"), function (form) {
      var msg = form.querySelector(".formmsg");
      var btn = form.querySelector(".send");
      var kind = form.getAttribute("data-mxform");   // "contact" | "waitlist"
      var sending = false;

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (sending) return;

        var data = {};
        Array.prototype.forEach.call(form.elements, function (el) {
          if (el.name) data[el.name] = el.value.trim();
        });
        if (!data.contact) { say("Add an email or Discord so I can reply.", "err"); return; }

        sending = true;
        if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
        say("", "");

        var who = data.name || "website";
        var subject = kind === "waitlist" ? "mxReach waitlist — " + who
                    : kind === "invoice"  ? "Invoice request — " + who
                    : kind === "referral" ? "Referral code request — " + who
                    : "New message from " + who;

        fetch("https://formspree.io/f/" + FORM_ID, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name || "",
            contact: data.contact,
            service: data.service || "",
            message: data.message || "(" + kind + " — no message)",
            _subject: subject
          })
        }).then(function (res) {
          if (!res.ok) throw new Error("bad status");
          form.reset();
          say(kind === "waitlist" ? "You're on the list — I'll email you when early access opens."
            : kind === "invoice"  ? "Got it — I'll send the invoice or payment link today."
            : kind === "referral" ? "Done — your referral code is on its way today."
            : "Message sent. I'll get back to you shortly.", "ok");
          if (btn) btn.textContent = kind === "waitlist" ? "You're on the list"
                                   : kind === "invoice"  ? "Request sent"
                                   : kind === "referral" ? "Code on its way" : "Sent";
        }).catch(function () {
          var body = "Reach me at: " + data.contact + "\n\n" + (data.message || "");
          say('Couldn\'t send just now — <a href="mailto:' + MAILTO +
              "?subject=" + encodeURIComponent(subject) +
              "&body=" + encodeURIComponent(body) + '">email me directly instead →</a>', "err");
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

  function init() {
    nav();
    serviceLinks();
    payLinks();
    particles();
    reveals();
    anchors();
    forms();
    if (window.mxFire) window.mxFire.start();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
