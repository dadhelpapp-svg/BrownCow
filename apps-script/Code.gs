/**
 * BrownCow Payroll Bot - Google Apps Script Web App
 *
 * Reads attendance from `attendanceSheetUrl` (expects tab `Att.log report`).
 * Writes staging tab `normalized_attendance` into `outputSpreadsheetId`.
 *
 * normalized_attendance contains ONLY complete IN/OUT pairs.
 */

function doPost(e) {
  try {
    var body = JSON.parse((e.postData && e.postData.contents) ? e.postData.contents : "{}");

    var attendanceSheetUrl = body.attendanceSheetUrl;
    var outputSpreadsheetId = body.outputSpreadsheetId;

    if (!attendanceSheetUrl || !outputSpreadsheetId) {
      return _json({ ok: false, error: "missing attendanceSheetUrl or outputSpreadsheetId" });
    }

    var attId = _spreadsheetIdFromUrl(attendanceSheetUrl);
    var attSs = SpreadsheetApp.openById(attId);
    var attSheet = attSs.getSheetByName('Att.log report');
    if (!attSheet) throw new Error("Att.log report tab not found in attendance spreadsheet");

    var values = attSheet.getDataRange().getDisplayValues();
    var parsed = _parseAttLogReport(values);

    var outSs = SpreadsheetApp.openById(String(outputSpreadsheetId));

    var stageName = 'normalized_attendance';
    var stage = outSs.getSheetByName(stageName);
    if (!stage) stage = outSs.insertSheet(stageName);
    stage.clearContents();

    var header = [["date","employee","time_in","time_out","hours"]];
    stage.getRange(1,1,1,header[0].length).setValues(header);

    if (parsed.rows.length) {
      stage.getRange(2,1,parsed.rows.length,5).setValues(parsed.rows);
    }

    return _json({
      ok: true,
      message: 'normalized_attendance written to output spreadsheet',
      attendanceSpreadsheetId: attId,
      outputSpreadsheetId: String(outputSpreadsheetId),
      normalizedRows: parsed.rows.length,
      period: parsed.period
    });

  } catch (err) {
    return _json({ ok: false, error: String(err && err.stack ? err.stack : err) });
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
  var endPlus = new Date(end.getTime() + 24*60*60*1000);

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
      var outt = events[i+1];

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

  outRows.sort(function(a,b){
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return a[1].localeCompare(b[1]);
  });

  return { period: period, rows: outRows };
}

function _hoursBetween(timeIn, timeOut) {
  var a = _toMinutes(timeIn);
  var b = _toMinutes(timeOut);
  var diff = (b >= a) ? (b - a) : ((b + 24*60) - a);
  return diff / 60;
}

function _toMinutes(t) {
  var parts = String(t).split(':');
  var h = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  return (h*60) + m;
}

function _extractTimeTokens(cell) {
  var s = String(cell || '').replace(/\s+/g,'');
  if (!s) return [];
  var m = s.match(/\d{1,2}:\d{2}/g);
  if (!m) return [];
  return m.map(function(t){
    var p=t.split(':');
    var hh=('0'+parseInt(p[0],10)).slice(-2);
    var mm=('0'+parseInt(p[1],10)).slice(-2);
    return hh+':'+mm;
  });
}

function _extractPeriod(values) {
  for (var r=0; r<values.length; r++) {
    for (var c=0; c<values[r].length; c++) {
      var s = values[r][c];
      if (typeof s !== 'string') continue;
      var m = s.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
      if (m) return { start: m[1], end: m[2] };
    }
  }
  return null;
}

function _findDayHeader(values) {
  for (var r=0; r<values.length; r++) {
    var row = values[r];
    if (!row || !row.length) continue;
    if (String(row[0]).trim() === '11') {
      var colByDay = {};
      var days = [];
      for (var c=0; c<row.length; c++) {
        var v = String(row[c]).trim();
        if (/^\d+$/.test(v)) {
          var dn = parseInt(v,10);
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
  for (var i=0; i<values.length; i++) {
    var r = values[i];
    if (!r || !r.length) continue;
    if (String(r[0]).indexOf('ID:') === 0) {
      // name typically at col 10 with preceding "Name:" at col 8
      var name = (r.length > 10) ? String(r[10]).trim() : '';
      var next = (i+1 < values.length) ? values[i+1] : [];
      var punchRow = (next && next.length && String(next[0]).indexOf('ID:') !== 0) ? next : [];
      if (name) out.push({ name: name, punchRow: punchRow });
    }
  }
  return out;
}

function _spreadsheetIdFromUrl(url) {
  var m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) throw new Error('Could not extract spreadsheetId from URL');
  return m[1];
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
