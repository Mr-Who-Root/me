(() => {
  "use strict";

  let DATA = null;

  // ---------------- utils ----------------

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  function renderInline(text) {
    let t = esc(text);
    t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*(.+?)\*/g, "<em>$1</em>");
    return t;
  }

  function renderBullets(text) {
    if (!text) return "";
    const lines = String(text).split("\n").map((l) => l.trim()).filter(Boolean);
    let html = "";
    let inList = false;
    for (const line of lines) {
      const bullet = line.match(/^[-*]\s*(.+)$/);
      if (bullet) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${renderInline(bullet[1])}</li>`;
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<p>${renderInline(line)}</p>`;
      }
    }
    if (inList) html += "</ul>";
    return html;
  }

  function slugify(s) {
    return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function socialUrl(platform, username) {
    const p = String(platform).toLowerCase();
    if (p === "linkedin") return `https://linkedin.com/in/${username}`;
    if (p === "github") return `https://github.com/${username}`;
    if (p === "twitter" || p === "x") return `https://x.com/${username}`;
    return username;
  }

  // ---------------- hero: per-character split for the stagger-in animation ----------------

  function splitHeroTitle(el, text) {
    el.innerHTML = "";
    let i = 0;
    text.split(" ").forEach((word, wi, arr) => {
      const wordSpan = document.createElement("span");
      wordSpan.className = "word";
      [...word].forEach((ch) => {
        const charSpan = document.createElement("span");
        charSpan.className = "char";
        charSpan.style.setProperty("--i", i++);
        charSpan.textContent = ch;
        wordSpan.appendChild(charSpan);
      });
      el.appendChild(wordSpan);
      if (wi < arr.length - 1) el.appendChild(document.createTextNode(" "));
    });
  }

  function buildMarquee(track, items) {
    const strip = items.map((t) => `<span class="marquee-item"><span class="dot">&#9670;</span>${esc(t)}</span>`).join("");
    // duplicated once so the -50% translateX loop is seamless
    track.innerHTML = strip + strip;
  }

  // ---------------- section renderers ----------------

  function renderAbout(container) {
    const p = DATA.personalInfo;
    const roles = (DATA.experience || []).length;
    const projects = (DATA.projects || []).length;
    const certs = (DATA.customSections || []).reduce((n, s) => n + (s.items ? s.items.length : 0), 0);

    container.innerHTML = `
      <div class="about-summary" data-reveal>
        <p>${renderInline(p.summary)}</p>
        <p class="about-loc">${esc(p.location)}</p>
      </div>
      <div class="about-stats" data-reveal>
        <div class="stat"><div class="stat-num">${roles}</div><div class="stat-label">Roles</div></div>
        <div class="stat"><div class="stat-num">${projects}</div><div class="stat-label">Projects</div></div>
        <div class="stat"><div class="stat-num">${certs}</div><div class="stat-label">Certifications</div></div>
        <div class="stat"><div class="stat-num">50+</div><div class="stat-label">Playbooks built</div></div>
      </div>
    `;
  }

  function renderSkills(container) {
    container.innerHTML = (DATA.skills || []).map((s) => `
      <div class="skill-group" data-reveal>
        <h3>${esc(s.category)}</h3>
        <div class="tag-row">
          ${String(s.skills).split(",").map((t) => t.trim()).filter(Boolean)
            .map((t) => `<span class="pill">${esc(t)}</span>`).join("")}
        </div>
      </div>
    `).join("");
  }

  function renderWork(container) {
    container.innerHTML = (DATA.projects || []).map((pr, i) => {
      const tags = String(pr.technologies || "").split(",").map((t) => t.trim()).filter(Boolean);
      return `
        <article class="work-card" data-reveal>
          <div class="work-idx">${String(i + 1).padStart(2, "0")}</div>
          <h3 class="work-title">${esc(pr.name)}</h3>
          <p class="work-desc">${renderInline(pr.description)}</p>
          <div class="work-tags">${tags.map((t) => `<span class="work-tag">${esc(t)}</span>`).join("")}</div>
          ${pr.link ? `<a class="work-link" href="${esc(pr.link)}" target="_blank" rel="noopener">View &rarr;</a>` : ""}
        </article>
      `;
    }).join("");
  }

  function renderJourney(journeyEl, certsEl) {
    const expItems = (DATA.experience || []).map((e) => `
      <div class="journey-item" data-reveal>
        <div class="journey-kind">Experience</div>
        <h3 class="journey-title">${esc(e.position)}</h3>
        <div class="journey-org">${esc(e.company)}</div>
        <div class="journey-meta">${esc(e.startDate)} &ndash; ${esc(e.endDate)} &middot; ${esc(e.location)}</div>
        ${renderBullets(e.description)}
      </div>
    `).join("");

    const eduItems = (DATA.education || []).map((e) => `
      <div class="journey-item" data-reveal>
        <div class="journey-kind">Education</div>
        <h3 class="journey-title">${esc(e.degree)}${e.fieldOfStudy ? " &middot; " + esc(e.fieldOfStudy) : ""}</h3>
        <div class="journey-org">${esc(e.institution)}</div>
        <div class="journey-meta">${esc(e.startDate)} &ndash; ${esc(e.endDate)} &middot; ${esc(e.location)}</div>
        ${e.description ? `<p>${renderInline(e.description)}</p>` : ""}
      </div>
    `).join("");

    journeyEl.innerHTML = expItems + eduItems;

    const sections = (DATA.customSections || []);
    certsEl.innerHTML = sections.map((section) => {
      const cards = section.items.map((item) => {
        const [first, ...rest] = section.fields;
        const title = first ? esc(item[first.name] ?? "") : "";
        const meta = rest.map((f) => esc(item[f.name] ?? "")).filter(Boolean).join(" &middot; ");
        return `<div class="cert-card" data-reveal><div class="cert-title">${title}</div><div class="cert-date">${meta}</div></div>`;
      }).join("");
      return `<h3>${esc(section.title)}</h3><div class="certs-grid">${cards}</div>`;
    }).join("");
  }

  function renderContact(container) {
    const p = DATA.personalInfo;
    const socialLinks = (p.socialLinks || []).map((s) => {
      const url = socialUrl(s.platform, s.username);
      return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(s.platform)}</a>`;
    }).join("");

    container.innerHTML = `
      <div data-reveal>
        <h3 class="contact-lead">Let's talk security.</h3>
        <a class="contact-email" href="mailto:${esc(p.email)}">${esc(p.email)}</a>
      </div>
      <div class="contact-links" data-reveal>
        ${p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : ""}
        <a href="#top">${esc(p.location)}</a>
        ${socialLinks}
      </div>
    `;
  }

  // ---------------- interaction: gate, nav, reveal, active-section ----------------

  function setupGate() {
    const gate = document.getElementById("gate");
    const btn = document.getElementById("gate-btn");

    const enter = () => {
      if (document.body.classList.contains("entered")) return;
      document.body.classList.add("entered");
      document.body.classList.remove("gate-active");
      gate.classList.add("gate-hidden");
    };

    // Deep link (e.g. shared "#work" URL) — skip the ceremony, jump straight in.
    if (location.hash) {
      document.body.classList.add("entered");
      document.body.classList.remove("gate-active");
      gate.classList.add("gate-hidden");
    } else {
      btn.addEventListener("click", enter);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !document.body.classList.contains("entered")) enter();
      });
    }
  }

  function setupNav() {
    const toggle = document.getElementById("nav-toggle");
    const nav = document.getElementById("nav");
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    document.querySelectorAll(".nav-links a").forEach((a) => {
      a.addEventListener("click", () => nav.classList.remove("nav-open"));
    });
  }

  function setupReveal() {
    const els = document.querySelectorAll("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      document.documentElement.classList.add("reveal-fallback");
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    els.forEach((el) => io.observe(el));
  }

  function setupActiveSection() {
    const links = [...document.querySelectorAll(".nav-links a[data-nav]")];
    const sections = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = "#" + entry.target.id;
        links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === id));
      });
    }, { threshold: 0.5 });
    sections.forEach((s) => io.observe(s));
  }

  // ---------------- boot ----------------

  function render() {
    const p = DATA.personalInfo;
    splitHeroTitle(document.getElementById("hero-title"), p.name);
    document.getElementById("hero-role").innerHTML = `${esc(p.title)} <span class="accent">&middot;</span> ${esc(p.location)}`;

    const marqueeWords = [p.title, "SOC Automation", "SOAR", "Threat Intelligence", "Detection Engineering"];
    buildMarquee(document.getElementById("marquee-track"), marqueeWords);

    renderAbout(document.getElementById("about-content"));
    renderSkills(document.getElementById("skills-content"));
    renderWork(document.getElementById("work-content"));
    renderJourney(document.getElementById("journey-content"), document.getElementById("certs-content"));
    renderContact(document.getElementById("contact-content"));

    document.getElementById("footer-text").textContent =
      `© ${new Date().getFullYear()} ${p.name} — built from data.json`;

    setupReveal();
    setupActiveSection();
  }

  setupGate();
  setupNav();

  fetch("data.json")
    .then((r) => {
      if (!r.ok) throw new Error("failed to load data.json");
      return r.json();
    })
    .then((data) => {
      DATA = data;
      render();
    })
    .catch((err) => {
      document.querySelector(".hero-inner").innerHTML =
        `<p style="color:#ff2d55">Could not load data.json (${esc(err.message)}). Serve this over http:// (e.g. "python3 -m http.server"), not file://.</p>`;
    });
})();
