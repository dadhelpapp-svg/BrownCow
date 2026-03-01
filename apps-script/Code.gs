/**
 * BrownCow Payroll Bot - Google Apps Script Web App
 *
 * Decision: Write a staging tab `normalized_attendance` with ONLY complete pairs.
 */

function doPost(e) {
  try {
    var body = JSON.parse((e.postData && e.postData.contents) ? e.postData.contents : "{}");

    var attendanceSheetUrl = body.attendanceSheetUrl;
    var templateId = body.payrollTemplateSpreadsheetId;

    if (!attendanceSheetUrl || !templateId) {
      return _json({ ok: false, error: "missing attendanceSheetUrl or payrollTemplateSpreadsheetId" });
    }

    // TODO: implement end-to-end
    // 1) open attendance sheet + parse Att.log report
    // 2) create new payroll spreadsheet
    // 3) copy template tabs
    // 4) create/overwrite normalized_attendance tab
    // 5) write ONLY complete pairs rows: [date, employee, time_in, time_out, hours]
    // 6) generate time_keeping from normalized_attendance

    return _json({
      ok: true,
      message: "scaffold: normalized_attendance will contain only complete IN/OUT pairs",
      normalized_attendance: {
        sheetName: "normalized_attendance",
        columns: ["date", "employee", "time_in", "time_out", "hours"],
        offRows: false
      }
    });
  } catch (err) {
    return _json({ ok: false, error: String(err && err.stack ? err.stack : err) });
  }
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
