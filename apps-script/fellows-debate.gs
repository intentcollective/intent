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
 *   A cancelled debate's event is deleted (everyone also gets a
 *   "Cancelled" email); reinstating it creates the event again. Change
 *   debates only in the sheet: an event edited or deleted by hand in the
 *   calendar is put back within the hour.
 *
 * CHANGING OR CANCELLING A DEBATE (edit the row, never delete it):
 *   - New date or time: edit the Date cell. Within the hour every recipient
 *     gets a "New date" email, queued notices and reminders for the old date
 *     are dropped, and a new reminder is queued.
 *   - Cancel: set Status to "cancelled". Within the hour queued notices and
 *     reminders are dropped and everyone gets a "Cancelled" email. The card
 *     stays on the site marked Cancelled, and the row stays as the record.
 *     Set Status back to "scheduled" to reinstate it (everyone gets a notice).
 *   - Subject, host or Discourse link: edit the cell. Queued reminders pick
 *     up the change. No email is sent for these.
 *   The "Announced" and "Debate ID" columns (added automatically, do not
 *   edit) hold what recipients were last told and the debate's permanent
 *   id. Announced makes sure each change is announced once. Past
 *   debates are never announced. The "Intent Collective" menu in the sheet
 *   has "Send debate changes now" (no waiting for the hourly run) and "Catch
 *   up notices and reminders" (queues them for upcoming debates for anyone
 *   who has not had them, e.g. after the Outbox was cleared).
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
// in its URL between /d/ and /edit). The Subscribers and Outbox tabs are
// kept there too. Since Nov 13 2026 they live in the private "Fellows and
// Subscribers" spreadsheet, so the Debate Schedule spreadsheet holds no
// personal data and can be shared with Principal Design Fellows.
var FELLOWS_SPREADSHEET_ID = "10N4HKlXA5Li46QMz4cd3XmfX3vczqgQlJFuWG7uIyys";

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
      message: "That email\u2019s domain can\u2019t receive mail. Please check for typos."
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
    return respond({ status: "error", message: "That email\u2019s domain can\u2019t receive mail. Please check for typos." });
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
    return { title: "We couldn\u2019t confirm this address", message: "Please write to " + CONTACT_EMAIL + " and we will help." };
  }
  if (status !== "confirmed") {
    sheet.getRange(rowIdx + 2, t.col["status"] + 1).setValue("confirmed");
  }
  return {
    title: "You\u2019re subscribed",
    message: "You will get an email when Intent Collective schedules a live debate. Every notice has an unsubscribe link.",
    note: CAL_SUBSCRIBE_GOOGLE ? "You can also put every debate on your calendar, automatically:" : "",
    links: CAL_SUBSCRIBE_GOOGLE ? [
      { label: "Google Calendar", url: CAL_SUBSCRIBE_GOOGLE },
      { label: "Apple or Outlook", url: CAL_SUBSCRIBE_ICAL }
    ] : []
  };
}

function handleUnsubscribe(token) {
  // Subscribers first, then Fellows (each Fellow gets a token the first time
  // a notice is queued for them).
  var found = null;
  [getSubscribersSheet(false), getFellowsSheet()].forEach(function (sheet) {
    if (found || !sheet || sheet.getLastRow() < 2) return;
    var t = readTable(sheet);
    var rowIdx = findRowIndex(t, "token", token);
    if (rowIdx > -1) found = { sheet: sheet, row: rowIdx + 2 };
  });
  if (!found) return invalidLink();

  var statusCol = ensureColumn(found.sheet, "status", "Status");
  found.sheet.getRange(found.row, statusCol).setValue("unsubscribed");
  return {
    title: "You\u2019re unsubscribed",
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

  ensureColumn(sheet, "status", "Status");
  ensureColumn(sheet, "announced", "Announced");
  ensureColumn(sheet, "debate id", "Debate ID");
  var start = debateStart(data.date);
  var key = newDebateId();
  var values = {
    "host": data.host,
    "date": data.date,            // "YYYY-MM-DD HH:mm", US Eastern wall time
    "subject": data.subject,
    "discourse": data.discourse,
    "meeting": data.meeting,
    "status": "scheduled",
    "announced": start ? etWall(start) : data.date,
    "debate id": key,
    "added": new Date()
  };
  // Keep the Date and Announced cells as plain text so Sheets does not
  // reformat them.
  appendByHeader(sheet, values, ["date", "announced"]);
  data.key = key;
  try { syncDebateCalendar(); } catch (err) { /* the hourly run retries */ }
  if (start) { data.date = etWall(start); data.startUtc = start.toISOString(); }

  var result = { status: "ok", emailed: 0, queued: 0 };
  if (SEND_EMAIL_NOTICE) {
    try {
      enqueueNotices(data, "notice");
      result.emailed = processOutbox(MAX_INLINE);
      result.queued = countQueued(true);
      if (countQueued(false) > 0 && !noticeTriggerInstalled()) {
        result.emailError = "Some notices and reminders are waiting. Run installNoticeTrigger once in the script editor so they go out automatically.";
      }
    } catch (err) {
      result.emailError = err.message;
    }
  }
  return respond(result);
}

// Adds Outbox rows for every recipient: one email of `type` ("notice",
// "change" or "cancel") and, for a notice or a change when the debate is
// more than a day away, a reminder due 24 hours before it. The debate's
// details are stored with each row.
function enqueueNotices(data, type) {
  type = type || "notice";
  var recipients = collectRecipients();
  if (!recipients.length) return 0;

  var sheet = getOutboxSheet(true);
  var payload = debatePayload(data);
  var now = new Date();
  var start = new Date(data.startUtc);
  var objs = [];

  recipients.forEach(function (r) { objs.push(outboxRow(now, r, payload, type, "")); });

  if (type !== "cancel" && !isNaN(start.getTime())) {
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
// Order matters: the calendar first (it gives rows their Debate ID), then
// changes to the schedule (they drop and queue emails), then the sending.
function processOutboxTrigger() {
  try { syncDebateCalendar(); } catch (err) { console.error("Calendar sync: " + err.message); }
  try { processDebateChanges(); } catch (err) { console.error("Debate changes: " + err.message); }
  processOutbox(MAX_PER_RUN);
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
    if (!EMAIL_SUBJECT_PREFIX.hasOwnProperty(type)) type = "notice";

    // Reminders wait until their time.
    var after = c["send after"] !== undefined ? row[c["send after"]] : "";
    if (after instanceof Date && after.getTime() > nowMs) return;

    var kind = String(row[c["kind"]]);
    var priority = c["priority"] !== undefined ? Number(row[c["priority"]]) : NaN;
    if (!priority) priority = kind === "fellow" ? 2 : 3;

    pending.push({ i: i, row: row, type: type, priority: priority });
  });
  if (!pending.length) return 0;

  // Reminders, cancellations and new dates are the most urgent, then
  // Principal Design Fellows, Design Fellows and Subscribers, each in the
  // order they were queued.
  function urgency(type) { return type === "notice" ? 1 : 0; }
  pending.sort(function (x, y) {
    return urgency(x.type) - urgency(y.type) || x.priority - y.priority || x.i - y.i;
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
        subject: EMAIL_SUBJECT_PREFIX[p.type] + data.subject,
        body: mail.text,
        htmlBody: mail.html,
        name: SENDER_NAME
      };
      if (logo) options.inlineImages = { wordmark: logo };
      var ics = buildIcsBlob(data, p.type === "cancel");
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
  // Non-breaking spaces keep "at 10:00 AM EST" on one line on phones.
  var fmt = "EEEE, MMMM d, yyyy\u00a0'at'\u00a0h:mm\u00a0a\u00a0z";
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
 * was deleted or cancelled is removed. Also gives every row its permanent
 * "Debate ID". Past events are kept as a record. Safe to run any
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
    var keyCol = ensureColumn(sheet, "debate id", "Debate ID");
    var t = readTable(sheet);
    var c = t.col;
    var keep = {};

    t.rows.forEach(function (r, i) {
      var subject = String(r[c["subject"]] || "").trim();
      var start = debateStart(r[c["date"]]);
      if (!subject || !start) return;

      var id = String(r[idCol - 1] || "").trim();
      // Every debate gets a permanent Debate ID once. A row that already has
      // an event takes its Event ID, so earlier emails and calendar files
      // keep matching.
      if (!String(r[keyCol - 1] || "").trim()) {
        var key = id || newDebateId();
        sheet.getRange(i + 2, keyCol).setValue(key);
        r[keyCol - 1] = key;
      }

      // A cancelled debate has no event: delete it if there is one.
      if (isCancelledStatus(c["status"] !== undefined ? r[c["status"]] : "")) {
        if (id) {
          try { var old = cal.getEventById(id); if (old) old.deleteEvent(); } catch (err) { /* already gone */ }
          sheet.getRange(i + 2, idCol).setValue("");
        }
        return;
      }

      var data = {
        subject: subject,
        host: String(r[c["host"]] || "").trim(),
        discourse: String(r[c["discourse"]] || "").trim()
      };
      var end = new Date(start.getTime() + 60 * 60 * 1000);
      var title = "Intent Collective: " + subject;
      var desc = calendarDescription(data);

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

    // Remove future events whose row is gone or cancelled.
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
// A permanent id for a new debate. It links the row to its Outbox emails
// and makes the calendar file's UID, and never changes.
function newDebateId() {
  return "d" + Utilities.getUuid().replace(/-/g, "");
}

function debateStart(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var s = String(v || "").trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}$/.test(s)) return null;
  try { return Utilities.parseDate(s, "America/New_York", "yyyy-MM-dd HH:mm"); } catch (err) { return null; }
}

/* ================= changes and cancellations ================= */

var EMAIL_SUBJECT_PREFIX = {
  notice: "Upcoming debate: ",
  reminder: "Reminder: ",
  change: "New date: ",
  cancel: "Cancelled: "
};

function isCancelledStatus(v) {
  var s = String(v || "").trim().toLowerCase();
  return s === "cancelled" || s === "canceled";
}

// "2027-03-06 09:00", US Eastern wall time. One spelling, so "9:00" and
// "09:00" compare equal.
function etWall(d) {
  return Utilities.formatDate(d, "America/New_York", "yyyy-MM-dd HH:mm");
}

function normalizeAnnounced(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : etWall(v);
  var s = String(v || "").trim();
  if (!s) return "";
  if (isCancelledStatus(s)) return "cancelled";
  var d = debateStart(s);
  return d ? etWall(d) : s;
}

// One row of the Debate Schedule tab as the details stored with each email.
function debateFromRow(r, c) {
  var subject = String(r[c["subject"]] || "").trim();
  var start = debateStart(r[c["date"]]);
  if (!subject || !start) return null;
  return {
    subject: subject,
    host: String(c["host"] !== undefined ? r[c["host"]] : "").trim(),
    discourse: String(c["discourse"] !== undefined ? r[c["discourse"]] : "").trim(),
    date: etWall(start),
    startUtc: start.toISOString(),
    key: String(c["debate id"] !== undefined && r[c["debate id"]] ? r[c["debate id"]]
         : c["event id"] !== undefined ? r[c["event id"]] : "").trim(),
    cancelled: isCancelledStatus(c["status"] !== undefined ? r[c["status"]] : "")
  };
}

function debatePayload(d) {
  var p = {
    subject: d.subject, host: d.host, discourse: d.discourse,
    date: d.date, startUtc: d.startUtc, key: d.key || ""
  };
  if (d.previous) p.previous = d.previous;
  return JSON.stringify(p);
}

// Does an Outbox payload belong to this debate? By key when both have one;
// otherwise (rows queued before keys existed) by subject and the date that
// was announced.
function payloadMatches(p, d, announced) {
  if (p.key && d.key) return p.key === d.key;
  return String(p.subject).trim() === d.subject && normalizeAnnounced(p.date) === announced;
}

// Sets every queued Outbox row of this debate to `status`.
function dropQueued(ob, d, announced, status) {
  var c = ob.t.col;
  ob.t.rows.forEach(function (row, i) {
    if (String(row[c["status"]]).trim().toLowerCase() !== "queued") return;
    var p;
    try { p = JSON.parse(String(row[c["payload"]])); } catch (err) { return; }
    if (!payloadMatches(p, d, announced)) return;
    ob.sheet.getRange(i + 2, c["status"] + 1).setValue(status);
    row[c["status"]] = status;
  });
}

// Queued rows of this debate pick up a new subject, host or Discourse link.
function refreshQueued(ob, d, announced) {
  var c = ob.t.col;
  ob.t.rows.forEach(function (row, i) {
    if (String(row[c["status"]]).trim().toLowerCase() !== "queued") return;
    var p;
    try { p = JSON.parse(String(row[c["payload"]])); } catch (err) { return; }
    if (!payloadMatches(p, d, announced)) return;
    if (p.subject === d.subject && p.host === d.host && p.discourse === d.discourse && (p.key || "") === d.key) return;
    p.subject = d.subject; p.host = d.host; p.discourse = d.discourse; p.key = d.key;
    var json = JSON.stringify(p);
    ob.sheet.getRange(i + 2, c["payload"] + 1).setValue(json);
    row[c["payload"]] = json;
  });
}

function setAnnounced(sheet, rowIndex, col, value) {
  sheet.getRange(rowIndex + 2, col).setNumberFormat("@").setValue(value);
}

/**
 * Compares every row with what recipients were last told (the "Announced"
 * column) and acts once on each difference: a cancelled row drops its
 * queued emails and queues a "Cancelled" email; a new date drops the old
 * emails and queues a "New date" email and a new reminder; a reinstated row
 * queues a fresh notice. A row with no Announced value (one that existed
 * before this column) is taken as already announced. Past debates are never
 * announced. Returns how many debates changed. Run by the hourly timer.
 */
function processDebateChanges() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DEBATE_TAB);
  if (!sheet || sheet.getLastRow() < 2) return 0;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return 0;   // another run is busy; the next one catches up
  try {
    ensureColumn(sheet, "status", "Status");
    ensureColumn(sheet, "event id", "Event ID");
    ensureColumn(sheet, "debate id", "Debate ID");
    var annCol = ensureColumn(sheet, "announced", "Announced");
    var t = readTable(sheet);
    var outSheet = SEND_EMAIL_NOTICE ? getOutboxSheet(true) : null;
    var ob = outSheet ? { sheet: outSheet, t: readTable(outSheet) } : null;
    var nowMs = Date.now();
    var changed = 0;

    t.rows.forEach(function (r, i) {
      var d = debateFromRow(r, t.col);
      if (!d) return;
      var announced = normalizeAnnounced(r[annCol - 1]);
      var current = d.cancelled ? "cancelled" : d.date;

      if (announced === current) {
        if (ob && !d.cancelled) refreshQueued(ob, d, announced);
        return;
      }
      // First sight of the row, a past debate, or emails switched off:
      // record it without announcing anything.
      if (!announced || new Date(d.startUtc).getTime() <= nowMs || !ob) {
        setAnnounced(sheet, i, annCol, current);
        return;
      }

      if (d.cancelled) {
        dropQueued(ob, d, announced, "cancelled");
        enqueueNotices(d, "cancel");
      } else if (announced === "cancelled") {
        dropQueued(ob, d, announced, "replaced");   // cancellations not yet sent
        enqueueNotices(d, "notice");
      } else {
        dropQueued(ob, d, announced, "replaced");
        d.previous = announced;
        enqueueNotices(d, "change");
      }
      setAnnounced(sheet, i, annCol, current);
      changed++;
    });
    return changed;
  } finally {
    lock.releaseLock();
  }
}

/**
 * For every upcoming debate that is not cancelled, queues a notice for each
 * recipient who has not had one (sent or queued) and a reminder for each who
 * has none, when the reminder is still due. Use it after the Outbox was
 * cleared, or when the list is switched on. Returns the number queued.
 */
function catchUpNotices() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DEBATE_TAB);
  if (!SEND_EMAIL_NOTICE || !sheet || sheet.getLastRow() < 2) return 0;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error("Another run is busy. Try again in a minute.");
  try {
    var annCol = ensureColumn(sheet, "announced", "Announced");
    var t = readTable(sheet);
    var outSheet = getOutboxSheet(true);
    var ot = readTable(outSheet);
    var oc = ot.col;
    var recipients = collectRecipients();
    var now = new Date();
    var objs = [];

    t.rows.forEach(function (r) {
      var d = debateFromRow(r, t.col);
      if (!d || d.cancelled) return;
      var start = new Date(d.startUtc);
      if (start.getTime() <= now.getTime()) return;
      var announced = normalizeAnnounced(r[annCol - 1]) || d.date;

      var hasNotice = {}, hasReminder = {};
      ot.rows.forEach(function (row) {
        var st = String(row[oc["status"]]).trim().toLowerCase();
        if (st !== "queued" && st !== "sent") return;
        var p;
        try { p = JSON.parse(String(row[oc["payload"]])); } catch (err) { return; }
        if (!payloadMatches(p, d, announced)) return;
        var email = String(row[oc["email"]]).trim().toLowerCase();
        var type = String(row[oc["type"]]).trim().toLowerCase();
        if (type === "reminder") hasReminder[email] = true; else hasNotice[email] = true;
      });

      var payload = debatePayload(d);
      var due = new Date(start.getTime() - REMINDER_HOURS * 3600 * 1000);
      var reminderOk = due.getTime() > now.getTime() + 30 * 60 * 1000;
      recipients.forEach(function (rc) {
        if (!hasNotice[rc.email]) objs.push(outboxRow(now, rc, payload, "notice", ""));
        if (reminderOk && !hasReminder[rc.email]) objs.push(outboxRow(now, rc, payload, "reminder", due));
      });
    });

    appendObjectsByHeader(outSheet, objs);
    return objs.length;
  } finally {
    lock.releaseLock();
  }
}

/* ================= sheet menu ================= */

// Adds an "Intent Collective" menu to the spreadsheet.
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Intent Collective")
    .addItem("Send debate changes now", "menuSendChangesNow")
    .addItem("Catch up notices and reminders", "menuCatchUp")
    .addToUi();
}

function menuSendChangesNow() {
  var ui = SpreadsheetApp.getUi();
  try {
    try { syncDebateCalendar(); } catch (err) { /* reported below if it matters */ }
    var changed = processDebateChanges();
    var sent = processOutbox(MAX_PER_RUN);
    ui.alert(changed
      ? changed + (changed === 1 ? " debate changed. " : " debates changed. ") + sent + " emails sent now, " + countQueued(true) + " waiting for the hourly run."
      : "No changes to announce. " + sent + " waiting emails sent.");
  } catch (err) {
    ui.alert("Something went wrong: " + err.message);
  }
}

function menuCatchUp() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert("Catch up notices and reminders",
    "This queues a notice and a reminder for every upcoming debate, for each person on the list who has not had them. Continue?",
    ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  try {
    var queued = catchUpNotices();
    var sent = processOutbox(MAX_INLINE);
    ui.alert(queued + " emails queued. " + sent + " sent now; reminders go out 24 hours before each debate.");
  } catch (err) {
    ui.alert("Something went wrong: " + err.message);
  }
}

/* ================= recipients ================= */

function collectRecipients() {
  var out = [];
  var seen = {};

  // Principal Design Fellows (priority 1), then Design Fellows (2).
  var fellows = getFellowsSheet();
  if (fellows && fellows.getLastRow() > 1) {
    var fTokenCol = ensureColumn(fellows, "token", "Token");
    var f = readTable(fellows);
    if (f.col["email"] === undefined) throw new Error('No "Email" column in the Fellows tab.');
    f.rows.forEach(function (r, i) {
      var email = String(r[f.col["email"]]).trim().toLowerCase();
      var status = f.col["status"] !== undefined ? String(r[f.col["status"]]).trim().toLowerCase() : "";
      if (SKIP_STATUSES.indexOf(status) > -1) return;
      if (!isValidEmailFormat(email) || seen[email]) return;
      seen[email] = true;
      var level = f.col["fellowship"] !== undefined ? String(r[f.col["fellowship"]]).toLowerCase() : "";
      var fToken = String(r[fTokenCol - 1] || "").trim();
      if (!fToken) {
        fToken = newToken();
        fellows.getRange(i + 2, fTokenCol).setValue(fToken);
      }
      out.push({
        email: email,
        first: f.col["first name"] !== undefined ? String(r[f.col["first name"]]).trim() : "",
        kind: "fellow",
        token: fToken,
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
  return "Live debate hosted by " + String(data.host).replace(/\.+$/, "") + ".\n" +
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

// The calendar file's UID. It comes from the debate's Debate ID, which never
// changes, so a calendar app treats a new date or a cancellation as the same
// event. Debates without one (queued before keys existed) fall back to the
// start time. js/calendar.js builds the same UID for the site's cards.
function icsUid(data, start) {
  var k = String(data.key || "").replace(/@.*$/, "").replace(/[^A-Za-z0-9]/g, "");
  return "debate-" + (k || start.getTime()) + "@intentcollective.design";
}

// A calendar file for Apple Calendar, Outlook and others. SEQUENCE grows
// with time, so the newest file always wins. cancel: a file that removes
// the event from calendars that already have it.
function buildIcsBlob(data, cancel) {
  var t = calendarTimes(data);
  if (!t) return null;
  var now = new Date();
  var lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Intent Collective//Debate//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:" + (cancel ? "CANCEL" : "PUBLISH"),
    "BEGIN:VEVENT",
    "UID:" + icsUid(data, t.start),
    "SEQUENCE:" + Math.floor(now.getTime() / 60000),
    "DTSTAMP:" + icsStamp(now),
    "DTSTART:" + icsStamp(t.start),
    "DTEND:" + icsStamp(t.end)
  ].concat(cancel ? ["STATUS:CANCELLED"] : []).concat([
    "SUMMARY:" + icsEscape((cancel ? "Cancelled: " : "") + "Intent Collective: " + data.subject),
    "DESCRIPTION:" + icsEscape((cancel ? "This debate is cancelled.\n" : "") + calendarDescription(data)),
    "URL:" + debatePageUrl(),
    "END:VEVENT",
    "END:VCALENDAR"
  ]);
  return Utilities.newBlob(lines.join("\r\n") + "\r\n", "text/calendar", "intent-collective-debate.ics");
}

// One block in the email box with both calendar choices: add this debate, or
// subscribe to every debate. They are alternatives (doing both shows the
// debate twice), so they sit on two labelled lines, not side by side.
function calendarBlockHtml(gcal, font, link) {
  var soft = 'color:' + C_SOFT + ';';
  link = link + 'white-space:nowrap;';   // a link name never breaks across lines
  var thisLine = gcal
    ? '<span style="' + soft + '">This debate:</span> <a href="' + esc(gcal) + '" style="' + link + '">Google Calendar &gt;</a><span style="' + soft + '">, or open the attached file</span>'
    : '<span style="' + soft + '">This debate: open the attached file</span>';
  var allLine = CAL_SUBSCRIBE_GOOGLE
    ? '<br><span style="' + soft + '">Future debates: Subscribe in</span> <a href="' + esc(CAL_SUBSCRIBE_GOOGLE) + '" style="' + link + '">Google Calendar &gt;</a><span style="' + soft + '"> &middot; </span><a href="' + esc(CAL_SUBSCRIBE_ICAL) + '" style="' + link + '">Apple or Outlook &gt;</a>'
    : '';
  return '<div style="border-top:1px dashed ' + C_LINE + ';margin:14px 0 0 0;padding:12px 0 0 0;font-family:' + font + ';font-size:15px;line-height:1.8;">' +
    '<div style="font-family:' + font + ';font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;' + soft + '">Add to your calendar</div>' +
    thisLine + allLine + '</div>';
}

// The Eastern line for a "YYYY-MM-DD HH:mm" Eastern wall time.
function easternLine(wall) {
  var d = debateStart(wall);
  if (!d) return String(wall || "") + " (US Eastern)";
  return Utilities.formatDate(d, "America/New_York", "EEEE, MMMM d, yyyy 'at' h:mm a z");
}

// type: "notice" (a debate was scheduled), "reminder" (24 hours before),
// "change" (a new date) or "cancel" (the debate is cancelled).
var EMAIL_LABEL = {
  notice: "Upcoming live debate",
  reminder: "Debate reminder",
  change: "New debate date",
  cancel: "Debate cancelled"
};
var EMAIL_TOPLINE = {
  reminder: "Starts in about 24 hours",
  change: "The date has changed",
  cancel: "This debate will not take place"
};
var EMAIL_INTRO = {
  notice: "A new Intent Collective debate has been scheduled.",
  reminder: "Reminder: this Intent Collective debate starts in about 24 hours.",
  change: "The date of this Intent Collective debate has changed.",
  cancel: "This Intent Collective debate is cancelled and will not take place."
};

function buildNoticeEmail(data, timeLines, recipient, hasLogo, type) {
  if (!EMAIL_LABEL.hasOwnProperty(type)) type = "notice";
  var isCancel = type === "cancel";
  var font = "'DM Sans',Helvetica,Arial,sans-serif";
  var link = 'color:' + C_MARK + ';font-weight:700;text-decoration:none;';
  var softStyle = 'font-family:' + font + ';font-size:15px;line-height:1.6;color:' + C_SOFT + ';';
  var gcal = isCancel ? "" : googleCalendarUrl(data);
  var page = debatePageUrl();
  var top = EMAIL_TOPLINE[type];
  var previous = type === "change" && data.previous ? easternLine(data.previous) : "";

  // A cancellation shows only the Eastern time, under "Was scheduled for".
  var whenHtml = isCancel
    ? '<div style="' + softStyle + '">Was scheduled for</div>' +
      '<div style="font-family:' + font + ';font-size:15px;line-height:1.6;color:' + C_INK + ';">' + esc(timeLines[0]) + '</div>'
    : '<div style="font-family:' + font + ';font-size:15px;line-height:1.6;color:' + C_INK + ';">' + timeLines.map(esc).join('<br>') + '</div>' +
      (previous ? '<div style="' + softStyle + 'margin:6px 0 0 0;">Previously: ' + esc(previous) + '</div>' : '');

  var calHtml = isCancel
    ? '<div style="border-top:1px dashed ' + C_LINE + ';margin:14px 0 0 0;padding:12px 0 0 0;' + softStyle + '">Already in your calendar? Open the attached file to remove it, or delete it by hand.</div>'
    : calendarBlockHtml(gcal, font, link);

  var box =
    (top
      ? '<div style="font-family:' + font + ';font-size:12px;font-weight:700;text-transform:uppercase;color:' + C_SOFT + ';margin:0 0 8px 0;">' + esc(top) + '</div>'
      : '') +
    '<div style="font-family:' + font + ';font-size:22px;line-height:1.2;font-weight:700;color:' + C_INK + ';margin:0 0 10px 0;">' + esc(data.subject) + '</div>' +
    '<div style="' + softStyle + 'margin:0 0 6px 0;">Hosted by ' + esc(data.host) + '</div>' +
    whenHtml +
    '<div style="border-top:1px dashed ' + C_LINE + ';margin:16px 0 0 0;padding:12px 0 0 0;font-family:' + font + ';font-size:15px;line-height:1.8;">' +
    (data.discourse ? '<a href="' + esc(data.discourse) + '" style="' + link + '">Read the discourse post &gt;</a><br>' : '') +
    (isCancel
      ? '<a href="' + esc(SITE_STRUCTURE_URL) + '" style="' + link + '">All debates &gt;</a>'
      : '<a href="' + esc(page) + '" style="' + link + '">Open the debate page &gt;</a>') +
    '</div>' +
    calHtml;

  var below;
  if (isCancel) {
    below = 'Upcoming debates are listed on the site, and every new one is announced by email.';
  } else {
    below = (type === "change"
      ? 'If the earlier date is in your calendar, open the attached file to move it, or change it by hand. '
      : '') +
      'The Join link appears on the debate page one hour before the start. ' +
      'Debates are one hour, online, and open to everyone. ' +
      '<a href="' + esc(SITE_STRUCTURE_URL) + '" style="' + link + '">All debates &gt;</a>';
  }

  var footerHtml;
  var footerText;
  if (recipient.kind === "subscriber") {
    var u = unsubscribeUrl(recipient.token);
    footerHtml = 'You receive this because you signed up for debate notices. <a href="' + esc(u) + '" style="color:' + C_SOFT + ';text-decoration:underline;">Unsubscribe</a>.';
    footerText = "You receive this because you signed up for debate notices. Unsubscribe: " + u;
  } else if (recipient.token) {
    var fu = unsubscribeUrl(recipient.token);
    footerHtml = 'You receive this as a Fellow of Intent Collective. <a href="' + esc(fu) + '" style="color:' + C_SOFT + ';text-decoration:underline;">Unsubscribe</a>.';
    footerText = "You receive this as a Fellow of Intent Collective. Unsubscribe: " + fu;
  } else {
    // Notices queued before Fellows had tokens.
    footerHtml = 'You receive this as a Fellow of Intent Collective. To stop these notices, write to <a href="mailto:' + esc(CONTACT_EMAIL) + '" style="color:' + C_SOFT + ';text-decoration:underline;">' + esc(CONTACT_EMAIL) + '</a>.';
    footerText = "You receive this as a Fellow of Intent Collective. To stop these notices, write to " + CONTACT_EMAIL + ".";
  }

  var text = EMAIL_INTRO[type] + "\n\n" +
    "Subject: " + data.subject + "\n" +
    "Host: " + data.host + "\n\n";
  if (isCancel) {
    text += "Was scheduled for: " + timeLines[0] + "\n\n" +
      (data.discourse ? "Read the discourse post: " + data.discourse + "\n" : "") +
      "All debates: " + SITE_STRUCTURE_URL + "\n\n" +
      "Already in your calendar? Open the attached file to remove it, or delete it by hand.\n\n" +
      "Upcoming debates are listed on the site, and every new one is announced by email.\n\n";
  } else {
    text += timeLines.join("\n") + "\n" +
      (previous ? "Previously: " + previous + "\n" : "") + "\n" +
      (data.discourse ? "Read the discourse post: " + data.discourse + "\n" : "") +
      "Debate page: " + page + "\n" +
      "\nAdd to your calendar\n" +
      (gcal ? "This debate: Google Calendar " + gcal + ", or open the attached file\n" : "This debate: open the attached file\n") +
      (CAL_SUBSCRIBE_GOOGLE
        ? "Future debates: Subscribe in Google Calendar " + CAL_SUBSCRIBE_GOOGLE + " \u00b7 Apple or Outlook " + CAL_SUBSCRIBE_ICAL + "\n"
        : "") +
      "\n" +
      (type === "change" ? "If the earlier date is in your calendar, open the attached file to move it, or change it by hand.\n" : "") +
      "The Join link appears on the debate page one hour before the start. " +
      "Debates are one hour, online, and open to everyone.\n" +
      "All debates: " + SITE_STRUCTURE_URL + "\n\n";
  }
  text += footerText;

  return {
    text: text,
    html: emailShell(EMAIL_LABEL[type], box, below, footerHtml, hasLogo)
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
// order in your sheet does not matter. textKey: a header (or a list of
// headers) whose cell should be stored as plain text.
function appendByHeader(sheet, values, textKey) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });

  var row = header.map(function (key) {
    return values.hasOwnProperty(key) ? values[key] : "";
  });

  var targetRow = sheet.getLastRow() + 1;
  [].concat(textKey || []).forEach(function (k) {
    var c = header.indexOf(k);
    if (c > -1) sheet.getRange(targetRow, c + 1).setNumberFormat("@");
  });
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
      return '<div style="margin-top:8px;"><a href="' + esc(l.url) + '" style="color:' + C_MARK + ';font-weight:700;text-decoration:none;">' + esc(l.label) + ' &gt;</a></div>';
    }).join('') +
    '<div style="margin-top:20px;"><a href="' + esc(SITE_URL) + '" style="color:' + C_MARK + ';font-weight:700;text-decoration:none;">intentcollective.design &gt;</a></div>' +
    '</div></div></div>';
  return HtmlService.createHtmlOutput(html).setTitle(o.title);
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
