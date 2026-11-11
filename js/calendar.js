/* Add one debate to a calendar, from a debate card.
 *
 * Google Calendar opens a prefilled event. "Apple or Outlook" downloads an
 * .ics file built in the page. The event matches the one in the notice email
 * (same UID, so importing both does not duplicate it in Apple Calendar), has
 * no location (calendar apps offer map directions for one), and never holds
 * the meeting link: it points to the debate page, where the Join link appears
 * one hour before the start.
 *
 * Used by index.js and structure.js. Load this file before them.
 */

const IC_DEBATE_PAGE = "https://intentcollective.design/index.html#debate";

function icCalEsc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 20270109T150000Z
function icStamp(d) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icDescription(d) {
  return (d.host ? "Live debate hosted by " + String(d.host).replace(/\.+$/, "") + ".\n" : "Live debate.\n") +
    (d.discourse ? "Read the discourse post: " + d.discourse + "\n" : "") +
    "The Join link appears on the debate page one hour before the start: " + IC_DEBATE_PAGE;
}

function icGoogleUrl(d) {
  const end = new Date(d.start.getTime() + 60 * 60 * 1000);
  return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" + encodeURIComponent("Intent Collective: " + d.subject) +
    "&dates=" + icStamp(d.start) + "/" + icStamp(end) +
    "&details=" + encodeURIComponent(icDescription(d));
}

function icIcsEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;")
    .replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icIcsDataUrl(d) {
  const end = new Date(d.start.getTime() + 60 * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Intent Collective//Debate//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:debate-" + d.start.getTime() + "@intentcollective.design",
    "DTSTAMP:" + icStamp(new Date()),
    "DTSTART:" + icStamp(d.start),
    "DTEND:" + icStamp(end),
    "SUMMARY:" + icIcsEscape("Intent Collective: " + d.subject),
    "DESCRIPTION:" + icIcsEscape(icDescription(d)),
    "URL:" + IC_DEBATE_PAGE,
    "END:VEVENT",
    "END:VCALENDAR"
  ];
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(lines.join("\r\n") + "\r\n");
}

// For a debate card: a soft "Add to calendar" label, then
// "Google > · Apple or Outlook >" on the line below (the card is narrow).
function calendarLinksHTML(d) {
  if (!d || !d.start || isNaN(d.start.getTime())) return "";
  return `<span class="cal-links"><span class="cal-label">Add to calendar</span><br>` +
    `<a href="${icCalEsc(icGoogleUrl(d))}" target="_blank" rel="noopener">Google&nbsp;&gt;</a>` +
    `<span class="cal-sep" aria-hidden="true"> &middot; </span>` +
    `<a href="${icCalEsc(icIcsDataUrl(d))}" download="intent-collective-debate.ics">Apple or Outlook&nbsp;&gt;</a></span>`;
}
