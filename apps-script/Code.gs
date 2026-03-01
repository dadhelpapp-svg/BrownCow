/**
 * BrownCow Payroll Bot - Google Apps Script Web App
 * POST JSON → create new payroll spreadsheet from template → write time_keeping
 */

function doPost(e) {
  try {
    var body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : "{}");

    // TODO: implement
    // - open attendance sheet by URL
    // - parse Att.log report
    // - create new payroll file
    // - copy template tabs
    // - write time_keeping

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, message: "not implemented" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
