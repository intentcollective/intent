/**
 * Bind this script to your "Portfolio" Google Sheet:
 * Extensions > Apps Script, paste this in, then deploy as a Web App.
 * Full steps are in the README.
 *
 * Expects a sheet with this header row (exact names, any order):
 * Category | Type | Title | Description | ThumbnailPath | MainContent
 *
 * Row 1 = headers. The topmost DATA row (row 2) is treated as the
 * newest work — add new rows at the top, just under the header.
 */

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return jsonResponse([]);
  }

  var headers = values[0].map(function (h) {
    return h.toString().trim();
  });

  var rows = values.slice(1).filter(function (row) {
    return row.join("").trim() !== "";
  });

  var works = rows.map(function (row) {
    var obj = {};
    headers.forEach(function (header, i) {
      obj[header] = row[i];
    });
    return obj;
  });

  return jsonResponse(works);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON
  );
}
