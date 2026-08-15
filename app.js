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
      if (line.startsWith("- ")) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${renderInline(line.slice(2))}</li>`;
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

  function renderBanner() {
    const p = DATA.personalInfo;
    const wrap = el(`<div class="welcome-box">
      <div class="wb-title"><span class="glyph">✳</span>${esc(p.name)} — ${esc(p.title)}</div>
      <p>${esc(p.location)}</p>
      <p>Type <span class="ok">/help</span> to see available commands</p>
    </div>`);
    output.appendChild(wrap);
    scrollToEnd();
  }

  function renderHelp() {
    let rows = COMMANDS
      .filter((c) => c.name !== "clear")
      .map((c) => `<tr><td class="k">/${esc(c.name)}</td><td>${esc(c.desc)}</td></tr>`)
      .join("");
    printBlock(`
      <h2>Available commands</h2>
      <table class="dtable">${rows}</table>
      <p class="dim" style="margin-top:8px">Tip: press <strong>Tab</strong> to autocomplete, <strong>&uarr;/&darr;</strong> for history, <strong>Ctrl+L</strong> to clear.</p>
    `);
  }

  function renderAbout() {
    const p = DATA.personalInfo;
    printBlock(`
      <h2>About</h2>
      <h3>${esc(p.name)}</h3>
      <p class="sub">${esc(p.title)}</p>
      <p class="meta">${esc(p.location)}</p>
      <p>${renderInline(p.summary)}</p>
    `);
  }

  function renderExperience() {
    const items = DATA.experience.map((e) => `
      <div class="entry">
        <h3>${esc(e.position)}</h3>
        <p class="sub">${esc(e.company)}</p>
        <p class="meta">${esc(e.startDate)} — ${esc(e.endDate)} · ${esc(e.location)}</p>
        ${renderMultiline(e.description)}
      </div>
    `).join("");
    printBlock(`<h2>Experience</h2>${items}`);
  }

  function renderEducation() {
    const items = DATA.education.map((e) => `
      <div class="entry">
        <h3>${esc(e.degree)}${e.fieldOfStudy ? " — " + esc(e.fieldOfStudy) : ""}</h3>
        <p class="sub">${esc(e.institution)}</p>
        <p class="meta">${esc(e.startDate)} — ${esc(e.endDate)} · ${esc(e.location)}</p>
        ${e.description ? `<p>${renderInline(e.description)}</p>` : ""}
      </div>
    `).join("");
    printBlock(`<h2>Education</h2>${items}`);
  }

  function renderSkills() {
    const rows = DATA.skills.map((s) => `
      <div class="skill-row">
        <span class="skill-cat">${esc(s.category)}</span>
        <span class="skill-list">${esc(s.skills)}</span>
      </div>
    `).join("");
    printBlock(`<h2>Skills</h2>${rows}`);
  }

  function renderProjects() {
    const items = DATA.projects.map((pr) => {
      const tags = String(pr.technologies || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => `<span class="tag">${esc(t)}</span>`)
        .join("");
      return `
        <div class="entry">
          <h3>${esc(pr.name)}</h3>
          <p>${renderInline(pr.description)}</p>
          <div class="tag-row">${tags}</div>
          ${pr.link ? `<p><a class="link" href="${esc(pr.link)}" target="_blank" rel="noopener">${esc(pr.link)}</a></p>` : ""}
        </div>
      `;
    }).join("");
    printBlock(`<h2>Projects</h2>${items}`);
  }

  function renderCustomSection(section) {
    const rows = section.items.map((item) => {
      const cells = section.fields
        .map((f) => `<td>${esc(item[f.name] ?? "")}</td>`)
        .join("<td class=\"dim\"> — </td>");
      return `<tr>${cells}</tr>`;
    }).join("");
    printBlock(`<h2>${esc(section.title)}</h2><table class="dtable">${rows}</table>`);
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
      return `<tr><td class="k">${esc(s.platform)}</td><td><a class="link" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></td></tr>`;
    }).join("");
    printBlock(`
      <h2>Contact</h2>
      <table class="dtable">
        <tr><td class="k">email</td><td><a class="link" href="mailto:${esc(p.email)}">${esc(p.email)}</a></td></tr>
        ${p.phone ? `<tr><td class="k">phone</td><td>${esc(p.phone)}</td></tr>` : ""}
        <tr><td class="k">location</td><td>${esc(p.location)}</td></tr>
        ${socials}
      </table>
    `);
  }

  function renderSocials() {
    const p = DATA.personalInfo;
    const rows = (p.socialLinks || []).map((s) => {
      const url = socialUrl(s.platform, s.username);
      return `<li>${esc(s.platform)}: <a class="link" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></li>`;
    }).join("");
    printBlock(`<h2>Socials</h2><ul>${rows}</ul>`);
  }

  function renderWhoami() {
    const p = DATA.personalInfo;
    printLine(`<span class="ok">${esc(p.name)}</span> <span class="dim">·</span> ${esc(p.title)}`);
  }

  function renderLs() {
    const names = COMMANDS.filter((c) => c.name !== "clear").map((c) => c.name);
    printLine(names.map((n) => `<span class="ok">/${esc(n)}</span>`).join("  "));
  }

  function renderSudo() {
    printLine(`<span class="err">Permission denied: nice try. This terminal runs as user "govind" only.</span>`);
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
