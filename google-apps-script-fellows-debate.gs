/**
 * Intent Collective: Fellows, Debate Schedule and email notices.
 *
 * One script, one deployment. The website sends it one of:
 *   type "fellow":    adds a row to the "Fellows" tab (password required).
 *   type "debate":    adds a row to the "Debate Schedule" tab (password
 *                     required), then emails a notice to every Fellow and
 *                     every confirmed Subscriber.
 *   type "subscribe": a public sign-up for debate notices (no password).
 *                     Adds a "pending" row to the "Subscribers" tab and
 *                     emails a confirmation link. Only people who click the
 *                     link (status "confirmed") receive notices.
 *
 * The same web app also answers two links from emails (doGet):
 *   ?action=confirm&t=TOKEN      confirms a subscription
 *   ?action=unsubscribe&t=TOKEN  unsubscribes
 *
 * Setup: see README.md, "Fellows and Debate Schedule".
 *
 * The password check below is the real gate for Fellows and debates. The
 * copy in js/structure.js only gives instant feedback in the page.
 *
 * EMAIL SENDER: emails are sent from the Google account that DEPLOYS this
 * script ("Execute as: Me"). To have them come from
 * intentcollectivedesign@gmail.com, create the spreadsheet and deploy the
 * script while signed in as that account.
 *
 * DAILY LIMIT AND THE OUTBOX:
 *   A regular Gmail account can send to about 100 recipients a day. When a
 *   debate is scheduled, every Fellow and confirmed Subscriber is added to
 *   the "Outbox" tab, as many notices as today's allowance permits are sent
 *   right away (Fellows first), and the rest go out automatically in the
 *   following hours and days. Run installNoticeTrigger() once to switch the
 *   automatic part on. A notice is never sent after its debate has started,
 *   and anyone who unsubscribes while waiting is skipped.
 *
 * REMINDERS AND CALENDAR:
 *   When a debate is scheduled more than a day ahead, a reminder for each
 *   recipient is also queued, due 24 hours before the start. Both the notice
 *   and the reminder have an "Add to calendar" link (Google Calendar) and an
 *   attached .ics file (Apple Calendar, Outlook). Emails never contain the
 *   meeting link: they point to the website, where the Join link appears one
 *   hour before the debate.
 *
 * PUBLIC DEBATE CALENDAR:
 *   Every debate in the "Debate Schedule" tab is also kept as an event in a
 *   public Google Calendar that anyone can subscribe to. The script adds an
 *   event when a debate is scheduled, and the hourly timer keeps the calendar
 *   in step with the tab: edit a row and the event follows, delete the row of
 *   a future debate and its event is removed. The event never contains the
 *   meeting link, and has no location, because calendars offer map
 *   directions for a location. Notice emails and the "You're subscribed"
 *   page link to the whole calendar. Run syncDebateCalendar() by hand to sync right away.
 *
 * SENDING ORDER:
 *   Principal Design Fellows first, then Design Fellows, then Subscribers.
 *
 * BOUNCE PROTECTION:
 *   1. An email address is checked when someone registers or subscribes:
 *      correct format, and a domain that can receive mail.
 *   2. A person whose Status is "bounced", "skip" or "unsubscribed" is
 *      never emailed.
 *   3. Run flagBouncedFellows() (by hand, or on a daily time trigger) to
 *      read Gmail delivery-failure notices and mark those people "bounced"
 *      in both the Fellows and Subscribers tabs.
 */

var PASSWORD = "designeverything1234";

// Tab names. Change these if your tabs are named differently.
var FELLOWS_TAB = "Fellows";
var SUBSCRIBERS_TAB = "Subscribers";
var DEBATE_TAB = "Debate Schedule";

// Leave empty if Fellows, Subscribers and Debate Schedule are tabs of the
// SAME spreadsheet this script is bound to. If your Fellows list lives in a
// different spreadsheet, paste that spreadsheet's ID here (the long string
// in its URL between /d/ and /edit). The Subscribers tab is kept there too.
var FELLOWS_SPREADSHEET_ID = "";

// Set to false to stop the automatic email notice.
var SEND_EMAIL_NOTICE = true;

// Display name shown on the emails.
var SENDER_NAME = "Intent Collective";

// The website. Used for links and for the wordmark image in emails.
var SITE_URL = "https://intentcollective.design";
var SITE_STRUCTURE_URL = SITE_URL + "/structure.html";
var WORDMARK_URL = SITE_URL + "/assets/wordmark.png";

// Shown in email footers.
var CONTACT_EMAIL = "intentcollectivedesign@gmail.com";

// Leave empty. The script finds its own web app address. Only fill this in
// (with the /exec URL) if confirm and unsubscribe links point to the wrong
// address.
var WEB_APP_URL = "";

// Notices that do not fit in today's email allowance wait in an "Outbox" tab
// and go out automatically (see installNoticeTrigger below).
var OUTBOX_TAB = "Outbox";
var MAIL_RESERVE = 10;   // emails kept free each day for sign-up confirmations
var MAX_INLINE = 40;     // notices sent right away when a debate is scheduled
var MAX_PER_RUN = 90;    // notices sent by each automatic run
var REMINDER_HOURS = 24; // a reminder is sent this long before each debate

// The public debate calendar. Leave empty to switch the calendar off. The
// account that deploys this script must own the calendar, or have "Make
// changes to events" permission on it.
var DEBATE_CALENDAR_ID = "3729e8fbea5bb9d3e3fb53472411ca5c4c8b501deff3b56945bc158dbd5c150a@group.calendar.google.com";

// Links that subscribe someone to the whole calendar, so every future debate
// appears by itself. webcal:// makes Apple Calendar and Outlook subscribe
// instead of importing a one-time copy.
var CAL_SUBSCRIBE_GOOGLE = DEBATE_CALENDAR_ID
  ? "https://calendar.google.com/calendar/u/0?cid=" + Utilities.base64Encode(DEBATE_CALENDAR_ID).replace(/=+$/, "")
  : "";
var CAL_SUBSCRIBE_ICAL = DEBATE_CALENDAR_ID
  ? "webcal://calendar.google.com/calendar/ical/" + encodeURIComponent(DEBATE_CALENDAR_ID) + "/public/basic.ics"
  : "";

// Anyone with one of these statuses is never emailed.
var SKIP_STATUSES = ["bounced", "skip", "unsubscribed"];

// A pending subscriber who signs up again within this time is not sent a
// second confirmation email.
var CONFIRM_RESEND_MS = 60 * 60 * 1000;

var SUBSCRIBE_REPLY = "Thank you. If this address can receive our notices, a confirmation email is on its way. Please click the link in it to finish. Check your spam folder if it does not arrive.";

// Site colors, used in emails.
var C_PAPER = "#E4E1D6";
var C_RAISED = "#EDEAE0";
var C_INK = "#211F1A";
var C_SOFT = "#55524A";
var C_MARK = "#B23A2E";
var C_LINE = "#CFCBBE";

/* ================= web app entry points ================= */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Public sign-up: no password.
    if (data.type === "subscribe") return handleSubscribe(data);

    if (data.password !== PASSWORD) {
      return respond({ status: "error", message: "Incorrect password." });
    }

    if (data.type === "fellow") return handleFellow(data);
    if (data.type === "debate") return handleDebate(data);

    return respond({ status: "error", message: "Unknown request type." });
  } catch (err) {
    return respond({ status: "error", message: err.message });
  }
}

// Links from emails: confirm or unsubscribe.
function doGet(e) {
  var p = (e && e.parameter) || {};
  var token = String(p.t || "").trim();
  try {
    if (p.action === "confirm" && token) return messagePage(handleConfirm(token));
    if (p.action === "unsubscribe" && token) return messagePage(handleUnsubscribe(token));
  } catch (err) {
    return messagePage({ title: "Something went wrong", message: "Please try the link again, or write to " + CONTACT_EMAIL + "." });
  }
  return messagePage({ title: "Intent Collective", message: "A global collective for live debate among designers." });
}

/* ================= fellow registration ================= */

function handleFellow(data) {
  if (!data.fellowship || !data.firstName || !data.lastName || !data.email) {
    return respond({ status: "error", message: "Missing required fields." });
  }

  var email = String(data.email).trim().toLowerCase();
  if (!isValidEmailFormat(email)) {
    return respond({ status: "error", message: "Enter a valid email address." });
  }
  if (!domainCanReceiveMail(email)) {
    return respond({
      status: "error",
      message: "That email's domain can't receive mail. Please check for typos."
    });
  }

  var sheet = getFellowsSheet();
  if (!sheet) return respond({ status: "error", message: 'Tab "' + FELLOWS_TAB + '" not found.' });

  var values = {
    "fellowship": data.fellowship,
    "first name": data.firstName,
    "last name": data.lastName,
    "email": email,
    "linkedin": data.linkedin || "",
    "recommended by": data.recommendedBy || "",
    "added": new Date()
  };
  appendByHeader(sheet, values, null);
  return respond({ status: "ok" });
}

/* ================= public subscription ================= */

function handleSubscribe(data) {
  // A hidden field that real visitors never fill in. Bots do.
  if (data.website) return respond({ status: "ok", message: SUBSCRIBE_REPLY });

  var first = cleanText(data.firstName);
  var last = cleanText(data.lastName);
  var email = String(data.email || "").trim().toLowerCase();

  if (!first || !last || !email) {
    return respond({ status: "error", message: "First name, last name, and email are required." });
  }
  if (!isValidEmailFormat(email)) {
    return respond({ status: "error", message: "Enter a valid email address." });
  }
  if (!domainCanReceiveMail(email)) {
    return respond({ status: "error", message: "That email's domain can't receive mail. Please check for typos." });
  }
  if (MailApp.getRemainingDailyQuota() < 5) {
    return respond({ status: "error", message: "Sign-ups are paused for today. Please try again tomorrow." });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = getSubscribersSheet(true);
    ensureColumn(sheet, "status", "Status");
    ensureColumn(sheet, "token", "Token");
    var t = readTable(sheet);
    var rowIdx = findRowIndex(t, "email", email);
    var now = new Date();
    var token = "";
    var send = false;

    if (rowIdx === -1) {
      token = newToken();
      appendByHeader(sheet, {
        "first name": first,
        "last name": last,
        "email": email,
        "added": now,
        "status": "pending",
        "token": token
      }, null);
      send = true;
    } else {
      var row = t.rows[rowIdx];
      var status = String(row[t.col["status"]] || "").trim().toLowerCase();
      var rowNum = rowIdx + 2;

      if (status === "unsubscribed") {
        token = newToken();
        sheet.getRange(rowNum, t.col["status"] + 1).setValue("pending");
        sheet.getRange(rowNum, t.col["token"] + 1).setValue(token);
        sheet.getRange(rowNum, t.col["added"] + 1).setValue(now);
        send = true;
      } else if (status === "pending" || status === "") {
        var added = row[t.col["added"]];
        if (!(added instanceof Date) || now.getTime() - added.getTime() > CONFIRM_RESEND_MS) {
          token = String(row[t.col["token"]] || "").trim() || newToken();
          sheet.getRange(rowNum, t.col["token"] + 1).setValue(token);
          sheet.getRange(rowNum, t.col["added"] + 1).setValue(now);
          send = true;
        }
      }
      // confirmed, bounced and skip: nothing to send.
    }

    if (send) sendConfirmationEmail(first, email, token);
  } finally {
    lock.releaseLock();
  }

  // The same answer in every case, so the form never reveals who is on the list.
  return respond({ status: "ok", message: SUBSCRIBE_REPLY });
}

function handleConfirm(token) {
  var sheet = getSubscribersSheet(false);
  if (!sheet) return invalidLink();
  var t = readTable(sheet);
  var rowIdx = findRowIndex(t, "token", token);
  if (rowIdx === -1) return invalidLink();

  var status = String(t.rows[rowIdx][t.col["status"]] || "").trim().toLowerCase();
  if (status === "bounced" || status === "skip") {
    return { title: "We couldn't confirm this address", message: "Please write to " + CONTACT_EMAIL + " and we will help." };
  }
  if (status !== "confirmed") {
    sheet.getRange(rowIdx + 2, t.col["status"] + 1).setValue("confirmed");
  }
  return {
    title: "You're subscribed",
    message: "You will get an email when Intent Collective schedules a live debate. Every notice has an unsubscribe link.",
    note: CAL_SUBSCRIBE_GOOGLE ? "You can also put every debate on your calendar, automatically:" : "",
    links: CAL_SUBSCRIBE_GOOGLE ? [
      { label: "Google Calendar", url: CAL_SUBSCRIBE_GOOGLE },
      { label: "Apple or Outlook", url: CAL_SUBSCRIBE_ICAL }
    ] : []
  };
}

function handleUnsubscribe(token) {
  var sheet = getSubscribersSheet(false);
  if (!sheet) return invalidLink();
  var t = readTable(sheet);
  var rowIdx = findRowIndex(t, "token", token);
  if (rowIdx === -1) return invalidLink();

  sheet.getRange(rowIdx + 2, t.col["status"] + 1).setValue("unsubscribed");
  return {
    title: "You're unsubscribed",
    message: "You will not get any more debate notices. You are always welcome at the debates themselves."
  };
}

function invalidLink() {
  return { title: "This link is no longer valid", message: "If you want debate notices, you can sign up again on " + SITE_URL + "." };
}

/* ================= debate scheduling ================= */

function handleDebate(data) {
  if (!data.host || !data.date || !data.subject || !data.meeting || !data.discourse) {
    return respond({ status: "error", message: "Missing required fields." });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DEBATE_TAB);
  if (!sheet) return respond({ status: "error", message: 'Tab "' + DEBATE_TAB + '" not found.' });

  var values = {
    "host": data.host,
    "date": data.date,            // "YYYY-MM-DD HH:mm", US Eastern wall time
    "subject": data.subject,
    "discourse": data.discourse,
    "meeting": data.meeting,
    "added": new Date()
  };
  // Keep the Date cell as plain text so Sheets does not reformat it.
  appendByHeader(sheet, values, "date");

  var result = { status: "ok", emailed: 0, queued: 0 };
  if (SEND_EMAIL_NOTICE) {
    try {
      enqueueNotices(data);
      result.emailed = processOutbox(MAX_INLINE);
      result.queued = countQueued(true);
      if (countQueued(false) > 0 && !noticeTriggerInstalled()) {
        result.emailError = "Some notices and reminders are waiting. Run installNoticeTrigger once in the script editor so they go out automatically.";
      }
    } catch (err) {
      result.emailError = err.message;
    }
  }
  try { syncDebateCalendar(); } catch (err) { /* the hourly run retries */ }
  return respond(result);
}

// Adds Outbox rows: a notice for every recipient and, when the debate is
// more than a day away, a reminder for every recipient due 24 hours before
// it. The debate's details are stored with each row.
function enqueueNotices(data) {
  var recipients = collectRecipients();
  if (!recipients.length) return 0;

  var sheet = getOutboxSheet(true);
  var payload = JSON.stringify({
    subject: data.subject, host: data.host, discourse: data.discourse,
    date: data.date, startUtc: data.startUtc
  });
  var now = new Date();
  var start = new Date(data.startUtc);
  var objs = [];

  recipients.forEach(function (r) { objs.push(outboxRow(now, r, payload, "notice", "")); });

  if (!isNaN(start.getTime())) {
    var due = new Date(start.getTime() - REMINDER_HOURS * 3600 * 1000);
    if (due.getTime() > now.getTime() + 30 * 60 * 1000) {
      recipients.forEach(function (r) { objs.push(outboxRow(now, r, payload, "reminder", due)); });
    }
  }

  appendObjectsByHeader(sheet, objs);
  return objs.length;
}

function outboxRow(now, r, payload, type, sendAfter) {
  return {
    "created": now, "email": r.email, "first name": r.first, "kind": r.kind,
    "token": r.token, "payload": payload, "status": "queued", "sent": "",
    "type": type, "send after": sendAfter, "priority": r.priority
  };
}

// Run on a timer by installNoticeTrigger().
function processOutboxTrigger() {
  processOutbox(MAX_PER_RUN);
  try { syncDebateCalendar(); } catch (err) { console.error("Calendar sync: " + err.message); }
}

// Sends queued emails that are due, as many as today's allowance and `limit`
// permit. Returns how many were sent.
function processOutbox(limit) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return 0;
  try {
    return runOutbox(limit);
  } finally {
    lock.releaseLock();
  }
}

function runOutbox(limit) {
  var sheet = getOutboxSheet(false);
  if (!sheet || sheet.getLastRow() < 2) return 0;

  var t = readTable(sheet);
  var c = t.col;
  var nowMs = Date.now();
  var pending = [];

  t.rows.forEach(function (row, i) {
    if (String(row[c["status"]]).trim().toLowerCase() !== "queued") return;

    var type = c["type"] !== undefined ? String(row[c["type"]]).trim().toLowerCase() : "";
    if (type !== "reminder") type = "notice";

    // Reminders wait until their time.
    var after = c["send after"] !== undefined ? row[c["send after"]] : "";
    if (after instanceof Date && after.getTime() > nowMs) return;

    var kind = String(row[c["kind"]]);
    var priority = c["priority"] !== undefined ? Number(row[c["priority"]]) : NaN;
    if (!priority) priority = kind === "fellow" ? 2 : 3;

    pending.push({ i: i, row: row, type: type, priority: priority });
  });
  if (!pending.length) return 0;

  // Reminders are the most urgent, then Principal Design Fellows, Design
  // Fellows and Subscribers, each in the order they were queued.
  pending.sort(function (x, y) {
    return (x.type === "reminder" ? 0 : 1) - (y.type === "reminder" ? 0 : 1) ||
      x.priority - y.priority || x.i - y.i;
  });

  var budget = Math.min(MailApp.getRemainingDailyQuota() - MAIL_RESERVE, limit || MAX_PER_RUN);
  var fellowStatus = fellowStatusMap();
  var subscriberStatus = subscriberStatusMap();
  var logo = null;
  var logoLoaded = false;
  var sent = 0;

  function mark(i, status) {
    sheet.getRange(i + 2, c["status"] + 1).setValue(status);
    if (status === "sent") sheet.getRange(i + 2, c["sent"] + 1).setValue(new Date());
  }

  pending.forEach(function (p) {
    var row = p.row;
    var data;
    try { data = JSON.parse(String(row[c["payload"]])); } catch (err) { mark(p.i, "failed"); return; }

    // Never announce or remind about a debate that has already started.
    var start = new Date(data.startUtc);
    if (!isNaN(start.getTime()) && start.getTime() <= nowMs) { mark(p.i, "expired"); return; }

    // Skip anyone who has unsubscribed, bounced or been removed meanwhile.
    var email = String(row[c["email"]]).trim().toLowerCase();
    var kind = String(row[c["kind"]]);
    var token = String(row[c["token"]]).trim();
    if (kind === "fellow") {
      var fs = fellowStatus[email];
      if (fs === undefined || SKIP_STATUSES.indexOf(fs) > -1) { mark(p.i, "skipped"); return; }
    } else if (subscriberStatus[token] !== "confirmed") {
      mark(p.i, "skipped"); return;
    }

    if (sent >= budget) return;   // stays queued for the next run

    if (!logoLoaded) { logo = getWordmarkBlob(); logoLoaded = true; }
    try {
      var recipient = { email: email, first: String(row[c["first name"]]), kind: kind, token: token };
      var mail = buildNoticeEmail(data, noticeTimeLines(data), recipient, !!logo, p.type);
      var options = {
        to: email,
        subject: (p.type === "reminder" ? "Reminder: " : "Upcoming debate: ") + data.subject,
        body: mail.text,
        htmlBody: mail.html,
        name: SENDER_NAME
      };
      if (logo) options.inlineImages = { wordmark: logo };
      var ics = buildIcsBlob(data);
      if (ics) options.attachments = [ics];
      MailApp.sendEmail(options);
      mark(p.i, "sent");
      sent++;
    } catch (err) {
      mark(p.i, "failed");
    }
  });

  return sent;
}

// Number of emails still waiting. With dueOnly, reminders that are not due
// yet are not counted.
function countQueued(dueOnly) {
  var sheet = getOutboxSheet(false);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var t = readTable(sheet);
  var nowMs = Date.now();
  var n = 0;
  t.rows.forEach(function (r) {
    if (String(r[t.col["status"]]).trim().toLowerCase() !== "queued") return;
    if (dueOnly && t.col["send after"] !== undefined) {
      var after = r[t.col["send after"]];
      if (after instanceof Date && after.getTime() > nowMs) return;
    }
    n++;
  });
  return n;
}

function noticeTimeLines(data) {
  var when = new Date(data.startUtc);
  if (isNaN(when.getTime())) return [data.date + " (US Eastern)"];
  var fmt = "EEEE, MMMM d, yyyy 'at' h:mm a z";
  return [
    "Eastern: " + Utilities.formatDate(when, "America/New_York", fmt),
    "Seoul: " + Utilities.formatDate(when, "Asia/Seoul", fmt),
    "London: " + Utilities.formatDate(when, "Europe/London", fmt)
  ];
}

function fellowStatusMap() {
  var map = {};
  var sheet = getFellowsSheet();
  if (!sheet || sheet.getLastRow() < 2) return map;
  var t = readTable(sheet);
  if (t.col["email"] === undefined) return map;
  t.rows.forEach(function (r) {
    var email = String(r[t.col["email"]]).trim().toLowerCase();
    if (!email) return;
    map[email] = t.col["status"] !== undefined ? String(r[t.col["status"]]).trim().toLowerCase() : "";
  });
  return map;
}

function subscriberStatusMap() {
  var map = {};
  var sheet = getSubscribersSheet(false);
  if (!sheet || sheet.getLastRow() < 2) return map;
  var t = readTable(sheet);
  if (t.col["token"] === undefined || t.col["status"] === undefined) return map;
  t.rows.forEach(function (r) {
    var token = String(r[t.col["token"]]).trim();
    if (token) map[token] = String(r[t.col["status"]]).trim().toLowerCase();
  });
  return map;
}

/**
 * Run this ONCE from the Apps Script editor (pick it in the function
 * dropdown, then Run, and approve the permission). It makes the script check
 * the Outbox every hour and send waiting notices as soon as the daily email
 * allowance allows. Running it again is safe: it replaces the old timer.
 */
function installNoticeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "processOutboxTrigger") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("processOutboxTrigger").timeBased().everyHours(1).create();
}

function noticeTriggerInstalled() {
  try {
    return ScriptApp.getProjectTriggers().some(function (t) {
      return t.getHandlerFunction() === "processOutboxTrigger";
    });
  } catch (err) {
    return true;   // cannot tell; do not raise a false alarm
  }
}

/* ================= public debate calendar ================= */

// Tag that marks the events this script made, so it never touches any other
// event on the calendar.
var CAL_TAG = "intentCollectiveDebate";

/**
 * Keeps the public calendar in step with the "Debate Schedule" tab. Each row
 * gets one event; its id is stored in the row's "Event ID" column (added
 * automatically). Edited rows update their event. A future event whose row
 * was deleted is removed. Past events are kept as a record. Safe to run any
 * time, by hand or from the hourly timer.
 */
function syncDebateCalendar() {
  if (!DEBATE_CALENDAR_ID) return;
  var cal = CalendarApp.getCalendarById(DEBATE_CALENDAR_ID);
  if (!cal) throw new Error("Debate calendar not found, or this account cannot edit it.");

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DEBATE_TAB);
  if (!sheet || sheet.getLastRow() < 2) return;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;   // another run is syncing; the next one catches up
  try {
    var idCol = ensureColumn(sheet, "event id", "Event ID");
    var t = readTable(sheet);
    var c = t.col;
    var keep = {};

    t.rows.forEach(function (r, i) {
      var subject = String(r[c["subject"]] || "").trim();
      var start = debateStart(r[c["date"]]);
      if (!subject || !start) return;

      var data = {
        subject: subject,
        host: String(r[c["host"]] || "").trim(),
        discourse: String(r[c["discourse"]] || "").trim()
      };
      var end = new Date(start.getTime() + 60 * 60 * 1000);
      var title = "Intent Collective: " + subject;
      var desc = calendarDescription(data);

      var id = String(r[idCol - 1] || "").trim();
      var ev = null;
      if (id) { try { ev = cal.getEventById(id); } catch (err) { ev = null; } }

      if (ev) {
        if (ev.getTitle() !== title) ev.setTitle(title);
        if (ev.getStartTime().getTime() !== start.getTime() || ev.getEndTime().getTime() !== end.getTime()) ev.setTime(start, end);
        if (ev.getDescription() !== desc) ev.setDescription(desc);
        if (ev.getLocation()) ev.setLocation("");   // no location: calendars offer map directions for it
      } else {
        ev = cal.createEvent(title, start, end, { description: desc });
        ev.setTag(CAL_TAG, "1");
        sheet.getRange(i + 2, idCol).setValue(ev.getId());
      }
      keep[ev.getId()] = true;
    });

    // Remove future events whose row is gone.
    var now = new Date();
    var later = new Date(now.getTime() + 3 * 365 * 24 * 3600 * 1000);
    cal.getEvents(now, later).forEach(function (ev) {
      if (ev.getTag(CAL_TAG) === "1" && !keep[ev.getId()]) ev.deleteEvent();
    });
  } finally {
    lock.releaseLock();
  }
}

// The Date cell holds "YYYY-MM-DD HH:mm" in US Eastern wall time. A cell that
// Sheets turned into a real date is accepted too.
function debateStart(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var s = String(v || "").trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}$/.test(s)) return null;
  try { return Utilities.parseDate(s, "America/New_York", "yyyy-MM-dd HH:mm"); } catch (err) { return null; }
}

/* ================= recipients ================= */

function collectRecipients() {
  var out = [];
  var seen = {};

  // Principal Design Fellows (priority 1), then Design Fellows (2).
  var fellows = getFellowsSheet();
  if (fellows && fellows.getLastRow() > 1) {
    var f = readTable(fellows);
    if (f.col["email"] === undefined) throw new Error('No "Email" column in the Fellows tab.');
    f.rows.forEach(function (r) {
      var email = String(r[f.col["email"]]).trim().toLowerCase();
      var status = f.col["status"] !== undefined ? String(r[f.col["status"]]).trim().toLowerCase() : "";
      if (SKIP_STATUSES.indexOf(status) > -1) return;
      if (!isValidEmailFormat(email) || seen[email]) return;
      seen[email] = true;
      var level = f.col["fellowship"] !== undefined ? String(r[f.col["fellowship"]]).toLowerCase() : "";
      out.push({
        email: email,
        first: f.col["first name"] !== undefined ? String(r[f.col["first name"]]).trim() : "",
        kind: "fellow",
        token: "",
        priority: level.indexOf("principal") > -1 ? 1 : 2
      });
    });
  }
  // Stable sort: Principal first, otherwise sheet order.
  out = out.map(function (x, i) { return { x: x, i: i }; })
    .sort(function (a, b) { return a.x.priority - b.x.priority || a.i - b.i; })
    .map(function (o) { return o.x; });

  // Then confirmed subscribers (priority 3).
  var subs = getSubscribersSheet(false);
  if (subs && subs.getLastRow() > 1) {
    var s = readTable(subs);
    if (s.col["email"] !== undefined && s.col["status"] !== undefined && s.col["token"] !== undefined) {
      s.rows.forEach(function (r) {
        var email = String(r[s.col["email"]]).trim().toLowerCase();
        var status = String(r[s.col["status"]]).trim().toLowerCase();
        if (status !== "confirmed") return;
        if (!isValidEmailFormat(email) || seen[email]) return;
        seen[email] = true;
        out.push({
          email: email,
          first: s.col["first name"] !== undefined ? String(r[s.col["first name"]]).trim() : "",
          kind: "subscriber",
          token: String(r[s.col["token"]]).trim(),
          priority: 3
        });
      });
    }
  }

  return out;
}

/* ================= email templates ================= */

// The wordmark from the website, attached inline so it shows in every mail
// app. Returns null if it cannot be fetched; emails then use plain text.
function getWordmarkBlob() {
  try {
    var res = UrlFetchApp.fetch(WORDMARK_URL, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    return res.getBlob().setName("wordmark.png");
  } catch (err) {
    return null;
  }
}

function unsubscribeUrl(token) {
  return getWebAppUrl() + "?action=unsubscribe&t=" + encodeURIComponent(token);
}

function getWebAppUrl() {
  return WEB_APP_URL || ScriptApp.getService().getUrl();
}

// The shared look: paper background, wordmark on top, a red // label //, a
// thin-bordered box (like the debate cards on the site), small footer.
function emailShell(label, boxHtml, belowHtml, footerHtml, hasLogo) {
  var font = "'DM Sans',Helvetica,Arial,sans-serif";
  var mark = hasLogo
    ? '<img src="cid:wordmark" alt="Intent Collective" height="22" style="display:block;height:22px;border:0;outline:none;">'
    : '<span style="font-family:' + font + ';font-size:13px;font-weight:700;text-transform:uppercase;color:' + C_INK + ';">Intent Collective</span>';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>' +
    '<body style="margin:0;padding:0;background:' + C_PAPER + ';">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C_PAPER + ';"><tr><td align="center" style="padding:32px 16px;">' +
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;font-family:' + font + ';color:' + C_INK + ';">' +
    '<tr><td style="padding:0 0 24px 0;">' + mark + '</td></tr>' +
    '<tr><td style="padding:0 0 10px 0;font-family:' + font + ';font-size:12px;font-weight:700;text-transform:uppercase;color:' + C_MARK + ';">// ' + esc(label) + ' //</td></tr>' +
    '<tr><td style="background:' + C_RAISED + ';border:1px solid ' + C_LINE + ';padding:24px;font-family:' + font + ';">' + boxHtml + '</td></tr>' +
    '<tr><td style="padding:20px 0 0 0;font-family:' + font + ';font-size:14px;line-height:1.6;color:' + C_SOFT + ';">' + belowHtml + '</td></tr>' +
    '<tr><td style="padding:24px 0 0 0;font-family:' + font + ';font-size:12px;line-height:1.6;font-style:italic;color:' + C_SOFT + ';">' + footerHtml + '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function debatePageUrl() {
  return SITE_URL + "/index.html#debate";
}

function pad2(n) { return (n < 10 ? "0" : "") + n; }

// 20261205T150000Z
function icsStamp(d) {
  return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + "T" +
    pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + "Z";
}

// Debates are one hour long.
function calendarTimes(data) {
  var start = new Date(data.startUtc);
  if (isNaN(start.getTime())) return null;
  return { start: start, end: new Date(start.getTime() + 60 * 60 * 1000) };
}

function calendarDescription(data) {
  return "Live debate hosted by " + data.host + ".\n" +
    "Read the discourse post: " + data.discourse + "\n" +
    "The Join link appears on the debate page one hour before the start: " + debatePageUrl();
}

function googleCalendarUrl(data) {
  var t = calendarTimes(data);
  if (!t) return "";
  return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" + encodeURIComponent("Intent Collective: " + data.subject) +
    "&dates=" + icsStamp(t.start) + "/" + icsStamp(t.end) +
    "&details=" + encodeURIComponent(calendarDescription(data));
}

function icsEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// A calendar file for Apple Calendar, Outlook and others.
function buildIcsBlob(data) {
  var t = calendarTimes(data);
  if (!t) return null;
  var lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Intent Collective//Debate//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:debate-" + t.start.getTime() + "@intentcollective.design",
    "DTSTAMP:" + icsStamp(new Date()),
    "DTSTART:" + icsStamp(t.start),
    "DTEND:" + icsStamp(t.end),
    "SUMMARY:" + icsEscape("Intent Collective: " + data.subject),
    "DESCRIPTION:" + icsEscape(calendarDescription(data)),
    "URL:" + debatePageUrl(),
    "END:VEVENT",
    "END:VCALENDAR"
  ];
  return Utilities.newBlob(lines.join("\r\n") + "\r\n", "text/calendar", "intent-collective-debate.ics");
}

// type: "notice" (a debate was scheduled) or "reminder" (24 hours before).
function buildNoticeEmail(data, timeLines, recipient, hasLogo, type) {
  var isReminder = type === "reminder";
  var font = "'DM Sans',Helvetica,Arial,sans-serif";
  var link = 'color:' + C_MARK + ';font-weight:700;text-decoration:none;';
  var gcal = googleCalendarUrl(data);
  var page = debatePageUrl();

  var box =
    (isReminder
      ? '<div style="font-family:' + font + ';font-size:12px;font-weight:700;text-transform:uppercase;color:' + C_SOFT + ';margin:0 0 8px 0;">Starts in about 24 hours</div>'
      : '') +
    '<div style="font-family:' + font + ';font-size:22px;line-height:1.2;font-weight:700;color:' + C_INK + ';margin:0 0 10px 0;">' + esc(data.subject) + '</div>' +
    '<div style="font-family:' + font + ';font-size:15px;line-height:1.6;color:' + C_SOFT + ';margin:0 0 6px 0;">Hosted by ' + esc(data.host) + '</div>' +
    '<div style="font-family:' + font + ';font-size:15px;line-height:1.6;color:' + C_INK + ';">' + timeLines.map(esc).join('<br>') + '</div>' +
    '<div style="border-top:1px dashed ' + C_LINE + ';margin:16px 0 0 0;padding:12px 0 0 0;font-family:' + font + ';font-size:15px;line-height:1.8;">' +
    '<a href="' + esc(data.discourse) + '" style="' + link + '">Read the discourse post &gt;&gt;</a><br>' +
    '<a href="' + esc(page) + '" style="' + link + '">Open the debate page &gt;&gt;</a>' +
    (gcal ? '<br><a href="' + esc(gcal) + '" style="' + link + '">Add to Google Calendar &gt;&gt;</a>' : '') +
    '</div>';

  var below = 'The Join link appears on the debate page one hour before the start. ' +
    (gcal ? 'For Apple Calendar or Outlook, open the attached calendar file. ' : '') +
    'Debates are one hour, online, and open to everyone. ' +
    '<a href="' + esc(SITE_STRUCTURE_URL) + '" style="' + link + '">All debates &gt;&gt;</a>' +
    (CAL_SUBSCRIBE_GOOGLE
      ? '<br>Every debate on your calendar, automatically: ' +
        '<a href="' + esc(CAL_SUBSCRIBE_GOOGLE) + '" style="' + link + '">Google Calendar &gt;&gt;</a> ' +
        '<a href="' + esc(CAL_SUBSCRIBE_ICAL) + '" style="' + link + '">Apple or Outlook &gt;&gt;</a>'
      : '');

  var footerHtml;
  var footerText;
  if (recipient.kind === "subscriber") {
    var u = unsubscribeUrl(recipient.token);
    footerHtml = 'You receive this because you signed up for debate notices. <a href="' + esc(u) + '" style="color:' + C_SOFT + ';text-decoration:underline;">Unsubscribe</a>.';
    footerText = "You receive this because you signed up for debate notices. Unsubscribe: " + u;
  } else {
    footerHtml = 'You receive this as a Fellow of Intent Collective. To stop these notices, write to <a href="mailto:' + esc(CONTACT_EMAIL) + '" style="color:' + C_SOFT + ';text-decoration:underline;">' + esc(CONTACT_EMAIL) + '</a>.';
    footerText = "You receive this as a Fellow of Intent Collective. To stop these notices, write to " + CONTACT_EMAIL + ".";
  }

  var text =
    (isReminder ? "Reminder: this Intent Collective debate starts in about 24 hours.\n\n"
                : "A new Intent Collective debate has been scheduled.\n\n") +
    "Subject: " + data.subject + "\n" +
    "Host: " + data.host + "\n\n" +
    timeLines.join("\n") + "\n\n" +
    "Read the discourse post: " + data.discourse + "\n" +
    "Debate page: " + page + "\n" +
    (gcal ? "Add to Google Calendar: " + gcal + "\n" : "") +
    "\nThe Join link appears on the debate page one hour before the start. " +
    "Debates are one hour, online, and open to everyone.\n" +
    "All debates: " + SITE_STRUCTURE_URL + "\n" +
    (CAL_SUBSCRIBE_GOOGLE
      ? "Every debate on your calendar, automatically: Google Calendar " + CAL_SUBSCRIBE_GOOGLE +
        " | Apple or Outlook " + CAL_SUBSCRIBE_ICAL + "\n"
      : "") +
    "\n" + footerText;

  return {
    text: text,
    html: emailShell(isReminder ? "Debate reminder" : "Upcoming live debate", box, below, footerHtml, hasLogo)
  };
}

function sendConfirmationEmail(first, email, token) {
  var logo = getWordmarkBlob();
  var font = "'DM Sans',Helvetica,Arial,sans-serif";
  var url = getWebAppUrl() + "?action=confirm&t=" + encodeURIComponent(token);

  var box =
    '<div style="font-family:' + font + ';font-size:22px;line-height:1.2;font-weight:700;color:' + C_INK + ';margin:0 0 12px 0;">Confirm your email</div>' +
    '<div style="font-family:' + font + ';font-size:15px;line-height:1.6;color:' + C_SOFT + ';margin:0 0 20px 0;">Hi ' + esc(first) + ', confirm to get an email whenever Intent Collective schedules a live debate.</div>' +
    '<a href="' + esc(url) + '" style="display:inline-block;background:' + C_MARK + ';color:' + C_PAPER + ';padding:11px 22px;font-family:' + font + ';font-size:13px;font-weight:700;text-transform:uppercase;text-decoration:none;">Confirm subscription</a>';

  var below = 'Live debate is open to everyone and free. Notices are only a convenience.';
  var footerHtml = 'If you did not ask for this, ignore this email. You will not be subscribed.';

  var text =
    "Hi " + first + ",\n\n" +
    "Confirm to get an email whenever Intent Collective schedules a live debate:\n" +
    url + "\n\n" +
    "If you did not ask for this, ignore this email. You will not be subscribed.";

  var options = {
    to: email,
    subject: "Confirm your email for Intent Collective debate notices",
    body: text,
    htmlBody: emailShell("Confirm your email", box, below, footerHtml, !!logo),
    name: SENDER_NAME
  };
  if (logo) options.inlineImages = { wordmark: logo };
  MailApp.sendEmail(options);
}

/* ================= bounce handling ================= */

/**
 * Reads recent Gmail delivery-failure notices and marks the matching people
 * "bounced" in the Status column of the Fellows and Subscribers tabs (the
 * column is created if missing), so they are skipped from then on.
 *
 * Run it by hand from the Apps Script editor, or add a time-driven trigger
 * (Triggers > Add Trigger > flagBouncedFellows > Day timer). The first run
 * asks you to approve Gmail access for this script.
 */
function flagBouncedFellows() {
  var failed = collectFailedAddresses();
  var count = 0;
  [getFellowsSheet(), getSubscribersSheet(false)].forEach(function (sheet) {
    if (sheet) count += markBounced(sheet, failed);
  });
  return count;
}

function collectFailedAddresses() {
  var me = Session.getEffectiveUser().getEmail().toLowerCase();
  var threads = GmailApp.search("from:mailer-daemon newer_than:60d");
  var failed = {};

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var body = msg.getPlainBody();
      var isFailure = /DNS Error|wasn't delivered|couldn't be found|address not found|doesn't exist|does not exist|Delivery has failed/i.test(body);
      if (!isFailure) return;
      var found = body.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g) || [];
      found.forEach(function (addr) {
        var a = addr.toLowerCase();
        if (a !== me) failed[a] = true;
      });
    });
  });
  return failed;
}

function markBounced(sheet, failed) {
  var statusCol = ensureColumn(sheet, "status", "Status") - 1;   // zero-based
  var t = readTable(sheet);
  var emailCol = t.col["email"];
  if (emailCol === undefined) return 0;

  var count = 0;
  t.rows.forEach(function (r, i) {
    var email = String(r[emailCol]).trim().toLowerCase();
    if (!failed[email]) return;
    var cell = sheet.getRange(i + 2, statusCol + 1);
    if (String(cell.getValue()).trim().toLowerCase() !== "bounced") {
      cell.setValue("bounced");
      count++;
    }
  });
  return count;
}

/* ================= email checks ================= */

function isValidEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email));
}

// True when the domain publishes a mail server (an MX record pointing to a
// real host name). Catches typo domains. It cannot prove the mailbox exists.
// If the DNS lookup itself fails, the address is allowed so a network
// hiccup never blocks a real person.
function domainCanReceiveMail(email) {
  var domain = String(email).split("@")[1];
  if (!domain) return false;
  try {
    var res = UrlFetchApp.fetch(
      "https://dns.google/resolve?name=" + encodeURIComponent(domain) + "&type=MX",
      { muteHttpExceptions: true }
    );
    var j = JSON.parse(res.getContentText());
    if (j.Status !== 0 || !j.Answer) return false;
    return j.Answer.some(function (a) {
      if (a.type !== 15) return false;
      var host = String(a.data).replace(/^\d+\s+/, "").trim();
      return /[a-z0-9-]+\.[a-z]{2,}\.?$/i.test(host);
    });
  } catch (err) {
    return true;
  }
}

/* ================= helpers ================= */

function getSpreadsheet() {
  return FELLOWS_SPREADSHEET_ID
    ? SpreadsheetApp.openById(FELLOWS_SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function getFellowsSheet() {
  return getSpreadsheet().getSheetByName(FELLOWS_TAB);
}

// The Subscribers tab is created the first time someone subscribes.
function getSubscribersSheet(create) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SUBSCRIBERS_TAB);
  if (!sheet && create) {
    sheet = ss.insertSheet(SUBSCRIBERS_TAB);
    sheet.getRange(1, 1, 1, 6).setValues([["First Name", "Last Name", "Email", "Added", "Status", "Token"]]);
  }
  return sheet;
}

// The Outbox tab is created the first time a debate notice is queued. Columns
// added in later versions are added to an older tab automatically.
function getOutboxSheet(create) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(OUTBOX_TAB);
  if (!sheet && create) {
    sheet = ss.insertSheet(OUTBOX_TAB);
    sheet.getRange(1, 1, 1, 11).setValues([["Created", "Email", "First Name", "Kind", "Token", "Payload", "Status", "Sent", "Type", "Send After", "Priority"]]);
  } else if (sheet && create) {
    ensureColumn(sheet, "type", "Type");
    ensureColumn(sheet, "send after", "Send After");
    ensureColumn(sheet, "priority", "Priority");
  }
  return sheet;
}

// Appends rows (objects keyed by lowercase header name) in one write.
function appendObjectsByHeader(sheet, objs) {
  if (!objs.length) return;
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  var rows = objs.map(function (o) {
    return header.map(function (h) { return o.hasOwnProperty(h) ? o[h] : ""; });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, header.length).setValues(rows);
}

// Header names (lowercased) mapped to zero-based column numbers, plus the
// data rows.
function readTable(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var lastRow = sheet.getLastRow();
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  var col = {};
  header.forEach(function (h, i) { if (h && col[h] === undefined) col[h] = i; });
  var rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  return { header: header, col: col, rows: rows };
}

function findRowIndex(table, key, value) {
  var c = table.col[key];
  if (c === undefined) return -1;
  var want = String(value).trim().toLowerCase();
  for (var i = 0; i < table.rows.length; i++) {
    if (String(table.rows[i][c]).trim().toLowerCase() === want) return i;
  }
  return -1;
}

// Returns the 1-based column number for a header, adding the column at the
// end if the sheet does not have it yet.
function ensureColumn(sheet, key, label) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  var i = header.indexOf(key);
  if (i > -1) return i + 1;
  var col = lastCol + 1;
  sheet.getRange(1, col).setValue(label);
  return col;
}

// Appends a row by matching header names (case-insensitive), so the column
// order in your sheet does not matter. textKey: a header whose cell should
// be stored as plain text.
function appendByHeader(sheet, values, textKey) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });

  var row = header.map(function (key) {
    return values.hasOwnProperty(key) ? values[key] : "";
  });

  var targetRow = sheet.getLastRow() + 1;
  if (textKey) {
    var c = header.indexOf(textKey);
    if (c > -1) sheet.getRange(targetRow, c + 1).setNumberFormat("@");
  }
  sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);

  var addedCol = header.indexOf("added");
  if (addedCol > -1) {
    sheet.getRange(targetRow, addedCol + 1).setNumberFormat("m/d/yyyy");
  }
}

function cleanText(s) {
  return String(s || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 80);
}

function newToken() {
  return Utilities.getUuid().replace(/-/g, "");
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// A small page in the site's colors, shown after clicking an email link.
function messagePage(o) {
  var html =
    '<base target="_top">' +
    '<div style="font-family:\'DM Sans\',Helvetica,Arial,sans-serif;background:' + C_PAPER + ';color:' + C_INK + ';padding:56px 24px;min-height:100vh;box-sizing:border-box;">' +
    '<div style="max-width:520px;margin:0 auto;">' +
    '<div style="font-size:12px;font-weight:700;text-transform:uppercase;color:' + C_MARK + ';margin:0 0 12px 0;">// Intent Collective //</div>' +
    '<div style="background:' + C_RAISED + ';border:1px solid ' + C_LINE + ';padding:28px;">' +
    '<div style="font-size:24px;line-height:1.2;font-weight:700;margin:0 0 12px 0;">' + esc(o.title) + '</div>' +
    '<div style="font-size:16px;line-height:1.6;color:' + C_SOFT + ';">' + esc(o.message) + '</div>' +
    (o.note ? '<div style="font-size:16px;line-height:1.6;color:' + C_SOFT + ';margin-top:12px;">' + esc(o.note) + '</div>' : '') +
    (o.links || []).map(function (l) {
      return '<div style="margin-top:8px;"><a href="' + esc(l.url) + '" style="color:' + C_MARK + ';font-weight:700;text-decoration:none;">' + esc(l.label) + ' &gt;&gt;</a></div>';
    }).join('') +
    '<div style="margin-top:20px;"><a href="' + esc(SITE_URL) + '" style="color:' + C_MARK + ';font-weight:700;text-decoration:none;">intentcollective.design &gt;&gt;</a></div>' +
    '</div></div></div>';
  return HtmlService.createHtmlOutput(html).setTitle(o.title);
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
