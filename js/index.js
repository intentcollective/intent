/* ==========================================================================
   Intent Collective: Index page
   A) Shows every upcoming live debate, soonest first, read from the same
      published Debate Schedule sheet the Structure page uses. The next one
      is highlighted with a red outline. If nothing is scheduled, it shows
      the most recent past debate instead, without the highlight.
   B) Opens the full manifesto when the page is reached through the
      Manifesto link in the navigation (index.html#manifesto). Scrolling
      to the section is handled by js/anchors.js.

   Nothing here writes data. Debates are scheduled on the Structure page.
   The schedule address is set in js/config.js.
   ========================================================================== */

const DEBATE_CSV_URL = (window.IC_CONFIG && window.IC_CONFIG.DEBATE_CSV_URL) || "https://docs.google.com/spreadsheets/d/e/2PACX-1vR9ZJLaJ6cAp46DwDBtRw2M4VN6iZzUb3M94T71lmpiCi7niP7Qsxlnn8wIyrEJj2rxEtlhlKh49afy/pub?gid=335122004&single=true&output=csv";

const TZ_ET = "America/New_York";
const TZ_SEOUL = "Asia/Seoul";
const TZ_LONDON = "Europe/London";

// A session stays "upcoming" until this long after it starts.
const SESSION_WINDOW_MS = 2 * 60 * 60 * 1000;

const $ = (id) => document.getElementById(id);

/* ---------------- helpers (same logic as js/structure.js) ---------------- */

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function safeUrl(u) {
  u = (u || "").trim();
  return /^https?:\/\//i.test(u) ? u : "";
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

// Turns a wall-clock time in US Eastern into a real instant (handles DST).
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


/* ---------------- Join link: opens one hour before the debate ---------------- */

// The meeting link is shown only from this long before the start. Zoom itself
// should also have "Join before host" turned off and the waiting room on.
const JOIN_OPENS_MS = 60 * 60 * 1000;

function joinSlotHTML(d) {
  const url = String(d.meeting).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<span class="join-slot" data-start="${d.start.toISOString()}" data-meeting="${url}"></span>`;
}

// Fills each slot with the Join link or a note, and flips it by itself when
// the hour arrives. Called after drawing and every 30 seconds.
function updateJoinSlots() {
  const now = Date.now();
  document.querySelectorAll(".join-slot").forEach(slot => {
    const open = now >= new Date(slot.dataset.start).getTime() - JOIN_OPENS_MS;
    const state = open ? "open" : "closed";
    if (slot.dataset.state === state) return;
    slot.dataset.state = state;
    slot.classList.toggle("join-note", !open);
    if (open && /^https?:\/\//i.test(slot.dataset.meeting)) {
      const a = document.createElement("a");
      a.href = slot.dataset.meeting;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Join online >>";
      slot.replaceChildren(a);
    } else {
      slot.textContent = "Join link opens one hour before the debate.";
    }
  });
}

setInterval(updateJoinSlots, 30000);

/* ---------------- next debate ---------------- */

function debateCardHTML(d, label, isPast, isNext) {
  const links = [];
  if (d.discourse) links.push(`<a href="${escapeHTML(d.discourse)}">Read the discourse post &gt;&gt;</a>`);
  if (d.meeting && !isPast) links.push(joinSlotHTML(d));

  const times = [fmtZone(d.start, TZ_ET, true)];
  if (!isPast) {
    times.push(fmtZone(d.start, TZ_SEOUL, false) + ", Seoul");
    times.push(fmtZone(d.start, TZ_LONDON, false) + ", London");
  }

  return `
    <article class="entry-card debate-card${isNext ? " is-next" : ""}">
      <div class="entry-meta"><span>${escapeHTML(label)}</span></div>
      <h3>${escapeHTML(d.subject)}</h3>
      <div class="debate-info">
        ${d.host ? `<div class="debate-host">Hosted by ${escapeHTML(d.host)}</div>` : ""}
        ${times.map(t => `<div>${escapeHTML(t)}</div>`).join("")}
      </div>
      ${links.length ? `<div class="debate-links">${links.join("")}</div>` : ""}
    </article>`;
}

function showNextDebate(debates) {
  const stateEl = $("next-debate-state");
  const cardEl = $("next-debate");
  const helpEl = $("next-debate-help");
  const now = Date.now();

  const upcoming = debates
    .filter(d => d.start.getTime() + SESSION_WINDOW_MS >= now)
    .sort((a, b) => a.start - b.start);
  const past = debates
    .filter(d => d.start.getTime() + SESSION_WINDOW_MS < now)
    .sort((a, b) => b.start - a.start);

  if (upcoming.length) {
    cardEl.innerHTML = upcoming
      .map((d, i) => debateCardHTML(d, i === 0 ? "Next debate" : "Upcoming debate", false, i === 0))
      .join("");
    cardEl.hidden = false;
    helpEl.hidden = false;
    stateEl.hidden = true;
    updateJoinSlots();
    return;
  }

  // Nothing scheduled: show the most recent debate from the archive.
  stateEl.hidden = false;
  stateEl.classList.remove("is-error");
  if (past.length) {
    stateEl.textContent = "No debate is scheduled right now. Here is the most recent one.";
    cardEl.innerHTML = debateCardHTML(past[0], "Most recent debate", true, false);
    cardEl.hidden = false;
  } else {
    stateEl.textContent = "No debates are scheduled right now. The next one will appear here.";
  }
}

async function loadNextDebate() {
  const stateEl = $("next-debate-state");
  if (!stateEl) return;
  try {
    const res = await fetch(DEBATE_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Sheet responded with " + res.status);
    showNextDebate(rowsToDebates(parseCSV(await res.text())));
  } catch (err) {
    stateEl.hidden = false;
    stateEl.classList.add("is-error");
    stateEl.textContent = "Couldn't load the next debate. See all debates on the Structure page.";
    console.error(err);
  }
}

/* ---------------- manifesto link ---------------- */

// The Manifesto link in the navigation opens the full text.
function openManifestoIfLinked() {
  if (location.hash !== "#manifesto") return;
  const full = $("manifesto-full");
  if (full) full.open = true;
}

window.addEventListener("hashchange", openManifestoIfLinked);
openManifestoIfLinked();
loadNextDebate();
