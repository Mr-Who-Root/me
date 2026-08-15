/* ===========================================================
   Cyber-Sentry portfolio — all content is rendered from
   data.json at runtime, so editing that file updates the site.
   =========================================================== */

(() => {
  "use strict";

  let DATA = null;

  // ---------------- utils ----------------

  const $ = (id) => document.getElementById(id);

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  const renderInline = (text) =>
    esc(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");

  // data.json writes bullets inconsistently ("- foo" and "-foo" both occur)
  function renderBullets(text) {
    if (!text) return "";
    const lines = String(text).split("\n").map((l) => l.trim()).filter(Boolean);
    let html = "", inList = false;
    for (const line of lines) {
      const m = line.match(/^[-*]\s*(.+)$/);
      if (m) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${renderInline(m[1])}</li>`;
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<p>${renderInline(line)}</p>`;
      }
    }
    return inList ? html + "</ul>" : html;
  }

  const socialUrl = (platform, username) => {
    const p = String(platform).toLowerCase();
    if (p === "linkedin") return `https://linkedin.com/in/${username}`;
    if (p === "github") return `https://github.com/${username}`;
    if (p === "twitter" || p === "x") return `https://x.com/${username}`;
    return username;
  };

  const initialsOf = (name) =>
    String(name).trim().split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 3);

  // ---------------- custom HUD cursor ----------------
  // Only for real pointing devices — touch users keep native behaviour.

  function setupCursor() {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    const dot = $("cursor-dot");
    const ring = $("cursor-ring");
    const label = $("cursor-label");
    if (!dot || !ring) return;

    document.body.classList.add("has-cursor");

    let mx = window.innerWidth / 2, my = window.innerHeight / 2;   // true pointer
    let rx = mx, ry = my;                                          // ring (eased)

    document.addEventListener("mousemove", (e) => {
      mx = e.clientX;
      my = e.clientY;
      // the dot tracks exactly; the ring lags behind via the rAF loop
      dot.style.transform = `translate(${mx}px, ${my}px)`;
    }, { passive: true });

    // ring trails the dot with simple exponential easing
    (function loop() {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      requestAnimationFrame(loop);
    })();

    document.addEventListener("mousedown", () => document.body.classList.add("cursor-down"));
    document.addEventListener("mouseup", () => document.body.classList.remove("cursor-down"));
    document.addEventListener("mouseleave", () => document.body.classList.add("cursor-out"));
    document.addEventListener("mouseenter", () => document.body.classList.remove("cursor-out"));

    // hover targets: anything interactive, with an optional readout label
    const HOVER_SEL = "a, button, .tag, .proj, .cert, .crow, [data-cursor]";
    document.addEventListener("mouseover", (e) => {
      const t = e.target.closest(HOVER_SEL);
      if (!t) return;
      document.body.classList.add("cursor-hover");
      label.textContent = t.getAttribute("data-cursor") || "OPEN";
    });
    document.addEventListener("mouseout", (e) => {
      if (e.target.closest(HOVER_SEL) && !e.relatedTarget?.closest?.(HOVER_SEL)) {
        document.body.classList.remove("cursor-hover");
        label.textContent = "";
      }
    });
  }

  // ---------------- boot sequence ----------------

  function runBoot(onDone) {
    const boot = $("boot");
    const log = $("boot-log");
    const fill = $("boot-fill");
    if (!boot || !log) return onDone();

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { boot.classList.add("done"); document.body.classList.remove("booting"); return onDone(); }

    document.body.classList.add("booting");

    const lines = [
      "> initializing cyber-sentry core ...",
      "> mounting /dev/portfolio ......... OK",
      "> verifying signature ............ VALID",
      "> establishing secure channel .... AES-256",
      "> loading operator profile ....... DONE",
      "> access granted.",
    ];

    let i = 0;
    const step = () => {
      if (i < lines.length) {
        log.textContent += lines[i] + "\n";
        fill.style.width = Math.round(((i + 1) / lines.length) * 100) + "%";
        i++;
        setTimeout(step, 190);
      } else {
        setTimeout(() => {
          boot.classList.add("done");
          document.body.classList.remove("booting");
          onDone();
        }, 320);
      }
    };
    setTimeout(step, 160);
  }

  // ---------------- HUD status bar ----------------

  function setupHud() {
    const clock = $("hb-clock");
    const uptime = $("hb-uptime");
    const pid = $("hb-pid");
    const ping = $("hb-ping");

    if (pid) pid.textContent = String(Math.floor(1000 + Math.random() * 8000));
    if (ping) ping.textContent = Math.floor(12 + Math.random() * 40) + "MS";

    const start = Date.now();
    const pad = (n) => String(n).padStart(2, "0");

    setInterval(() => {
      const now = new Date();
      if (clock) clock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const s = Math.floor((Date.now() - start) / 1000);
      if (uptime) uptime.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
    }, 1000);
  }

  // ---------------- hero ----------------

  function renderHero() {
    const p = DATA.personalInfo;

    $("brand-text").innerHTML = (() => {
      const parts = String(p.name).trim().split(/\s+/);
      const first = parts.shift();
      return `${esc(first.toUpperCase())}<span class="b2">_${esc(parts.join("").toUpperCase())}</span>`;
    })();

    $("hero-chip").textContent =
      `${String(p.title).toUpperCase().replace(/\s+/g, "_")} // V1.0`;

    // Name stacks as: first word, then the rest — each line gets its own glow.
    const words = String(p.name).trim().split(/\s+/);
    const lines = words.length > 1 ? [words[0], words.slice(1).join(" ")] : [words[0]];
    const nameEl = $("hero-name");
    nameEl.setAttribute("aria-label", p.name);
    nameEl.innerHTML = lines
      .map((l) => `<span class="ln" data-text="${esc(l.toUpperCase())}">${esc(l.toUpperCase())}</span>`)
      .join("");

    // periodic glitch burst
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const glitch = () => {
        nameEl.classList.add("glitching");
        setTimeout(() => nameEl.classList.remove("glitching"), 430);
        setTimeout(glitch, 3200 + Math.random() * 4200);
      };
      setTimeout(glitch, 1400);
    }

    // First sentence of the summary — skill *category* names ("Languages",
    // "Frameworks & Libraries") read as meaningless filler here.
    const firstSentence = String(p.summary).split(/\.\s+/)[0].trim();
    $("hero-tagline").textContent = (() => {
      if (firstSentence.length <= 200) return firstSentence + ".";
      // trim back to a word boundary so it never cuts mid-word
      const cut = firstSentence.slice(0, 200);
      return cut.slice(0, cut.lastIndexOf(" ")) + "…";
    })();

    const mail = $("btn-mail");
    mail.href = `mailto:${p.email}`;
    mail.textContent = "GET_IN_TOUCH";

    // identity panel
    const face = $("id-face");
    if (p.photo) {
      face.classList.add("has-photo");
      face.style.backgroundImage = `url("${p.photo}")`;
    } else {
      face.textContent = initialsOf(p.name);
    }

    const firstCert = (DATA.customSections || [])
      .flatMap((s) => s.items.map((it) => {
        const f = s.fields[0];
        return f ? String(it[f.name] || "") : "";
      }))
      .filter(Boolean)[0];
    // Prefer the acronym — "Certified Ethical Hacker (CEH), EC-Council" reads
    // as "CEH", not a hard-truncated "CERTIFIED ETHICAL HACK".
    const certLabel = (() => {
      if (!firstCert) return "OPERATOR";
      const acronym = firstCert.match(/\(([A-Za-z]{2,8})\)/);
      if (acronym) return acronym[1].toUpperCase();
      return firstCert.split(/[(,]/)[0].trim().toUpperCase().slice(0, 20);
    })();
    $("id-badge").textContent = `${certLabel} // VALID`;

    const edu = (DATA.education || [])[0];
    $("id-org").textContent = edu
      ? (edu.institution.match(/\b[A-Z]/g) || []).join("").slice(0, 4) || "EDU"
      : "SEC";
  }

  // ---------------- sections ----------------

  function renderAbout() {
    const p = DATA.personalInfo;
    const years = (String(p.summary).match(/(\d+)\+?\s*years?/i) || [])[1];
    const certs = (DATA.customSections || []).reduce((n, s) => n + (s.items?.length || 0), 0);

    $("about-content").innerHTML = `
      <div class="about-text" data-reveal>
        <p>${renderInline(p.summary)}</p>
        <p class="about-loc">// LOCATION: ${esc(p.location)}</p>
      </div>
      <div class="stat-grid" data-reveal>
        ${[
          [years ? years + "+" : (DATA.experience || []).length, "YEARS_ACTIVE"],
          [(DATA.projects || []).length, "OPERATIONS"],
          [certs, "CREDENTIALS"],
          ["300+", "INTEGRATIONS"],
        ].map(([n, l]) => `<div class="stat"><div class="stat-n">${esc(n)}</div><div class="stat-l">${l}</div></div>`).join("")}
      </div>
    `;
  }

  function renderSkills() {
    $("skills-content").innerHTML = (DATA.skills || []).map((s) => `
      <div class="skill-block" data-reveal>
        <h3>// ${esc(s.category).toUpperCase()}</h3>
        <div class="skill-tags">
          ${String(s.skills).split(",").map((t) => t.trim()).filter(Boolean)
            .map((t) => `<span class="tag" data-cursor="SKILL">${esc(t)}</span>`).join("")}
        </div>
      </div>
    `).join("");
  }

  function renderProjects() {
    $("projects-content").innerHTML = (DATA.projects || []).map((pr, i) => {
      const stack = String(pr.technologies || "").split(",").map((t) => t.trim()).filter(Boolean);
      return `
        <article class="proj" data-reveal data-cursor="INSPECT">
          <div class="proj-idx">OP_${String(i + 1).padStart(2, "0")}</div>
          <h3 class="proj-name">${esc(pr.name)}</h3>
          <p class="proj-desc">${renderInline(pr.description)}</p>
          <div class="proj-stack">${stack.map((t) => `<span class="chip-sm">${esc(t)}</span>`).join("")}</div>
          ${pr.link ? `<a class="proj-link" href="${esc(pr.link)}" target="_blank" rel="noopener" data-cursor="OPEN">ACCESS &rarr;</a>` : ""}
        </article>
      `;
    }).join("");
  }

  function renderExperience() {
    const exp = (DATA.experience || []).map((e) => `
      <div class="exp" data-reveal>
        <div class="exp-kind">// DEPLOYMENT</div>
        <h3 class="exp-role">${esc(e.position)}</h3>
        <div class="exp-org">${esc(e.company)}</div>
        <div class="exp-meta">${esc(e.startDate)} &mdash; ${esc(e.endDate)} // ${esc(e.location)}</div>
        ${renderBullets(e.description)}
      </div>
    `).join("");

    const edu = (DATA.education || []).map((e) => `
      <div class="exp" data-reveal>
        <div class="exp-kind">// TRAINING</div>
        <h3 class="exp-role">${esc(e.degree)}${e.fieldOfStudy ? " &mdash; " + esc(e.fieldOfStudy) : ""}</h3>
        <div class="exp-org">${esc(e.institution)}</div>
        <div class="exp-meta">${esc(e.startDate)} &mdash; ${esc(e.endDate)} // ${esc(e.location)}</div>
        ${e.description ? `<p>${renderInline(e.description)}</p>` : ""}
      </div>
    `).join("");

    $("experience-content").innerHTML = exp + edu;
  }

  function renderCerts() {
    $("certs-content").innerHTML = (DATA.customSections || []).flatMap((section) =>
      section.items.map((item) => {
        const [first, ...rest] = section.fields;
        const name = first ? esc(item[first.name] ?? "") : "";
        const meta = rest.map((f) => esc(item[f.name] ?? "")).filter(Boolean).join(" // ");
        return `
          <div class="cert" data-reveal data-cursor="VERIFY">
            <div class="cert-valid">&#9679; VERIFIED</div>
            <div class="cert-name">${name}</div>
            <div class="cert-date">${meta}</div>
          </div>
        `;
      })
    ).join("");
  }

  function renderContact() {
    const p = DATA.personalInfo;
    const rows = [
      ["EMAIL", `<a href="mailto:${esc(p.email)}" data-cursor="MAIL">${esc(p.email)}</a>`],
      p.phone ? ["PHONE", `<a href="tel:${esc(p.phone)}" data-cursor="CALL">${esc(p.phone)}</a>`] : null,
      ["LOCATION", esc(p.location)],
      ...(p.socialLinks || []).map((s) => {
        const url = socialUrl(s.platform, s.username);
        return [String(s.platform).toUpperCase(), `<a href="${esc(url)}" target="_blank" rel="noopener" data-cursor="OPEN">${esc(url)}</a>`];
      }),
    ].filter(Boolean);

    $("contact-content").innerHTML = `
      <div data-reveal>
        <h3 class="contact-lead">Open a<br/><span class="cyan">secure channel</span>.</h3>
        <p class="contact-sub">
          &gt; Available for security engineering, SOC automation<br/>
          &gt; and detection engineering work.<br/>
          &gt; Response time: &lt; 24h
        </p>
      </div>
      <div class="contact-rows" data-reveal>
        ${rows.map(([k, v]) => `<div class="crow"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")}
      </div>
    `;
  }

  // ---------------- scroll behaviours ----------------

  function setupReveal() {
    if (!("IntersectionObserver" in window)) {
      document.documentElement.classList.add("reveal-fallback");
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
  }

  function setupActiveNav() {
    if (!("IntersectionObserver" in window)) return;
    const links = [...document.querySelectorAll(".nav a[data-nav]")];
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + en.target.id));
      });
    }, { threshold: 0.4 });
    links.forEach((a) => {
      const sec = document.querySelector(a.getAttribute("href"));
      if (sec) io.observe(sec);
    });
  }

  function setupNav() {
    const burger = $("nav-burger");
    burger?.addEventListener("click", () => {
      const open = document.body.classList.toggle("nav-open");
      burger.setAttribute("aria-expanded", String(open));
    });
    document.querySelectorAll(".nav a").forEach((a) =>
      a.addEventListener("click", () => document.body.classList.remove("nav-open"))
    );
  }

  // ---------------- boot ----------------

  function renderAll() {
    renderHero();
    renderAbout();
    renderSkills();
    renderProjects();
    renderExperience();
    renderCerts();
    renderContact();
    setupReveal();
    setupActiveNav();
  }

  setupCursor();
  setupNav();
  setupHud();

  fetch("data.json")
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then((data) => {
      DATA = data;
      runBoot(renderAll);
    })
    .catch((err) => {
      $("boot")?.classList.add("done");
      document.body.classList.remove("booting");
      document.documentElement.classList.add("reveal-fallback");
      $("hero-tagline").innerHTML =
        `<span style="color:#ff003c">FATAL: could not load data.json (${esc(err.message)}).</span><br/>
         Serve over http:// — e.g. <code>python3 -m http.server</code> — not file://`;
    });
})();
