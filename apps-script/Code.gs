LyoqCiAqIEJyb3duQ293IFBheXJvbGwgQm90IC0gR29vZ2xlIEFwcHMgU2NyaXB0IFdlYiBBcHAKICoKICogTkVXIEZMT1cgKHBlciBydW4pOgogKiAtIFJlYWRzIGF0dGVuZGFuY2UgZnJvbSBgYXR0ZW5kYW5jZVNoZWV0VXJsYCAoZXhwZWN0cyB0YWIgYEF0dC5sb2cgcmVwb3J0YCkuCiAqIC0gQ29waWVzIGBwYXlyb2xsVGVtcGxhdGVTcHJlYWRzaGVldElkYCBpbnRvIGEgQlJBTkQtTkVXIHBheXJvbGwgc3ByZWFkc2hlZXQuCiAqIC0gV3JpdGVzIHN0YWdpbmcgdGFiIGBub3JtYWxpemVkX2F0dGVuZGFuY2VgIGludG8gdGhlIG5ldyBwYXlyb2xsIHNwcmVhZHNoZWV0LgogKiAtIEFwcGxpZXMgbnVtYmVyIGZvcm1hdHMgb24gYHRpbWVfa2VlcGluZ2Agc28gdGltZSBzZXJpYWxzIGRpc3BsYXkgYXMgSEg6bW0uCiAqCiAqIG5vcm1hbGl6ZWRfYXR0ZW5kYW5jZSBjb250YWlucyBPTkxZIGNvbXBsZXRlIElOL09VVCBwYWlycy4KICovCgpmdW5jdGlvbiBkb1Bvc3QoZSkgewogIHRyeSB7CiAgICB2YXIgYm9keSA9IEpTT04ucGFyc2UoKGUucG9zdERhdGEgJiYgZS5wb3N0RGF0YS5jb250ZW50cykgPyBlLnBvc3REYXRhLmNvbnRlbnRzIDogInt9Iik7CgogICAgLy8gT25lLXRpbWUgYXV0aG9yaXphdGlvbiBoZWxwZXIgKG5vIGVkaXRvciBkcm9wZG93biBuZWVkZWQpCiAgICBpZiAoYm9keSAmJiBib2R5LmFjdGlvbiA9PT0gJ2F1dGhvcml6ZScpIHsKICAgICAgYXV0aG9yaXplRHJpdmVfKCk7CiAgICAgIHJldHVybiBfanNvbih7IG9rOiB0cnVlLCBtZXNzYWdlOiAnRHJpdmUgYXV0aG9yaXplZCAoaWYgY29uc2VudCB3YXMgZ3JhbnRlZCkuJyB9KTsKICAgIH0K

    var attendanceSheetUrl = body.attendanceSheetUrl;
    var payrollTemplateSpreadsheetId = body.payrollTemplateSpreadsheetId;

    if (!attendanceSheetUrl || !payrollTemplateSpreadsheetId) {
      return _json({ ok: false, error: "missing attendanceSheetUrl or payrollTemplateSpreadsheetId" });
    }

    var attId = _spreadsheetIdFromUrl(attendanceSheetUrl);
    var attSs = SpreadsheetApp.openById(attId);
    var attSheet = attSs.getSheetByName('Att.log report');
    if (!attSheet) throw new Error("Att.log report tab not found in attendance spreadsheet");

    var values = attSheet.getDataRange().getDisplayValues();
    var parsed = _parseAttLogReport(values);

    // Create a fresh payroll spreadsheet by copying the template.
    var outputFileName = body.outputFileName || ("BrownCow Payroll - " + _formatMonthLabel_(parsed.period));
    var outFile = DriveApp.getFileById(String(payrollTemplateSpreadsheetId)).makeCopy(outputFileName);
    var outputSpreadsheetId = outFile.getId();
    var outSs = SpreadsheetApp.openById(outputSpreadsheetId);

    // Write normalized_attendance
    var stageName = 'normalized_attendance';
    var stage = outSs.getSheetByName(stageName);
    if (!stage) stage = outSs.insertSheet(stageName);
    stage.clearContents();

    var header = [["date","employee","time_in","time_out","hours"]];
    stage.getRange(1, 1, 1, header[0].length).setValues(header);
    if (parsed.rows.length) {
      stage.getRange(2, 1, parsed.rows.length, 5).setValues(parsed.rows);
    }

    // Apply formats (time_keeping is already formatted by template; this forces HH:mm display for any time serials)
    formatTimeKeepingMilitary_(outSs);

    return _json({
      ok: true,
      message: 'created new payroll file and wrote normalized_attendance',
      attendanceSpreadsheetId: attId,
      outputSpreadsheetId: outputSpreadsheetId,
      outputSpreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + outputSpreadsheetId + '/edit',
      normalizedRows: parsed.rows.length,
      period: parsed.period
    });

  } catch (err) {
    return _json({ ok: false, error: String(err && err.stack ? err.stack : err) });
  }
}

/**
 * Optional: web landing page (GET). Query params may be stripped by redirects,
 * so do not rely on them for authorization.
 */
function doGet(e) {
  return HtmlService.createHtmlOutput(
    '<h3>BrownCow Payroll Bot (doGet v2)</h3>' +
    '<p>Use POST /exec for automation.</p>' +
    '<p>To authorize Drive (no editor dropdown): POST <code>{"action":"authorize"}</code> to /exec.</p>'
  );
}

function authorizeDrive_() {
  // One-time authorization helper
  DriveApp.getRootFolder();
}

/**
 * Formats the time_keeping sheet to show time serials as HH:mm and hours as 0.00.
 * Assumes fixed 13 placeholder blocks, each block is 3 columns:
 *   TIME IN, TIME OUT, TOTAL HRS
 * starting at column B and ending at column AN.
 */
function formatTimeKeepingMilitary_(ss) {
  var sh = ss.getSheetByName('time_keeping');
  if (!sh) return;

  var startRow = 5;
  var lastRow = sh.getLastRow();
  if (lastRow < startRow) lastRow = startRow + 200; // ensure we format a reasonable visible range

  var numRows = lastRow - startRow + 1;

  var startCol = 2;  // B
  var endCol = 40;   // AN

  for (var c = startCol; c <= endCol; c += 3) {
    // TIME IN + TIME OUT
    sh.getRange(startRow, c, numRows, 2).setNumberFormat('HH:mm');
    // TOTAL HRS
    sh.getRange(startRow, c + 2, numRows, 1).setNumberFormat('0.00');
  }
}

/**
 * Parse Att.log report values[][] into normalized rows.
 * Output rows: [date (yyyy-mm-dd), employee, time_in, time_out, hours]
 */
function _parseAttLogReport(values) {
  var period = _extractPeriod(values);
  if (!period) throw new Error('Could not find period string (YYYY-MM-DD ~ YYYY-MM-DD)');

  var start = new Date(period.start + 'T00:00:00');
  var end = new Date(period.end + 'T00:00:00');
  // include +1 day
  var endPlus = new Date(end.getTime() + 24 * 60 * 60 * 1000);

  var dayHeader = _findDayHeader(values);
  var colByDay = dayHeader.colByDay;
  var days = dayHeader.days; // e.g., [11..26]

  var employees = _extractEmployees(values);

  var outRows = [];
  employees.forEach(function(emp) {
    var events = [];

    days.forEach(function(dn) {
      var col = colByDay[dn];
      var cell = (col != null && col < emp.punchRow.length) ? emp.punchRow[col] : '';
      var toks = _extractTimeTokens(cell);
      toks.forEach(function(t) {
        events.push({ day: dn, time: t });
      });
    });

    for (var i = 0; i + 1 < events.length; i += 2) {
      var inn = events[i];
      var outt = events[i + 1];

      var inDate = new Date(start.getFullYear(), start.getMonth(), inn.day);
      if (inDate < start || inDate > endPlus) continue;

      var hours = _hoursBetween(inn.time, outt.time);
      outRows.push([
        Utilities.formatDate(inDate, 'Etc/GMT', 'yyyy-MM-dd'),
        emp.name,
        inn.time,
        outt.time,
        Math.round(hours * 100) / 100
      ]);
    }
  });

  outRows.sort(function(a, b) {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return a[1].localeCompare(b[1]);
  });

  return { period: period, rows: outRows };
}

function _formatMonthLabel_(period) {
  try {
    // period.start is YYYY-MM-DD
    var y = parseInt(period.start.slice(0, 4), 10);
    var m = parseInt(period.start.slice(5, 7), 10) - 1;
    var d = new Date(y, m, 1);
    return Utilities.formatDate(d, 'Etc/GMT', 'MMMM yyyy');
  } catch (e) {
    return 'Payroll';
  }
}

function _hoursBetween(timeIn, timeOut) {
  var a = _toMinutes(timeIn);
  var b = _toMinutes(timeOut);
  var diff = (b >= a) ? (b - a) : ((b + 24 * 60) - a);
  return diff / 60;
}

function _toMinutes(t) {
  var parts = String(t).split(':');
  var h = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  return (h * 60) + m;
}

function _extractTimeTokens(cell) {
  var s = String(cell || '').replace(/\s+/g, '');
  if (!s) return [];
  var m = s.match(/\d{1,2}:\d{2}/g);
  if (!m) return [];
  return m.map(function(t) {
    var p = t.split(':');
    var hh = ('0' + parseInt(p[0], 10)).slice(-2);
    var mm = ('0' + parseInt(p[1], 10)).slice(-2);
    return hh + ':' + mm;
  });
}

function _extractPeriod(values) {
  for (var r = 0; r < values.length; r++) {
    for (var c = 0; c < values[r].length; c++) {
      var s = values[r][c];
      if (typeof s !== 'string') continue;
      var m = s.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
      if (m) return { start: m[1], end: m[2] };
    }
  }
  return null;
}

function _findDayHeader(values) {
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    if (!row || !row.length) continue;
    if (String(row[0]).trim() === '11') {
      var colByDay = {};
      var days = [];
      for (var c = 0; c < row.length; c++) {
        var v = String(row[c]).trim();
        if (/^\d+$/.test(v)) {
          var dn = parseInt(v, 10);
          days.push(dn);
          colByDay[dn] = c;
        }
      }
      return { rowIndex: r, days: days, colByDay: colByDay };
    }
  }
  throw new Error('Day header row not found (row starting with 11)');
}

function _extractEmployees(values) {
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    if (!r || !r.length) continue;
    if (String(r[0]).indexOf('ID:') === 0) {
      // name typically at col 10
      var name = (r.length > 10) ? String(r[10]).trim() : '';
      var next = (i + 1 < values.length) ? values[i + 1] : [];
      var punchRow = (next && next.length && String(next[0]).indexOf('ID:') !== 0) ? next : [];
      if (name) out.push({ name: name, punchRow: punchRow });
    }
  }
  return out;
}

function _spreadsheetIdFromUrl(url) {
  var m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) throw new Error('Could not extract spreadsheetId from URL');
  return m[1];
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
