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

// Each upcoming card has two slots. The "top" slot, right under the title,
// holds the Join button once it opens, so the live action leads the card.
// The "note" slot, at the bottom, says when the link will open until then.
function joinSlotHTML(d, pos) {
  const url = String(d.meeting).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<span class="join-slot join-${pos}" data-pos="${pos}" data-start="${d.start.toISOString()}" data-meeting="${url}"></span>`;
}

// Fills the slots and flips them by itself when the hour arrives. While
// Join is open the card is marked .is-live (thicker red outline) and, on the
// Index, the hero's notice button gives way to "Join the live debate".
// Called after drawing and every 30 seconds.
function updateJoinSlots() {
  const now = Date.now();
  let liveUrl = "";
  document.querySelectorAll(".join-slot").forEach(slot => {
    const valid = /^https?:\/\//i.test(slot.dataset.meeting);
    const open = valid && now >= new Date(slot.dataset.start).getTime() - JOIN_OPENS_MS;
    const card = slot.closest(".debate-card");
    if (card) card.classList.toggle("is-live", open);
    if (open && !liveUrl && card && card.classList.contains("is-next")) liveUrl = slot.dataset.meeting;

    const state = open ? "open" : "closed";
    if (slot.dataset.state === state) return;
    slot.dataset.state = state;

    if (slot.dataset.pos === "top") {
      if (open) {
        const a = document.createElement("a");
        a.href = slot.dataset.meeting;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "Join online";
        slot.replaceChildren(a);
      } else {
        slot.replaceChildren();
      }
      slot.hidden = !open;
    } else {
      slot.classList.add("join-note");
      slot.textContent = open ? "" : "Join link opens one hour before the debate.";
      slot.hidden = open;
    }
  });

  const heroJoin = document.getElementById("hero-join");
  if (heroJoin) {
    heroJoin.hidden = !liveUrl;
    if (liveUrl) heroJoin.href = liveUrl;
    document.body.classList.toggle("join-live", !!liveUrl);
  }
}

setInterval(updateJoinSlots, 30000);

/* ---------------- next debate ---------------- */

function debateCardHTML(d, label, isPast, isNext) {
  const links = [];
  if (d.discourse) links.push(`<a href="${escapeHTML(d.discourse)}">Read the discourse post &gt;</a>`);
  if (!isPast && typeof calendarLinksHTML === "function") links.push(calendarLinksHTML(d));
  if (d.meeting && !isPast) links.push(joinSlotHTML(d, "note"));

  const times = [fmtZone(d.start, TZ_ET, true)];
  if (!isPast) {
    times.push(fmtZone(d.start, TZ_SEOUL, false) + ", Seoul");
    times.push(fmtZone(d.start, TZ_LONDON, false) + ", London");
  }

  return `
    <article class="entry-card debate-card${isNext ? " is-next" : ""}">
      <div class="entry-meta"><span>${escapeHTML(label)}</span></div>
      <h3>${escapeHTML(d.subject)}</h3>
      ${d.meeting && !isPast ? joinSlotHTML(d, "top") : ""}
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
