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
    message: "You will get an email when Intent Collective schedules a live debate. Every notice has an unsubscribe link."
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

  var result = { status: "ok", emailed: 0 };
  if (SEND_EMAIL_NOTICE) {
    try {
      var sent = sendDebateNotice(data);
      result.emailed = sent.sent;
      if (sent.sent < sent.total) {
        result.emailError = "Daily email limit reached, so " + sent.sent + " of " + sent.total + " notices were sent.";
      }
    } catch (err) {
      result.emailError = err.message;
    }
  }
  return respond(result);
}

// Emails every Fellow and every confirmed Subscriber, one message each, so
// each Subscriber's message carries their own unsubscribe link.
function sendDebateNotice(data) {
  var recipients = collectRecipients();
  if (!recipients.length) return { sent: 0, total: 0 };

  // Consumer Gmail accounts can send to about 100 recipients per day.
  // Fellows are listed first, so they are served first.
  var quota = MailApp.getRemainingDailyQuota();
  var batch = recipients.slice(0, Math.max(quota, 0));

  var when = new Date(data.startUtc);
  var hasTime = !isNaN(when.getTime());
  var fmt = "EEEE, MMMM d, yyyy 'at' h:mm a z";
  var timeLines = hasTime
    ? [
        "Eastern: " + Utilities.formatDate(when, "America/New_York", fmt),
        "Seoul: " + Utilities.formatDate(when, "Asia/Seoul", fmt),
        "London: " + Utilities.formatDate(when, "Europe/London", fmt)
      ]
    : [data.date + " (US Eastern)"];

  var logo = getWordmarkBlob();
  var subject = "Upcoming debate: " + data.subject;
  var sent = 0;

  batch.forEach(function (r) {
    try {
      var mail = buildNoticeEmail(data, timeLines, r, !!logo);
      var options = {
        to: r.email,
        subject: subject,
        body: mail.text,
        htmlBody: mail.html,
        name: SENDER_NAME
      };
      if (logo) options.inlineImages = { wordmark: logo };
      MailApp.sendEmail(options);
      sent++;
    } catch (err) {
      // One failed address never stops the others.
    }
  });

  return { sent: sent, total: recipients.length };
}

/* ================= recipients ================= */

function collectRecipients() {
  var out = [];
  var seen = {};

  // Fellows first.
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
      out.push({
        email: email,
        first: f.col["first name"] !== undefined ? String(r[f.col["first name"]]).trim() : "",
        kind: "fellow",
        token: ""
      });
    });
  }

  // Then confirmed subscribers.
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
          token: String(r[s.col["token"]]).trim()
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

function buildNoticeEmail(data, timeLines, recipient, hasLogo) {
  var font = "'DM Sans',Helvetica,Arial,sans-serif";
  var link = 'color:' + C_MARK + ';font-weight:700;text-decoration:none;';

  var box =
    '<div style="font-family:' + font + ';font-size:22px;line-height:1.2;font-weight:700;color:' + C_INK + ';margin:0 0 10px 0;">' + esc(data.subject) + '</div>' +
    '<div style="font-family:' + font + ';font-size:15px;line-height:1.6;color:' + C_SOFT + ';margin:0 0 6px 0;">Hosted by ' + esc(data.host) + '</div>' +
    '<div style="font-family:' + font + ';font-size:15px;line-height:1.6;color:' + C_INK + ';">' + timeLines.map(esc).join('<br>') + '</div>' +
    '<div style="border-top:1px dashed ' + C_LINE + ';margin:16px 0 0 0;padding:12px 0 0 0;font-family:' + font + ';font-size:15px;line-height:1.8;">' +
    '<a href="' + esc(data.discourse) + '" style="' + link + '">Read the discourse post &gt;&gt;</a><br>' +
    '<a href="' + esc(data.meeting) + '" style="' + link + '">Join online &gt;&gt;</a></div>';

  var below = 'Debates are one hour, online, and open to everyone. ' +
    '<a href="' + esc(SITE_STRUCTURE_URL) + '" style="' + link + '">All debates &gt;&gt;</a>';

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
    "A new Intent Collective debate has been scheduled.\n\n" +
    "Subject: " + data.subject + "\n" +
    "Host: " + data.host + "\n\n" +
    timeLines.join("\n") + "\n\n" +
    "Read the discourse post: " + data.discourse + "\n" +
    "Join online: " + data.meeting + "\n\n" +
    "All debates: " + SITE_STRUCTURE_URL + "\n\n" +
    "Debates are one hour, online, and open to everyone.\n\n" +
    footerText;

  return { text: text, html: emailShell("Upcoming live debate", box, below, footerHtml, hasLogo) };
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
    '<div style="margin-top:20px;"><a href="' + esc(SITE_URL) + '" style="color:' + C_MARK + ';font-weight:700;text-decoration:none;">intentcollective.design &gt;&gt;</a></div>' +
    '</div></div></div>';
  return HtmlService.createHtmlOutput(html).setTitle(o.title);
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
