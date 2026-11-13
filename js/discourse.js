/* ==========================================================================
   Intent Collective: Discourse
   A) Reads posts from a Google Sheet published to the web as CSV and
      renders them as cards; clicking a card opens the full post.
   B) Lets a fellow publish a new post from the page itself. Posting goes
      through a Google Apps Script Web App (not the CSV, which is read-only)
      so a new row can actually be added to the sheet. See README.md.
      Corrections to an existing post are made directly in the sheet.

   SETUP: reading
   Sheet's first row must be a header row with these columns
   (case-insensitive, any order):
     Name    - fellow's name
     Title   - post title
     Date    - set automatically by the Apps Script when posting via the site
     Content - the post body (simple HTML from the editor: p, b, i, u, a,
               hr, quotes, headings, lists). [img:URL] or [video:URL]
               (YouTube or Vimeo link) anywhere in the text embeds an image
               or video. See expandMediaTags() below.
     Link    - optional URL to an external version of the piece
     Tag     - optional short tag/category

   SETUP: posting
   See README.md, "Enable posting from the site", to create the Apps Script
   Web App and paste its URL into POST_ENDPOINT_URL below.
   ========================================================================== */

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBQ1XXs9ML_5Bmydn824YJlm7xg-_ueJDw7YxhB4RuVVEfRi495R2E5zOLZ16QCoZQ5n8JXN-Gxo54/pub?output=csv";

// Web app URL from the Apps Script that adds new posts to the sheet.
const POST_ENDPOINT_URL = "https://script.google.com/macros/s/AKfycbxgwEbqAZZH6x0Y5CRAVuKaZjPZx4g16IaBn-Cv3k2URO_y_d-8U4Xkde9HVxxiIOGWRA/exec";

// The posting password is never stored in this file, because the site's
// code is public. The Apps Script checks it, reading it from its private
// Script Properties.

const ENDPOINT_READY = Boolean(POST_ENDPOINT_URL) && !POST_ENDPOINT_URL.includes("PASTE_YOUR");

const stateEl = document.getElementById("state");
const gridEl = document.getElementById("entry-grid");
const countEl = document.getElementById("entry-count");
const toolbarEl = document.getElementById("discourse-toolbar");
const composerRegionEl = document.getElementById("composer-region");
const detailEl = document.getElementById("post-detail");

let currentEntries = [];

/* ---------------- CSV parsing + fetch ---------------- */

// Minimal RFC4180-ish CSV parser: handles quoted fields, embedded commas,
// escaped quotes (""), and embedded newlines inside quoted fields.
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

function rowsToEntries(rows) {
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);

  const iName = idx("name");
  const iTitle = idx("title");
  const iDate = idx("date");
  const iContent = idx("content");
  const iLink = idx("link");
  const iTag = idx("tag");

  return rows.slice(1).map((r, i) => {
    const title = iTitle > -1 ? (r[iTitle] || "").trim() : "Untitled";
    const date = iDate > -1 ? (r[iDate] || "").trim() : "";
    return {
      name: iName > -1 ? (r[iName] || "").trim() : "",
      title,
      date,
      content: iContent > -1 ? (r[iContent] || "").trim() : "",
      link: iLink > -1 ? (r[iLink] || "").trim() : "",
      tag: iTag > -1 ? (r[iTag] || "").trim() : "",
      slug: slugify(title) + "-" + (date ? date.replace(/[^0-9]/g, "") : i),
      order: i,
    };
  }).filter(e => e.title || e.content);
}

/* ---------------- helpers ---------------- */

function slugify(str) {
  return (str || "post").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "") || "post";
}

function stripTags(html) {
  // Insert a space at block-element boundaries first, so text that was on
  // separate lines/paragraphs in the source (e.g. a list of terms) doesn't
  // collapse into one unbroken run-on word once tags are stripped. That is
  // what causes an excerpt to overflow its card instead of wrapping.
  const withBreaks = (html || "").replace(
    /<\/(p|div|li|h[1-6]|blockquote|tr)>|<br\s*\/?>|<hr\s*\/?>/gi,
    " "
  );
  const div = document.createElement("div");
  div.innerHTML = withBreaks;
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

// Removes [img:...] / [video:...] tags from text used in plain-text
// contexts (like the card excerpt), so raw tag syntax never shows up
// where it can't actually render as media.
function stripMediaTags(str) {
  return (str || "").replace(/\[img:[^\]]*\]/g, "").replace(/\[video:[^\]]*\]/g, "");
}

function excerpt(text, len) {
  if (text.length <= len) return text;
  return text.slice(0, len).replace(/\s+\S*$/, "") + "…";
}

function formatDate(d) {
  // Date only, as mm/dd/yyyy. Never shows a time.
  const parsed = new Date(d);
  if (isNaN(parsed)) {
    // Unparseable text: still drop any trailing time so none is shown.
    return String(d).replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(AM|PM|Z)?$/i, "");
  }
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return mm + "/" + dd + "/" + parsed.getFullYear();
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/"/g, "&quot;");
}

// Full escape for values we build into attributes ourselves.
function attr(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ---------------- HTML cleaning (used when saving and pasting) ---------------- */

// Keeps only simple tags and drops every style, class and other attribute,
// so the text stored in the sheet stays short and easy to edit by hand.
// [img:...] and [video:...] markers are plain text and pass through as is.
// Lists and headings stay allowed so older posts keep their formatting,
// even though the editor no longer offers buttons for them.
const CLEAN_ALLOWED = [
  "P", "BR", "B", "STRONG", "I", "EM", "U", "A", "HR",
  "UL", "OL", "LI", "BLOCKQUOTE", "H2", "H3", "H4",
];

function cleanHtml(dirty) {
  const doc = new DOMParser().parseFromString(dirty || "", "text/html");

  // Things that should never be stored
  doc.querySelectorAll("script, style, iframe, object, embed").forEach(n => n.remove());

  (function walk(node) {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === Node.COMMENT_NODE) { child.remove(); return; }
      if (child.nodeType !== Node.ELEMENT_NODE) return; // text stays

      walk(child);

      const tag = child.tagName;

      // Editors often use <div> for paragraphs; store them as <p>
      if (tag === "DIV") {
        const p = doc.createElement("p");
        while (child.firstChild) p.appendChild(child.firstChild);
        child.replaceWith(p);
        return;
      }

      // Unknown tag (span, font, etc.): drop the wrapper, keep the text
      if (!CLEAN_ALLOWED.includes(tag)) {
        child.replaceWith(...Array.from(child.childNodes));
        return;
      }

      // Allowed tag: remove every attribute, except a safe href on links
      const href = tag === "A" ? child.getAttribute("href") : null;
      Array.from(child.attributes).forEach(a => child.removeAttribute(a.name));
      if (href && /^(https?:|mailto:)/i.test(href)) child.setAttribute("href", href);
    });
  })(doc.body);

  return doc.body.innerHTML
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/<p>\s*(<br>)?\s*<\/p>/g, "")
    .replace(/<\/p>\s*<p>/g, "</p>\n<p>") // one paragraph per line in the cell
    .trim();
}

// Allow-list HTML sanitizer for post content coming out of the sheet.
// Anything not in this list is unwrapped (its text/children kept, tag
// dropped) rather than shown raw. This protects the detail view from a
// mistaken or malicious sheet cell. Deliberately does NOT allow IMG or
// IFRAME here. See expandMediaTags() below for how media actually gets
// in, via a controlled tag syntax instead of raw HTML.
const ALLOWED_TAGS = {
  P: [], DIV: [], BR: [], HR: [], B: [], STRONG: [], I: [], EM: [], U: [],
  UL: [], OL: [], LI: [], BLOCKQUOTE: [], H2: [], H3: [], H4: [],
  A: ["href", "target", "rel"],
};

function sanitizeHTML(html) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  cleanNode(doc.body);
  return doc.body.innerHTML;
}

function cleanNode(node) {
  Array.from(node.childNodes).forEach(child => {
    if (child.nodeType === Node.ELEMENT_NODE) {
      cleanNode(child);
      const tag = child.tagName;
      if (ALLOWED_TAGS[tag]) {
        Array.from(child.attributes).forEach(a => {
          if (!ALLOWED_TAGS[tag].includes(a.name)) child.removeAttribute(a.name);
        });
        if (tag === "A") {
          const href = child.getAttribute("href") || "";
          if (!/^https?:\/\//i.test(href)) child.removeAttribute("href");
          else { child.setAttribute("target", "_blank"); child.setAttribute("rel", "noopener"); }
        }
      } else {
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        node.removeChild(child);
      }
    } else if (child.nodeType !== Node.TEXT_NODE) {
      node.removeChild(child);
    }
  });
}

// Turns a YouTube/Vimeo URL into its embeddable form. Returns null if the
// URL isn't recognized, so callers can skip embedding rather than build a
// broken iframe.
function parseVideoEmbed(url) {
  let parsed;
  try {
    parsed = new URL((url || "").trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\.|^m\./, "");

  if (host === "youtube.com" || host === "music.youtube.com") {
    const parts = parsed.pathname.split("/").filter(Boolean);
    let id = parsed.searchParams.get("v");
    if (!id && (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live")) {
      id = parts[1];
    }
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }

  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }

  if (host === "vimeo.com") {
    const parts = parsed.pathname.split("/").filter(Boolean);
    let id = null, hash = null;
    if (parts.length === 2 && /^\d+$/.test(parts[0])) {
      id = parts[0];
      hash = parts[1];
    } else {
      for (let i = parts.length - 1; i >= 0; i--) {
        if (/^\d+$/.test(parts[i])) { id = parts[i]; break; }
      }
    }
    if (!id) return null;
    return hash
      ? `https://player.vimeo.com/video/${id}?h=${hash}`
      : `https://player.vimeo.com/video/${id}`;
  }

  if (host === "player.vimeo.com") return parsed.href;

  return null;
}

// Expands [img:URL] and [video:URL] tags into real, safe HTML. Runs AFTER
// sanitizeHTML(). The tags are just plain text as far as the sanitizer is
// concerned, so they survive it untouched, then get expanded here into
// markup we build ourselves (never raw HTML pulled from the sheet cell).
function expandMediaTags(html) {
  return (html || "")
    .replace(/\[img:([^\]]+)\]/g, (match, rawUrl) => {
      const url = rawUrl.trim();
      if (!/^https?:\/\//i.test(url)) return "";
      return `<img src="${escapeAttr(url)}" alt="" loading="lazy" style="max-width:100%;display:block;margin:1rem 0;">`;
    })
    .replace(/\[video:([^\]]+)\]/g, (match, rawUrl) => {
      const embedSrc = parseVideoEmbed(rawUrl.trim());
      if (!embedSrc) return "";
      return `<div style="position:relative;width:100%;padding-top:56.25%;margin:1rem 0;">` +
        `<iframe src="${escapeAttr(embedSrc)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy" ` +
        `style="position:absolute;inset:0;width:100%;height:100%;border:0;"></iframe></div>`;
    });
}

/* ---------------- editor media blocks ---------------- */

// In the editor, an image or video is shown as a real preview block. It is
// not editable text. On save, each block turns back into its [img:URL] or
// [video:URL] tag, so the sheet and the public page work exactly as before.
function mediaBlockHTML(kind, url) {
  const tag = "[" + kind + ":" + url + "]";
  let preview;
  if (kind === "img") {
    preview = `<img src="${attr(url)}" alt="">`;
  } else {
    const src = parseVideoEmbed(url);
    preview = src
      ? `<div class="rte-video"><iframe src="${attr(src)}" loading="lazy" tabindex="-1"></iframe></div>`
      : `<div class="rte-media-note">${escapeHTML(tag)}</div>`;
  }
  return `<div class="rte-media" contenteditable="false" data-tag="${attr(tag)}">` +
    preview +
    `<button type="button" class="rte-media-remove" contenteditable="false" aria-label="Remove">×</button></div>`;
}

// Editor HTML -> stored content (preview blocks become tags).
function editorToContent(html) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  doc.querySelectorAll(".rte-media").forEach(el => {
    const p = doc.createElement("p");
    p.textContent = el.getAttribute("data-tag") || "";
    el.replaceWith(p);
  });
  return cleanHtml(doc.body.innerHTML);
}

/* ---------------- list view ---------------- */

function setState(message, isError) {
  stateEl.hidden = false;
  gridEl.hidden = true;
  stateEl.textContent = message;
  stateEl.classList.toggle("is-error", Boolean(isError));
}

function renderEntries(entries) {
  currentEntries = entries.slice();

  currentEntries.sort((a, b) => {
    const da = new Date(a.date), db = new Date(b.date);
    if (isNaN(da) || isNaN(db)) return 0;
    if (db - da !== 0) return db - da;
    // Same day (the sheet may store the date without a time): the row that
    // sits lower in the sheet was added later, so it goes first.
    return (b.order || 0) - (a.order || 0);
  });

  if (!currentEntries.length) {
    setState("No entries yet. The first post added will show up here.");
    countEl.textContent = "";
    return;
  }

  gridEl.innerHTML = "";
  currentEntries.forEach(e => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "entry-card";
    card.innerHTML = `
      <div class="entry-meta">
        <span>${e.tag ? escapeHTML(e.tag) : "Discourse"}</span>
        <span>${e.date ? formatDate(e.date) : ""}</span>
      </div>
      <h3>${escapeHTML(e.title)}</h3>
      <p class="excerpt">${escapeHTML(excerpt(stripTags(stripMediaTags(e.content)), 220))}</p>
      <div class="byline">${e.name ? escapeHTML(e.name) : ""}</div>
    `;
    card.addEventListener("click", () => { location.hash = "post-" + e.slug; });
    gridEl.appendChild(card);
  });

  stateEl.hidden = true;
  gridEl.hidden = false;
  countEl.textContent = `${currentEntries.length} ${currentEntries.length === 1 ? "entry" : "entries"}`;
}

/* ---------------- detail view + hash routing ---------------- */

function showList() {
  detailEl.hidden = true;
  toolbarEl.hidden = false;
  composerRegionEl.hidden = false;
  gridEl.hidden = currentEntries.length === 0;
  stateEl.hidden = currentEntries.length !== 0;
}

function showDetail(entry) {
  toolbarEl.hidden = true;
  composerRegionEl.hidden = true;
  gridEl.hidden = true;
  stateEl.hidden = true;

  detailEl.hidden = false;
  detailEl.innerHTML = `
    <a href="#" class="back-link" id="back-link">← All posts</a>
    <div class="mark-label">${entry.tag ? escapeHTML(entry.tag) : "Discourse"}</div>
    <h1>${escapeHTML(entry.title)}</h1>
    <div class="post-meta">${entry.name ? escapeHTML(entry.name) : "Anonymous"}${entry.date ? " · " + formatDate(entry.date) : ""}</div>
    <div class="post-body">${expandMediaTags(sanitizeHTML(entry.content))}</div>
  `;
  document.getElementById("back-link").addEventListener("click", (ev) => {
    ev.preventDefault();
    history.pushState("", document.title, window.location.pathname + window.location.search);
    showList();
  });
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function handleHash() {
  const hash = decodeURIComponent(location.hash || "");
  if (hash.startsWith("#post-")) {
    const slug = hash.slice(6);
    const entry = currentEntries.find(e => e.slug === slug);
    if (entry) { showDetail(entry); return; }
  }
  showList();
}

window.addEventListener("hashchange", handleHash);

/* ---------------- loading the feed ---------------- */

async function loadEntries() {
  if (!SHEET_CSV_URL || SHEET_CSV_URL.includes("PASTE_YOUR")) {
    setState(
      "Discourse isn\u2019t connected yet. Paste your published Google Sheet CSV URL into js/discourse.js.",
      true
    );
    return;
  }

  try {
    const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Sheet responded with ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    const entries = rowsToEntries(rows);
    renderEntries(entries);
    handleHash();
  } catch (err) {
    setState(
      "Couldn\u2019t load entries from the sheet. Check that it\u2019s published to the web as CSV and that the URL in js/discourse.js is correct.",
      true
    );
    console.error(err);
  }
}

/* ---------------- compose form (part B) ---------------- */

try {
  const composeToggle = document.getElementById("compose-toggle");
  const composer = document.getElementById("composer");
  const rteBody = document.getElementById("rte-body");
  const composerStatus = document.getElementById("composer-status");
  const publishBtn = document.getElementById("publish-btn");
  const nameInput = document.getElementById("compose-name");
  const titleInput = document.getElementById("compose-title");
  const passwordInput = document.getElementById("compose-password");

  if (!ENDPOINT_READY) {
    composeToggle.hidden = true;
  } else {
    composeToggle.addEventListener("click", () => {
      composer.classList.toggle("hidden");
      composeToggle.setAttribute("aria-expanded", String(!composer.classList.contains("hidden")));
    });
  }

  function setComposerStatus(message, kind) {
    composerStatus.textContent = message || "";
    composerStatus.classList.toggle("is-error", kind === "error");
    composerStatus.classList.toggle("is-ok", kind === "ok");
  }

  /* ----- editor toolbar ----- */

  // Remember where the cursor was, so a dialog (link, image, video) can
  // put its result back in the right place.
  let savedRange = null;
  function saveRange() {
    const sel = window.getSelection();
    savedRange = sel.rangeCount && rteBody.contains(sel.anchorNode)
      ? sel.getRangeAt(0).cloneRange()
      : null;
  }
  function restoreRange() {
    rteBody.focus();
    if (savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
  }

  function insertMedia(kind, url) {
    restoreRange();
    document.execCommand("insertHTML", false, mediaBlockHTML(kind, url) + "<p><br></p>");
  }

  document.querySelectorAll(".rte-toolbar [data-cmd]").forEach(btn => {
    // Keep the cursor in the editor when a toolbar button is pressed.
    btn.addEventListener("mousedown", (ev) => ev.preventDefault());

    btn.addEventListener("click", () => {
      rteBody.focus();
      const cmd = btn.getAttribute("data-cmd");

      if (cmd === "createLink") {
        saveRange();
        const url = (prompt("Link URL (including https://)") || "").trim();
        if (!url) return;
        if (!/^(https?:|mailto:)/i.test(url)) {
          alert("The link must start with https://, http:// or mailto:");
          return;
        }
        restoreRange();
        document.execCommand("createLink", false, url);
        return;
      }

      if (cmd === "image") {
        saveRange();
        const url = (prompt("Image URL (a direct link to the image file)") || "").trim();
        if (!url) return;
        if (!/^https?:\/\/\S+$/i.test(url) || url.includes("]")) {
          alert("The image link must start with https:// or http://");
          return;
        }
        const probe = new Image();
        probe.onload = () => insertMedia("img", url);
        probe.onerror = () => alert("That image could not be loaded. Use a direct link to an image file, such as one ending in .jpg, .png, .gif or .webp.");
        probe.src = url;
        return;
      }

      if (cmd === "video") {
        saveRange();
        const url = (prompt("YouTube or Vimeo link") || "").trim();
        if (!url) return;
        if (!/^https?:\/\/\S+$/i.test(url) || url.includes("]") || !parseVideoEmbed(url)) {
          alert("Use a YouTube or Vimeo link, for example https://youtu.be/… or https://vimeo.com/…");
          return;
        }
        insertMedia("video", url);
        return;
      }

      document.execCommand(cmd, false, null);
    });
  });

  // The remove button on an image or video block.
  rteBody.addEventListener("click", (ev) => {
    const remove = ev.target.closest(".rte-media-remove");
    if (remove) remove.closest(".rte-media").remove();
  });

  rteBody.addEventListener("focus", () => {
    document.execCommand("defaultParagraphSeparator", false, "p");
  });

  // Clean whatever is pasted into the editor, so styles from Pages, Word
  // or web pages never come along.
  rteBody.addEventListener("paste", (e) => {
    e.preventDefault();
    const cd = e.clipboardData || window.clipboardData;
    let html = cd.getData("text/html");
    if (!html) {
      html = cd.getData("text/plain")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .split(/\n{2,}/)
        .map(s => "<p>" + s.replace(/\n/g, "<br>") + "</p>")
        .join("");
    }
    document.execCommand("insertHTML", false, cleanHtml(html));
  });

  /* ----- publish ----- */

  function clearComposer() {
    nameInput.value = "";
    titleInput.value = "";
    passwordInput.value = "";
    rteBody.innerHTML = "";
  }

  if (publishBtn) {
    publishBtn.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      const title = titleInput.value.trim();
      const content = editorToContent(rteBody.innerHTML);
      const password = passwordInput.value;

      if (!name || !title || stripTags(content).trim().length === 0) {
        setComposerStatus("Name, title, and content are all required.", "error");
        return;
      }
      if (!password) {
        setComposerStatus("Enter the password.", "error");
        return;
      }

      publishBtn.disabled = true;
      setComposerStatus("Publishing…", null);

      try {
        const res = await fetch(POST_ENDPOINT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight
          body: JSON.stringify({ name, title, content, password }),
        });
        const data = await res.json();

        if (data.status !== "ok") {
          setComposerStatus(data.message || "Something went wrong. Try again.", "error");
          publishBtn.disabled = false;
          return;
        }

        // Optimistic UI: show it immediately, ahead of the sheet's CSV cache
        // refresh (which can lag a few minutes behind the actual edit).
        const newEntry = {
          name, title, content,
          date: new Date().toISOString(),
          link: "", tag: "",
          slug: slugify(title) + "-" + Date.now(),
          order: Number.MAX_SAFE_INTEGER,
        };
        renderEntries([newEntry, ...currentEntries]);

        clearComposer();
        composer.classList.add("hidden");
        composeToggle.setAttribute("aria-expanded", "false");
        setComposerStatus("Published. (It may take a few minutes to also show up after the sheet\u2019s own refresh.)", "ok");
      } catch (err) {
        setComposerStatus("Couldn\u2019t reach the posting service. Check POST_ENDPOINT_URL in js/discourse.js.", "error");
        console.error(err);
      }
      publishBtn.disabled = false;
    });
  }
} catch (err) {
  // A missing element or unexpected DOM state here should never blank the
  // whole page. The read-only feed above still works either way.
  console.error("Discourse composer failed to initialize:", err);
}

loadEntries();
