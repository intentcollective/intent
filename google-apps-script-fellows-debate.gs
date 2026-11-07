/**
 * Intent Collective: Fellows registration + Debate schedule handler.
 *
 * One script, one deployment, two jobs. The Structure page sends it one of:
 *   type "fellow": adds a row to the "Fellows" tab.
 *   type "debate": adds a row to the "Debate Schedule" tab, then emails a
 *                  notice to every fellow listed in the Fellows tab.
 *
 * Setup: see README.md, "Fellows and Debate Schedule".
 *
 * The password check below is the real gate. The copy in js/structure.js
 * only gives instant feedback in the page.
 *
 * EMAIL SENDER: notices are sent from the Google account that DEPLOYS this
 * script ("Execute as: Me"). To have them come from
 * intentcollectivedesign@gmail.com, create the spreadsheet and deploy the
 * script while signed in as that account.
 *
 * BOUNCE PROTECTION (new):
 *   1. A fellow's email is checked on the server when they are registered:
 *      correct format, and a domain that can receive mail.
 *   2. The Fellows tab may have an optional "Status" column. A fellow whose
 *      Status is "bounced" or "skip" is never emailed.
 *   3. Run flagBouncedFellows() (manually, or on a daily time trigger) to
 *      read Gmail delivery-failure notices and mark those fellows
 *      "bounced" automatically, so a bad address cannot keep generating
 *      notices every time a debate is scheduled.
 */

var PASSWORD = "designeverything1234";

// Tab names. Change these if your tabs are named differently.
var FELLOWS_TAB = "Fellows";
var DEBATE_TAB = "Debate Schedule";

// Leave empty if Fellows and Debate Schedule are tabs of the SAME
// spreadsheet this script is bound to. If your Fellows list lives in a
// different spreadsheet, paste that spreadsheet's ID here (the long string
// in its URL between /d/ and /edit). The script owner needs access to it.
var FELLOWS_SPREADSHEET_ID = "";

// Set to false to stop the automatic email notice.
var SEND_EMAIL_NOTICE = true;

// Display name shown on the emails.
var SENDER_NAME = "Intent Collective";

// Where the debate list lives on the site (used as the link in the email).
var SITE_STRUCTURE_URL = "https://intentcollective.design/structure.html";

// Fellows whose Status cell holds one of these words are never emailed.
var SKIP_STATUSES = ["bounced", "skip"];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

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

/* ---------------- fellow registration ---------------- */

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

/* ---------------- debate scheduling ---------------- */

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
      result.emailed = sendDebateNotice(data);
    } catch (err) {
      result.emailError = err.message;
    }
  }
  return respond(result);
}

function sendDebateNotice(data) {
  var fellowsSheet = getFellowsSheet();
  if (!fellowsSheet) throw new Error('Tab "' + FELLOWS_TAB + '" not found, so no notice was sent.');

  var lastRow = fellowsSheet.getLastRow();
  if (lastRow < 2) return 0;

  var lastCol = Math.max(fellowsSheet.getLastColumn(), 1);
  var header = fellowsSheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  var emailCol = header.indexOf("email");
  if (emailCol === -1) throw new Error('No "Email" column in the Fellows tab.');
  var statusCol = header.indexOf("status"); // optional

  var rows = fellowsSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var seen = {};
  var recipients = [];
  rows.forEach(function (r) {
    var email = String(r[emailCol]).trim().toLowerCase();
    var status = statusCol > -1 ? String(r[statusCol]).trim().toLowerCase() : "";
    if (SKIP_STATUSES.indexOf(status) > -1) return;
    if (isValidEmailFormat(email) && !seen[email]) {
      seen[email] = true;
      recipients.push(email);
    }
  });
  if (!recipients.length) return 0;

  // Consumer Gmail accounts can send to about 100 recipients per day.
  var quota = MailApp.getRemainingDailyQuota();
  if (recipients.length > quota) {
    throw new Error("Daily email limit reached (" + quota + " left, " + recipients.length + " fellows).");
  }

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

  var subject = "Upcoming debate: " + data.subject;

  var text =
    "A new Intent Collective debate has been scheduled.\n\n" +
    "Subject: " + data.subject + "\n" +
    "Host: " + data.host + "\n\n" +
    timeLines.join("\n") + "\n\n" +
    "Read the discourse post: " + data.discourse + "\n" +
    "Join online: " + data.meeting + "\n\n" +
    "All debates: " + SITE_STRUCTURE_URL + "\n\n" +
    "Debates are one hour, online, and open to everyone.";

  var html =
    "<p>A new Intent Collective debate has been scheduled.</p>" +
    "<p><b>" + esc(data.subject) + "</b><br>Host: " + esc(data.host) + "</p>" +
    "<p>" + timeLines.map(esc).join("<br>") + "</p>" +
    '<p><a href="' + esc(data.discourse) + '">Read the discourse post</a><br>' +
    '<a href="' + esc(data.meeting) + '">Join online</a></p>' +
    '<p><a href="' + esc(SITE_STRUCTURE_URL) + '">All debates</a><br>' +
    "Debates are one hour, online, and open to everyone.</p>";

  // Recipients go in BCC so fellows' addresses are not exposed to each other.
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    bcc: recipients.join(","),
    subject: subject,
    body: text,
    htmlBody: html,
    name: SENDER_NAME
  });
  return recipients.length;
}

/* ---------------- bounce handling ---------------- */

/**
 * Reads recent Gmail delivery-failure notices and marks the matching
 * fellows "bounced" in a Status column (created if missing), so they are
 * skipped from then on.
 *
 * Run it by hand from the Apps Script editor, or add a time-driven trigger
 * (Triggers > Add Trigger > flagBouncedFellows > Day timer). The first run
 * asks you to approve Gmail access for this script.
 */
function flagBouncedFellows() {
  var sheet = getFellowsSheet();
  if (!sheet) throw new Error('Tab "' + FELLOWS_TAB + '" not found.');

  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  var emailCol = header.indexOf("email");
  if (emailCol === -1) throw new Error('No "Email" column in the Fellows tab.');

  var statusCol = header.indexOf("status");
  if (statusCol === -1) {
    statusCol = lastCol; // zero-based index of the new column
    sheet.getRange(1, statusCol + 1).setValue("Status");
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  // Map each fellow's email to its sheet row.
  var emails = sheet.getRange(2, emailCol + 1, lastRow - 1, 1).getValues();
  var rowOf = {};
  emails.forEach(function (r, i) {
    var e = String(r[0]).trim().toLowerCase();
    if (e) rowOf[e] = i + 2;
  });

  var me = Session.getEffectiveUser().getEmail().toLowerCase();
  var threads = GmailApp.search('from:mailer-daemon newer_than:60d');
  var flagged = {};

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var body = msg.getPlainBody();
      var isFailure = /DNS Error|wasn't delivered|couldn't be found|address not found|doesn't exist|does not exist|Delivery has failed/i.test(body);
      if (!isFailure) return;
      var found = body.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g) || [];
      found.forEach(function (addr) {
        var a = addr.toLowerCase();
        if (a === me || !rowOf[a]) return;
        flagged[a] = true;
      });
    });
  });

  var count = 0;
  Object.keys(flagged).forEach(function (a) {
    var cell = sheet.getRange(rowOf[a], statusCol + 1);
    if (String(cell.getValue()).trim().toLowerCase() !== "bounced") {
      cell.setValue("bounced");
      count++;
    }
  });
  return count;
}

/* ---------------- email checks ---------------- */

function isValidEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email));
}

// True when the domain publishes a mail server (an MX record pointing to a
// real host name). Catches typo domains. It cannot prove the mailbox exists.
// If the DNS lookup itself fails, the address is allowed so a network
// hiccup never blocks a real fellow.
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

/* ---------------- helpers ---------------- */

function getFellowsSheet() {
  var ss = FELLOWS_SPREADSHEET_ID
    ? SpreadsheetApp.openById(FELLOWS_SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(FELLOWS_TAB);
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

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
