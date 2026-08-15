(() => {
  "use strict";

  const output = document.getElementById("output");
  const input = document.getElementById("cmd-input");
  const suggestionsEl = document.getElementById("suggestions");
  const scrollback = document.getElementById("scrollback");

  let DATA = null;
  let history = [];
  let historyIdx = -1;
  let activeSuggestion = -1;
  let filteredCmds = [];
  let booted = false;

  // ---------------- utils ----------------

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  // very small markdown-lite: **bold**, *italic*, "- " bullet lines
  function renderInline(text) {
    let t = esc(text);
    t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*(.+?)\*/g, "<em>$1</em>");
    return t;
  }

  function renderMultiline(text) {
    if (!text) return "";
    const lines = String(text).split("\n").map((l) => l.trim()).filter(Boolean);
    let html = "";
    let inList = false;
    for (const line of lines) {
      // Bullets in data.json are inconsistent — "- foo" and "-foo" both occur.
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

  function el(html) {
    const d = document.createElement("div");
    d.innerHTML = html;
    return d.firstElementChild;
  }

  function scrollToEnd() {
    scrollback.scrollTop = scrollback.scrollHeight;
  }

  // ---------------- thinking animation ----------------

  const THINK_VERBS = [
    "Pondering", "Percolating", "Noodling", "Ruminating", "Synthesizing",
    "Cogitating", "Simmering", "Puzzling", "Marinating", "Mulling",
  ];
  const SPINNER_FRAMES = ["✢", "✳", "✶", "✻", "✽"];

  function thinkingAnimation(label) {
    const row = el(`<div class="thinking-row">
      <span class="spinner">${SPINNER_FRAMES[0]}</span>
      <span class="thinking-verb">${esc(label)}…</span>
      <span class="thinking-dim">(<span class="elapsed">0s</span> · esc to skip)</span>
    </div>`);
    output.appendChild(row);
    scrollToEnd();

    const spinnerSpan = row.querySelector(".spinner");
    const elapsedSpan = row.querySelector(".elapsed");
    let frame = 0;
    const start = performance.now();
    const spinInterval = setInterval(() => {
      frame = (frame + 1) % SPINNER_FRAMES.length;
      spinnerSpan.textContent = SPINNER_FRAMES[frame];
      elapsedSpan.textContent = ((performance.now() - start) / 1000).toFixed(1) + "s";
    }, 120);

    return {
      stop() {
        clearInterval(spinInterval);
        row.remove();
      },
    };
  }

  function randomVerb() {
    return THINK_VERBS[Math.floor(Math.random() * THINK_VERBS.length)];
  }

  function runWithThinking(label, fn, minMs = 450, maxMs = 950) {
    input.disabled = true;
    const anim = thinkingAnimation(label);
    const delay = minMs + Math.random() * (maxMs - minMs);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        document.removeEventListener("keydown", onEscape);
        anim.stop();
        fn();
        input.disabled = false;
        input.focus();
        scrollToEnd();
        resolve();
      };
      const onEscape = (e) => { if (e.key === "Escape") finish(); };
      document.addEventListener("keydown", onEscape);
      const timer = setTimeout(finish, delay);
    });
  }

  // ---------------- echo + printing ----------------

  function echoCommand(raw) {
    const row = el(`<div class="echo-line"><span class="echo-prompt">&gt;</span><span class="echo-cmd"></span></div>`);
    row.querySelector(".echo-cmd").textContent = raw;
    output.appendChild(row);
    scrollToEnd();
  }

  function printBlock(html) {
    const wrap = el(`<div class="block">${html}</div>`);
    output.appendChild(wrap);
    scrollToEnd();
  }

  function printLine(html, cls = "") {
    const wrap = el(`<div class="line ${cls}">${html}</div>`);
    output.appendChild(wrap);
    scrollToEnd();
  }

  // ---------------- command registry ----------------

  const COMMANDS = []; // {name, desc, run}

  function registerCommand(name, desc, run) {
    COMMANDS.push({ name, desc, run });
  }

  // ---------------- renderers ----------------

  const SHIELD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2.5 L20 5.5 V11 C20 16 16.7 20 12 21.5 C7.3 20 4 16 4 11 V5.5 Z" />
    <path d="M8.5 12 L11 14.5 L15.5 9" />
  </svg>`;

  function cmdDesc(name, fallback) {
    const c = COMMANDS.find((x) => x.name === name);
    return c ? c.desc : fallback;
  }

  // CLI output primitives — every section is built from these three, so the
  // transcript reads like one program's output rather than a styled document.
  const secHead = (title) =>
    `<div class="sec-head"><span class="dot">&#9679;</span><span>${esc(title)}</span></div>`;

  const treeRow = (bodyHtml, glyph = "&#9500;&#9472;") =>
    `<div class="tree"><span class="glyph">${glyph}</span><div class="body">${bodyHtml}</div></div>`;

  const kvRow = (k, v) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`;

  function renderBanner() {
    const p = DATA.personalInfo;
    const latestJob = (DATA.experience || [])[0];

    const featured = ["about", "experience", "skills", "projects", "contact"];
    const cmdRows = featured
      .filter((name) => COMMANDS.some((c) => c.name === name))
      .map((name) => `<div class="wb-cmd"><span class="k">/${esc(name)}</span><span class="v">${esc(cmdDesc(name, ""))}</span></div>`)
      .join("");

    const wrap = el(`<div class="welcome-box">
      <span class="wb-legend">${esc(p.name)} <span class="dimver">portfolio v1.0</span></span>
      <div class="wb-body">
        <div class="wb-left">
          <div class="wb-welcome">Welcome!</div>
          <div class="wb-icon">${SHIELD_ICON}</div>
          <div class="wb-meta">
            ${esc(p.title)}<br/>
            <span class="strong">${esc(p.email)}</span><br/>
            ${esc(p.location)}<br/>
            ~/govind-portfolio
          </div>
        </div>
        <div class="wb-right">
          <div class="wb-group">
            <h4>At a glance</h4>
            ${latestJob ? `<div class="wb-line">${esc(latestJob.position)} at ${esc(latestJob.company)} &middot; ${esc(latestJob.startDate)}&ndash;${esc(latestJob.endDate)}</div>` : ""}
            <div class="wb-line">${esc((DATA.experience || []).length)} roles &middot; ${esc((DATA.projects || []).length)} projects &middot; based in ${esc(p.location)}</div>
          </div>
          <div class="wb-group">
            <h4>Getting started</h4>
            ${cmdRows}
            <div class="wb-foot">/help for the full list of commands</div>
          </div>
        </div>
      </div>
    </div>`);
    output.appendChild(wrap);
    scrollToEnd();
  }

  // Last row of a list gets the closing elbow, like real tree output.
  const glyphFor = (i, len) => (i === len - 1 ? "&#9584;&#9472;" : "&#9500;&#9472;");

  function renderHelp() {
    const list = COMMANDS.filter((c) => c.name !== "clear");
    const rows = list
      .map((c, i) => treeRow(`<span class="t-title">/${esc(c.name)}</span> <span class="t-meta">&mdash; ${esc(c.desc)}</span>`, glyphFor(i, list.length)))
      .join("");
    printBlock(`${secHead(`Available commands (${list.length})`)}${rows}`);
  }

  function renderAbout() {
    const p = DATA.personalInfo;
    printBlock(`
      ${secHead("About")}
      ${treeRow(`
        <div class="t-title">${esc(p.name)}</div>
        <div class="t-meta">${esc(p.title)} &middot; ${esc(p.location)}</div>
        <p>${renderInline(p.summary)}</p>
      `, "&#9584;&#9472;")}
    `);
  }

  function renderExperience() {
    const len = DATA.experience.length;
    const items = DATA.experience.map((e, i) => treeRow(`
      <div class="t-title">${esc(e.position)} &middot; ${esc(e.company)}</div>
      <div class="t-meta">${esc(e.startDate)} &ndash; ${esc(e.endDate)} &middot; ${esc(e.location)}</div>
      ${renderMultiline(e.description)}
    `, glyphFor(i, len))).join("");
    printBlock(`${secHead("Experience")}${items}`);
  }

  function renderEducation() {
    const len = DATA.education.length;
    const items = DATA.education.map((e, i) => treeRow(`
      <div class="t-title">${esc(e.degree)}${e.fieldOfStudy ? " &middot; " + esc(e.fieldOfStudy) : ""}</div>
      <div class="t-meta">${esc(e.institution)} &middot; ${esc(e.startDate)} &ndash; ${esc(e.endDate)} &middot; ${esc(e.location)}</div>
      ${e.description ? `<p>${renderInline(e.description)}</p>` : ""}
    `, glyphFor(i, len))).join("");
    printBlock(`${secHead("Education")}${items}`);
  }

  function renderSkills() {
    const rows = DATA.skills.map((s) => kvRow(s.category, esc(s.skills))).join("");
    printBlock(`${secHead("Skills")}<div class="indent">${rows}</div>`);
  }

  function renderProjects() {
    const len = DATA.projects.length;
    const items = DATA.projects.map((pr, i) => {
      const tech = String(pr.technologies || "").split(",").map((t) => t.trim()).filter(Boolean).join(", ");
      return treeRow(`
        <div class="t-title">${esc(pr.name)}</div>
        <p>${renderInline(pr.description)}</p>
        ${tech ? `<div class="t-meta">stack: ${esc(tech)}</div>` : ""}
        ${pr.link ? `<div><a class="link" href="${esc(pr.link)}" target="_blank" rel="noopener">${esc(pr.link)}</a></div>` : ""}
      `, glyphFor(i, len));
    }).join("");
    printBlock(`${secHead("Projects")}${items}`);
  }

  function renderCustomSection(section) {
    const len = section.items.length;
    const items = section.items.map((item, i) => {
      const [first, ...rest] = section.fields;
      const title = first ? esc(item[first.name] ?? "") : "";
      const meta = rest.map((f) => esc(item[f.name] ?? "")).filter(Boolean).join(" &middot; ");
      return treeRow(
        `<span class="t-title">${title}</span>${meta ? ` <span class="t-meta">&mdash; ${meta}</span>` : ""}`,
        glyphFor(i, len)
      );
    }).join("");
    printBlock(`${secHead(section.title)}${items}`);
  }

  function socialUrl(platform, username) {
    const p = String(platform).toLowerCase();
    if (p === "linkedin") return `https://linkedin.com/in/${username}`;
    if (p === "github") return `https://github.com/${username}`;
    if (p === "twitter" || p === "x") return `https://x.com/${username}`;
    return username;
  }

  function renderContact() {
    const p = DATA.personalInfo;
    const socials = (p.socialLinks || []).map((s) => {
      const url = socialUrl(s.platform, s.username);
      return kvRow(s.platform, `<a class="link" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`);
    }).join("");
    printBlock(`
      ${secHead("Contact")}
      <div class="indent">
        ${kvRow("email", `<a class="link" href="mailto:${esc(p.email)}">${esc(p.email)}</a>`)}
        ${p.phone ? kvRow("phone", esc(p.phone)) : ""}
        ${kvRow("location", esc(p.location))}
        ${socials}
      </div>
    `);
  }

  function renderSocials() {
    const p = DATA.personalInfo;
    const rows = (p.socialLinks || []).map((s) => {
      const url = socialUrl(s.platform, s.username);
      return kvRow(s.platform, `<a class="link" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`);
    }).join("");
    printBlock(`${secHead("Socials")}<div class="indent">${rows}</div>`);
  }

  function renderWhoami() {
    const p = DATA.personalInfo;
    printLine(`${esc(p.name)} <span class="dim">&mdash; ${esc(p.title)}</span>`);
  }

  function renderLs() {
    const names = COMMANDS.filter((c) => c.name !== "clear").map((c) => c.name);
    printLine(names.map((n) => `<span class="ok">${esc(n)}</span>`).join("&nbsp;&nbsp;"));
  }

  function renderSudo() {
    printLine(`<span class="err">govind is not in the sudoers file. This incident has been reported.</span>`);
  }

  function clearScreen() {
    output.innerHTML = "";
  }

  // ---------------- register commands ----------------

  function registerAllCommands() {
    registerCommand("help", "list all available commands", () => runWithThinking("Loading commands", renderHelp, 200, 400));
    registerCommand("about", "summary & bio", () => runWithThinking(randomVerb() + " profile.json", renderAbout));
    registerCommand("experience", "work history", () => runWithThinking(randomVerb() + " experience.log", renderExperience));
    registerCommand("education", "academic background", () => runWithThinking(randomVerb() + " education.json", renderEducation));
    registerCommand("skills", "technical skills", () => runWithThinking(randomVerb() + " skills.yaml", renderSkills));
    registerCommand("projects", "selected projects", () => runWithThinking(randomVerb() + " projects/*.md", renderProjects));
    registerCommand("contact", "how to reach me", () => runWithThinking(randomVerb() + " contact info", renderContact));
    registerCommand("socials", "social profiles", () => runWithThinking(randomVerb() + " social links", renderSocials));
    registerCommand("whoami", "quick identity check", () => runWithThinking("Checking credentials", renderWhoami, 200, 400));
    registerCommand("ls", "list all sections", () => runWithThinking("Reading directory", renderLs, 150, 300));
    registerCommand("banner", "show the welcome banner", () => runWithThinking("Rendering banner", renderBanner, 150, 300));
    registerCommand("clear", "clear the terminal", () => { clearScreen(); });
    registerCommand("sudo", "try it and see", () => runWithThinking("Checking permissions", renderSudo, 300, 500));

    (DATA.customSections || []).forEach((section) => {
      const name = slugify(section.title);
      registerCommand(name, section.title.toLowerCase(), () =>
        runWithThinking(randomVerb() + " " + name, () => renderCustomSection(section))
      );
    });
  }

  // ---------------- input handling ----------------

  function findCommand(name) {
    const clean = name.replace(/^\//, "").toLowerCase().trim();
    return COMMANDS.find((c) => c.name === clean);
  }

  async function execute(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    echoCommand(trimmed);
    history.push(trimmed);
    historyIdx = history.length;

    const cmd = findCommand(trimmed);
    if (cmd) {
      await cmd.run();
    } else {
      await runWithThinking("Searching", () => {
        printLine(`<span class="err">command not found:</span> ${esc(trimmed)} <span class="dim">— type /help to see available commands</span>`);
      }, 200, 400);
    }
  }

  function closeSuggestions() {
    suggestionsEl.hidden = true;
    suggestionsEl.innerHTML = "";
    activeSuggestion = -1;
    filteredCmds = [];
  }

  function openSuggestions(query) {
    const q = query.replace(/^\//, "").toLowerCase();
    filteredCmds = COMMANDS.filter((c) => c.name.startsWith(q) && c.name !== "clear");
    if (query === "/") filteredCmds = COMMANDS.filter((c) => c.name !== "clear");

    if (filteredCmds.length === 0) {
      closeSuggestions();
      return;
    }

    suggestionsEl.innerHTML = filteredCmds
      .map((c, i) => `<li role="option" aria-selected="false" data-idx="${i}"><span class="cmd-name">/${esc(c.name)}</span><span class="cmd-desc">${esc(c.desc)}</span></li>`)
      .join("");
    suggestionsEl.hidden = false;
    activeSuggestion = 0;
    highlightSuggestion();

    [...suggestionsEl.children].forEach((li) => {
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const idx = Number(li.dataset.idx);
        selectSuggestion(idx);
      });
    });
  }

  function highlightSuggestion() {
    [...suggestionsEl.children].forEach((li, i) => {
      const isActive = i === activeSuggestion;
      li.classList.toggle("active", isActive);
      li.setAttribute("aria-selected", String(isActive));
    });
    const activeEl = suggestionsEl.children[activeSuggestion];
    if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
  }

  function selectSuggestion(idx) {
    const cmd = filteredCmds[idx];
    if (!cmd) return;
    input.value = "/" + cmd.name;
    closeSuggestions();
    input.focus();
  }

  input.addEventListener("input", () => {
    const v = input.value;
    if (v.startsWith("/")) {
      openSuggestions(v);
    } else {
      closeSuggestions();
    }
  });

  input.addEventListener("keydown", (e) => {
    if (!suggestionsEl.hidden && filteredCmds.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeSuggestion = (activeSuggestion + 1) % filteredCmds.length;
        highlightSuggestion();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        activeSuggestion = (activeSuggestion - 1 + filteredCmds.length) % filteredCmds.length;
        highlightSuggestion();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        selectSuggestion(activeSuggestion);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        selectSuggestion(activeSuggestion);
        const val = input.value;
        input.value = "";
        closeSuggestions();
        execute(val);
        return;
      }
      if (e.key === "Escape") {
        closeSuggestions();
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const val = input.value;
      input.value = "";
      closeSuggestions();
      execute(val);
      return;
    }

    if (e.key === "ArrowUp") {
      if (history.length === 0) return;
      e.preventDefault();
      historyIdx = Math.max(0, historyIdx - 1);
      input.value = history[historyIdx] || "";
      setTimeout(() => input.setSelectionRange(input.value.length, input.value.length));
      return;
    }
    if (e.key === "ArrowDown") {
      if (history.length === 0) return;
      e.preventDefault();
      historyIdx = Math.min(history.length, historyIdx + 1);
      input.value = history[historyIdx] || "";
      return;
    }
    if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      clearScreen();
      return;
    }
  });

  document.addEventListener("click", () => input.focus());

  // ---------------- boot ----------------

  async function boot() {
    if (booted) return;
    booted = true;
    await runWithThinking("Booting portfolio shell", () => {
      renderBanner();
    }, 500, 900);

    // Deep link: /#projects opens straight to that section.
    const hash = location.hash.replace(/^#/, "");
    if (hash && findCommand(hash)) await execute("/" + hash.toLowerCase());
  }

  fetch("data.json")
    .then((r) => {
      if (!r.ok) throw new Error("failed to load data.json");
      return r.json();
    })
    .then((data) => {
      DATA = data;
      registerAllCommands();
      boot();
      input.focus();
    })
    .catch((err) => {
      printLine(`<span class="err">fatal: could not load data.json (${esc(err.message)}). If you opened this file directly, serve it via a local http server instead (e.g. "python3 -m http.server").</span>`);
    });
})();
