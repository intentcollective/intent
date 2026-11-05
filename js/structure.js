/* ==========================================================================
   Intent Collective: Structure page
   A) Debate schedule: reads sessions from a Google Sheet published to the
      web as CSV, shows upcoming sessions (with US Eastern, Seoul and London
      times) and a collapsed history of past ones. A password-gated form
      lets a host add a session; the Apps Script then emails every fellow.
   B) Fellow registration: a password-gated form that adds a row to the
      private "Fellows" sheet. Nothing from that sheet is ever shown here.

   Both forms post to the same Apps Script Web App
   (google-apps-script-fellows-debate.gs). See README.md, "Fellows and
   Debate Schedule".

   Debate Schedule sheet header row (any order, case-insensitive):
     Host, Date, Subject, Discourse, Meeting, Added
   "Date" is US Eastern time, written like 2026-12-05 10:00
   ========================================================================== */

// Published CSV of the "Debate Schedule" tab (File > Share > Publish to web).
const DEBATE_CSV_URL = "PASTE_YOUR_DEBATE_SCHEDULE_CSV_URL_HERE";

// The Discourse sheet, used only to offer a searchable list of posts.
const DISCOURSE_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBQ1XXs9ML_5Bmydn824YJlm7xg-_ueJDw7YxhB4RuVVEfRi495R2E5zOLZ16QCoZQ5n8JXN-Gxo54/pub?output=csv";

// Web app URL of the Fellows + Debate Apps Script.
const POST_ENDPOINT_URL = "PASTE_YOUR_FELLOWS_DEBATE_APPS_SCRIPT_WEB_APP_URL_HERE";

// Soft client-side check only, for instant feedback. The Apps Script checks
// the password server-side; that is the real gate.
const POST_PASSWORD = "designeverything1234";

const TZ_ET = "America/New_York";
const TZ_SEOUL = "Asia/Seoul";
const TZ_LONDON = "Europe/London";

// A session stays in "upcoming" until this long after it starts.
const SESSION_WINDOW_MS = 2 * 60 * 60 * 1000;

const $ = (id) => document.getElementById(id);

let debates = [];
let discoursePosts = [];
let chosenPostUrl = "";

/* ---------------- helpers ---------------- */

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function safeUrl(u) {
  u = (u || "").trim();
  return /^https?:\/\//i.test(u) ? u : "";
}

function pad(n) { return String(n).padStart(2, "0"); }

function slugify(str) {
  return (str || "post").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "") || "post";
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') { field += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { field += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ",") { row.push(field); field = ""; }
      else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (char === "\r") { /* skip */ }
      else { field += char; }
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ""));
}

async function postJSON(payload) {
  const res = await fetch(POST_ENDPOINT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight
    body: JSON.stringify(payload),
  });
  return res.json();
}

function setStatus(el, message, kind) {
  el.textContent = message || "";
  el.classList.toggle("is-error", kind === "error");
  el.classList.toggle("is-ok", kind === "ok");
}

/* ---------------- time zones ---------------- */

// How far a zone is ahead of UTC at a given instant, in ms.
function tzOffsetMs(utcMs, tz) {
  const d = new Date(Math.floor(utcMs / 1000) * 1000);
  const p = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d).forEach(x => { if (x.type !== "literal") p[x.type] = parseInt(x.value, 10); });
  const h = p.hour === 24 ? 0 : p.hour;
  return Date.UTC(p.year, p.month - 1, p.day, h, p.minute, p.second) - d.getTime();
}

// Turns a wall-clock time in US Eastern into a real instant. Handles
// daylight saving automatically.
function etWallToDate(y, mo, d, h, mi) {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let utc = wall - tzOffsetMs(wall, TZ_ET);
  utc = wall - tzOffsetMs(utc, TZ_ET);
  return new Date(utc);
}

// Accepts "2026-12-05 10:00", "2026-12-05T10:00", or "12/5/2026 10:00 AM".
function parseEtWall(str) {
  str = (str || "").trim();
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 10, m[5] !== undefined ? +m[5] : 0];
  }
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i);
  if (m) {
    let h = m[4] !== undefined ? +m[4] : 10;
    const mi = m[5] !== undefined ? +m[5] : 0;
    const ap = (m[6] || "").toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return [+m[3], +m[1], +m[2], h, mi];
  }
  return null;
}

function fmtZone(date, tz, withZoneName) {
  const opts = {
    timeZone: tz, weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  };
  if (withZoneName) opts.timeZoneName = "short";
  return new Intl.DateTimeFormat("en-US", opts).format(date);
}

/* ---------------- debate schedule: load + render ---------------- */

function rowsToDebates(rows) {
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const iHost = idx("host"), iDate = idx("date"), iSubject = idx("subject");
  const iDiscourse = idx("discourse"), iMeeting = idx("meeting");
  const cell = (r, i) => (i > -1 ? (r[i] || "").trim() : "");

  return rows.slice(1).map(r => {
    const parts = parseEtWall(cell(r, iDate));
    return {
      host: cell(r, iHost),
      subject: cell(r, iSubject),
      discourse: safeUrl(cell(r, iDiscourse)),
      meeting: safeUrl(cell(r, iMeeting)),
      start: parts ? etWallToDate(...parts) : null,
    };
  }).filter(d => d.subject && d.start && !isNaN(d.start.getTime()));
}

function debateRowHTML(d, isPast) {
  const links = [];
  if (d.discourse) links.push(`<a href="${escapeHTML(d.discourse)}">Read the discourse post &gt;&gt;</a>`);
  if (d.meeting && !isPast) links.push(`<a href="${escapeHTML(d.meeting)}" target="_blank" rel="noopener">Join online &gt;&gt;</a>`);

  const times = [fmtZone(d.start, TZ_ET, true)];
  if (!isPast) {
    times.push(fmtZone(d.start, TZ_SEOUL, false) + ", Seoul");
    times.push(fmtZone(d.start, TZ_LONDON, false) + ", London");
  }

  return `
    <article class="entry-card debate-card">
      <div class="entry-meta"><span>Debate</span></div>
      <h3>${escapeHTML(d.subject)}</h3>
      <div class="debate-info">
        ${d.host ? `<div class="debate-host">Hosted by ${escapeHTML(d.host)}</div>` : ""}
        ${times.map(t => `<div>${escapeHTML(t)}</div>`).join("")}
      </div>
      ${links.length ? `<div class="debate-links">${links.join("")}</div>` : ""}
    </article>`;
}

function renderDebates() {
  const stateEl = $("debate-state");
  const upEl = $("debate-upcoming");
  const pastEl = $("debate-past");
  const now = Date.now();

  const upcoming = debates
    .filter(d => d.start.getTime() + SESSION_WINDOW_MS >= now)
    .sort((a, b) => a.start - b.start);
  const past = debates
    .filter(d => d.start.getTime() + SESSION_WINDOW_MS < now)
    .sort((a, b) => b.start - a.start);

  if (upcoming.length) {
    upEl.innerHTML = upcoming.map(d => debateRowHTML(d, false)).join("");
    upEl.hidden = false;
    stateEl.hidden = true;
  } else {
    upEl.hidden = true;
    stateEl.hidden = false;
    stateEl.classList.remove("is-error");
    stateEl.textContent = "No upcoming debates are scheduled right now.";
  }

  if (past.length) {
    const byYear = {};
    past.forEach(d => {
      const y = new Intl.DateTimeFormat("en-US", { timeZone: TZ_ET, year: "numeric" }).format(d.start);
      (byYear[y] = byYear[y] || []).push(d);
    });
    const years = Object.keys(byYear).sort((a, b) => b - a);
    pastEl.innerHTML = `
      <details class="past-all">
        <summary>Past debates (${past.length})</summary>
        ${years.map((y, i) => `
          <details class="past-year"${i === 0 ? " open" : ""}>
            <summary>${escapeHTML(y)} (${byYear[y].length})</summary>
            <div class="debate-list">${byYear[y].map(d => debateRowHTML(d, true)).join("")}</div>
          </details>`).join("")}
      </details>`;
    pastEl.hidden = false;
  } else {
    pastEl.hidden = true;
    pastEl.innerHTML = "";
  }
}

async function loadDebates() {
  const stateEl = $("debate-state");
  if (!DEBATE_CSV_URL || DEBATE_CSV_URL.includes("PASTE_YOUR")) {
    stateEl.textContent = "The debate schedule isn't connected yet. Paste the Debate Schedule CSV URL into js/structure.js.";
    stateEl.classList.add("is-error");
    return;
  }
  try {
    const res = await fetch(DEBATE_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Sheet responded with " + res.status);
    debates = rowsToDebates(parseCSV(await res.text()));
    renderDebates();
  } catch (err) {
    stateEl.textContent = "Couldn't load the debate schedule. Check that the sheet is published to the web as CSV and that the URL in js/structure.js is correct.";
    stateEl.classList.add("is-error");
    console.error(err);
  }
}

/* ---------------- discourse post picker ---------------- */

async function loadDiscoursePosts() {
  try {
    const res = await fetch(DISCOURSE_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Discourse sheet responded with " + res.status);
    const rows = parseCSV(await res.text());
    if (!rows.length) return;
    const header = rows[0].map(h => h.trim().toLowerCase());
    const iName = header.indexOf("name"), iTitle = header.indexOf("title"), iDate = header.indexOf("date");

    // The slug must match how js/discourse.js builds it, so the link opens
    // the right post.
    discoursePosts = rows.slice(1).map((r, i) => {
      const title = iTitle > -1 ? (r[iTitle] || "").trim() : "";
      const date = iDate > -1 ? (r[iDate] || "").trim() : "";
      return {
        name: iName > -1 ? (r[iName] || "").trim() : "",
        title, date, order: i,
        slug: slugify(title || "Untitled") + "-" + (date ? date.replace(/[^0-9]/g, "") : i),
      };
    }).filter(p => p.title);
  } catch (err) {
    console.error("Couldn't load Discourse posts for the picker:", err);
  }
}

function postTime(p) {
  const t = new Date(p.date).getTime();
  return isNaN(t) ? p.order : t;
}

function postUrl(slug) {
  return new URL("discourse.html#post-" + slug, location.href).href;
}

function refreshPostResults() {
  const input = $("d-post");
  const resultsEl = $("d-post-results");
  const chosenEl = $("d-post-chosen");
  const raw = input.value.trim();

  if (/^https?:\/\//i.test(raw)) {
    chosenPostUrl = raw;
    resultsEl.hidden = true;
    chosenEl.textContent = "Using the pasted link.";
    return;
  }

  chosenPostUrl = "";
  chosenEl.textContent = "";

  const q = raw.toLowerCase();
  const host = $("d-host").value.trim().toLowerCase();
  const isHosts = (p) => host && p.name.toLowerCase().includes(host);

  let list = discoursePosts.slice();
  if (q) list = list.filter(p => (p.title + " " + p.name).toLowerCase().includes(q));
  else if (host && list.some(isHosts)) list = list.filter(isHosts);

  list.sort((a, b) => (isHosts(b) - isHosts(a)) || (postTime(b) - postTime(a)));

  resultsEl.innerHTML = "";
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "post-result-empty";
    empty.textContent = discoursePosts.length
      ? "No matching posts. Paste a link instead."
      : "No posts loaded. Paste a link instead.";
    resultsEl.appendChild(empty);
  } else {
    list.slice(0, 6).forEach(p => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "post-result";
      btn.setAttribute("role", "option");
      const t = document.createElement("span");
      t.className = "post-result-title";
      t.textContent = p.title;
      const m = document.createElement("span");
      m.className = "post-result-meta";
      m.textContent = p.name;
      btn.append(t, m);
      btn.addEventListener("click", () => {
        chosenPostUrl = postUrl(p.slug);
        input.value = p.title;
        chosenEl.textContent = "Selected: " + p.title + (p.name ? " by " + p.name : "");
        resultsEl.hidden = true;
      });
      resultsEl.appendChild(btn);
    });
    if (list.length > 6) {
      const more = document.createElement("div");
      more.className = "post-result-empty";
      more.textContent = "Keep typing to narrow the list.";
      resultsEl.appendChild(more);
    }
  }
  resultsEl.hidden = false;
}

/* ---------------- forms ---------------- */

function setupToggle(btnId, panelId, openLabel) {
  const btn = $(btnId), panel = $(panelId);
  btn.hidden = false;
  btn.addEventListener("click", () => {
    panel.classList.toggle("hidden");
    btn.textContent = panel.classList.contains("hidden") ? openLabel : "\u2212 Close";
  });
}

function updateWhenPreview() {
  const hint = $("d-when-preview");
  const parts = parseEtWall($("d-when").value);
  if (!parts) { hint.textContent = ""; return; }
  const date = etWallToDate(...parts);
  let text = "Seoul: " + fmtZone(date, TZ_SEOUL, false) + "   London: " + fmtZone(date, TZ_LONDON, false);
  if (new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay() !== 6) {
    text += "   (Not a Saturday in US Eastern)";
  }
  hint.textContent = text;
}

function initForms() {
  const endpointReady = POST_ENDPOINT_URL && !POST_ENDPOINT_URL.includes("PASTE_YOUR");

  // ----- debate form -----
  $("d-when").addEventListener("input", updateWhenPreview);
  $("d-post").addEventListener("input", refreshPostResults);
  $("d-post").addEventListener("focus", refreshPostResults);
  $("d-host").addEventListener("input", () => {
    if (!$("d-post-results").hidden) refreshPostResults();
  });
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".post-picker")) $("d-post-results").hidden = true;
  });

  if (endpointReady) setupToggle("debate-toggle", "debate-composer", "+ Schedule a debate");

  $("d-submit").addEventListener("click", async () => {
    const status = $("d-status");
    const btn = $("d-submit");

    const host = $("d-host").value.trim();
    const parts = parseEtWall($("d-when").value);
    const subject = $("d-subject").value.trim();
    const discourse = safeUrl(chosenPostUrl || $("d-post").value);
    const meeting = safeUrl($("d-meeting").value);
    const password = $("d-password").value;

    if (!host || !parts || !subject) {
      setStatus(status, "Host name, date and time, and subject are required.", "error"); return;
    }
    if (!discourse) {
      setStatus(status, "Pick a Discourse post from the list, or paste its link.", "error"); return;
    }
    if (!meeting) {
      setStatus(status, "The meeting link must start with http:// or https://", "error"); return;
    }
    if (password !== POST_PASSWORD) {
      setStatus(status, "Incorrect password.", "error"); return;
    }

    const start = etWallToDate(...parts);
    const date = `${parts[0]}-${pad(parts[1])}-${pad(parts[2])} ${pad(parts[3])}:${pad(parts[4])}`;

    btn.disabled = true;
    setStatus(status, "Scheduling\u2026", null);
    try {
      const data = await postJSON({
        type: "debate", host, date, startUtc: start.toISOString(),
        subject, discourse, meeting, password,
      });
      if (data.status !== "ok") {
        setStatus(status, data.message || "Something went wrong. Try again.", "error");
      } else {
        debates.push({ host, subject, discourse, meeting, start });
        renderDebates();
        ["d-subject", "d-post", "d-meeting", "d-password", "d-when"].forEach(id => { $(id).value = ""; });
        chosenPostUrl = "";
        $("d-post-chosen").textContent = "";
        $("d-when-preview").textContent = "";
        if (data.emailError) {
          setStatus(status, "Scheduled. The email notice could not be sent: " + data.emailError, "ok");
        } else if (data.emailed > 0) {
          setStatus(status, "Scheduled. A notice was emailed to " + data.emailed + (data.emailed === 1 ? " fellow." : " fellows."), "ok");
        } else {
          setStatus(status, "Scheduled.", "ok");
        }
      }
    } catch (err) {
      setStatus(status, "Couldn't reach the posting service. In Apps Script, the deployment must be set to Who has access: Anyone. Also check POST_ENDPOINT_URL in js/structure.js.", "error");
      console.error(err);
    }
    btn.disabled = false;
  });

  // ----- fellow registration form -----
  if (endpointReady) setupToggle("fellow-toggle", "fellow-composer", "+ Register a fellow");

  $("f-submit").addEventListener("click", async () => {
    const status = $("f-status");
    const btn = $("f-submit");

    const fellowship = $("f-level").value;
    const firstName = $("f-first").value.trim();
    const lastName = $("f-last").value.trim();
    const email = $("f-email").value.trim();
    const linkedin = $("f-linkedin").value.trim();
    const recommendedBy = $("f-recommender").value.trim();
    const password = $("f-password").value;

    if (!fellowship || !firstName || !lastName || !email) {
      setStatus(status, "Fellowship, first name, last name, and email are required.", "error"); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus(status, "Enter a valid email address.", "error"); return;
    }
    if (linkedin && !safeUrl(linkedin)) {
      setStatus(status, "The LinkedIn link must start with http:// or https://", "error"); return;
    }
    if (password !== POST_PASSWORD) {
      setStatus(status, "Incorrect password.", "error"); return;
    }

    btn.disabled = true;
    setStatus(status, "Registering\u2026", null);
    try {
      const data = await postJSON({
        type: "fellow", fellowship, firstName, lastName, email, linkedin, recommendedBy, password,
      });
      if (data.status !== "ok") {
        setStatus(status, data.message || "Something went wrong. Try again.", "error");
      } else {
        ["f-first", "f-last", "f-email", "f-linkedin", "f-recommender", "f-password"].forEach(id => { $(id).value = ""; });
        $("f-level").value = "";
        setStatus(status, "Registered: " + firstName + " " + lastName + ".", "ok");
      }
    } catch (err) {
      setStatus(status, "Couldn't reach the posting service. In Apps Script, the deployment must be set to Who has access: Anyone. Also check POST_ENDPOINT_URL in js/structure.js.", "error");
      console.error(err);
    }
    btn.disabled = false;
  });
}

try {
  initForms();
} catch (err) {
  // A form problem should never stop the debate list from loading.
  console.error("Structure forms failed to initialize:", err);
}

loadDebates();
loadDiscoursePosts();
