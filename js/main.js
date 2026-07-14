const config = window.SITE_CONFIG;

function iconSvg(type) {
  const icons = {
    outreach: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    bots: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>`,
    payments: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
    ai: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93L12 22l-.75-12.07A4.001 4.001 0 0 1 12 2z"/></svg>`,
    code: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    design: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>`,
  };
  return icons[type] || icons.code;
}

function paymentAbbrev(icon) {
  const map = { paypal: "PP", crypto: "₿", revolut: "R", other: "+" };
  return map[icon] || "→";
}

function starsHtml(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  let html = "";
  for (let i = 0; i < full; i++) html += `<span class="star full">★</span>`;
  if (half) html += `<span class="star half">★</span>`;
  const empty = 5 - full - (half ? 1 : 0);
  for (let i = 0; i < empty; i++) html += `<span class="star empty">★</span>`;
  return html;
}

function avatarInitials(name) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function populateSite() {
  document.title = `${config.brand} — ${config.title}`;

  document.querySelectorAll("[data-brand]").forEach((el) => {
    el.textContent = config.brand;
  });

  document.querySelectorAll("[data-fullname]").forEach((el) => {
    el.textContent = config.fullName;
  });

  document.querySelectorAll("[data-tagline]").forEach((el) => {
    el.textContent = config.tagline;
  });

  document.querySelectorAll("[data-motto]").forEach((el) => {
    el.textContent = config.motto;
  });

  const emailsContainer = document.getElementById("emails-list");
  if (emailsContainer) {
    emailsContainer.innerHTML = config.emails
      .map(
        (email) =>
          `<a href="mailto:${email}?subject=Project%20inquiry%20—%20mxtei" class="email-link">${email}</a>`
      )
      .join("");
  }

  const mailtoLinks = document.querySelectorAll("[data-mailto]");
  mailtoLinks.forEach((el) => {
    el.href = `mailto:${config.primaryEmail}?subject=Custom%20request%20—%20mxtei`;
  });

  const statsRow = document.getElementById("hero-stats");
  if (statsRow) {
    statsRow.innerHTML = config.stats
      .map(
        (s) => `
      <div class="stat-item">
        <div class="stat-label">${s.label}</div>
        <div class="stat-value">${s.value}</div>
      </div>`
      )
      .join("");
  }

  const capabilitiesGrid = document.getElementById("capabilities-grid");
  if (capabilitiesGrid) {
    capabilitiesGrid.innerHTML = config.capabilities
      .map(
        (cap) => `
      <article class="capability-card reveal color-${cap.color}">
        <div class="capability-icon">${iconSvg(cap.icon)}</div>
        <h3>${cap.title}</h3>
        <p>${cap.description}</p>
      </article>`
      )
      .join("");
  }

  const skillsCloud = document.getElementById("skills-cloud");
  if (skillsCloud) {
    skillsCloud.innerHTML = config.skills
      .map((skill) => `<span class="skill-tag">${skill}</span>`)
      .join("");
  }

  const reviewsGrid = document.getElementById("reviews-grid");
  if (reviewsGrid) {
    reviewsGrid.innerHTML = config.reviews
      .map(
        (r) => `
      <article class="review-card reveal">
        <div class="review-header">
          <div class="review-avatar" aria-hidden="true">${avatarInitials(r.name)}</div>
          <div>
            <strong class="review-name">${r.name}</strong>
            <span class="review-role">${r.role}</span>
          </div>
          <div class="review-rating" aria-label="${r.rating} out of 5 stars">${starsHtml(r.rating)}</div>
        </div>
        <p class="review-text">"${r.text}"</p>
        <span class="review-project">${r.project}</span>
      </article>`
      )
      .join("");
  }

  const avgRating =
    config.reviews.reduce((sum, r) => sum + r.rating, 0) / config.reviews.length;
  const avgEl = document.getElementById("avg-rating");
  if (avgEl) avgEl.textContent = avgRating.toFixed(1);

  const paymentOptions = document.getElementById("payment-options");
  if (paymentOptions) {
    paymentOptions.innerHTML = config.payments
      .map(
        (p) => `
      <a href="${p.href}" class="payment-option">
        <div class="payment-icon">${paymentAbbrev(p.icon)}</div>
        <div>
          <strong>${p.label}</strong>
          <span>${p.description}</span>
        </div>
      </a>`
      )
      .join("");
  }

  const footerSocial = document.getElementById("footer-social");
  if (footerSocial) {
    footerSocial.innerHTML = config.social
      .map(
        (s) =>
          `<a href="${s.href}" ${s.href.startsWith("http") ? 'target="_blank" rel="noopener noreferrer"' : ""}>${s.label}${s.handle ? ` <span>${s.handle}</span>` : ""}</a>`
      )
      .join("");
  }

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

function initTheme() {
  const stored = localStorage.getItem("mxtei-theme");
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  const theme = stored || (prefersLight ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", theme);
  updateThemeMeta(theme);

  const toggle = document.getElementById("theme-toggle");
  toggle?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("mxtei-theme", next);
    updateThemeMeta(next);
    window.dispatchEvent(new Event("themechange"));
  });
}

function updateThemeMeta(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "light" ? "#faf5ff" : "#08060f";
  const toggle = document.getElementById("theme-toggle");
  if (toggle) toggle.setAttribute("aria-label", `Switch to ${theme === "light" ? "dark" : "light"} mode`);
}

function initNav() {
  const nav = document.querySelector(".nav");
  const toggle = document.querySelector(".menu-toggle");
  const links = document.querySelector(".nav-links");

  window.addEventListener("scroll", () => {
    nav.classList.toggle("scrolled", window.scrollY > 20);
  });

  toggle?.addEventListener("click", () => {
    links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", links.classList.contains("open") ? "true" : "false");
  });

  links?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => links.classList.remove("open"));
  });
}

function initReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("visible");
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -30px 0px" }
  );

  const observeAll = () => {
    document.querySelectorAll(".reveal:not(.visible)").forEach((el) => observer.observe(el));
  };

  observeAll();
  setTimeout(observeAll, 100);
}

function initMarquee() {
  const track = document.getElementById("marquee-track");
  if (!track || !config.skills) return;
  const items = [...config.skills, ...config.skills];
  track.innerHTML = items.map((s) => `<span>${s}</span>`).join("");
}

populateSite();
initTheme();
initNav();
initReveal();
initMarquee();
