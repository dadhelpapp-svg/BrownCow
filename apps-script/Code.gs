/**
 * BrownCow Payroll Bot - Google Apps Script Web App
 *
 * NEW FLOW (per run):
 * - Reads attendance from `attendanceSheetUrl` (expects tab `Att.log report`).
 * - Copies `payrollTemplateSpreadsheetId` into a BRAND-NEW payroll spreadsheet.
 * - Writes staging tab `normalized_attendance` into the new payroll spreadsheet.
 * - Applies number formats on `time_keeping` so time serials display as HH:mm.
 *
 * normalized_attendance contains ONLY complete IN/OUT pairs.
 */

function doPost(e) {
  try {
    var body = JSON.parse((e.postData && e.postData.contents) ? e.postData.contents : "{}");

    // One-time authorization helper (no editor dropdown needed)
    if (body && body.action === 'authorize') {
      authorizeDrive_();
      return _json({ ok: true, message: 'Drive authorized (if consent was granted).' });
    }

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

    // Create month payroll sheet + compute payroll rows
    var payrollWrite = writePayrollMonthSheet_(outSs, parsed.period, parsed.rows);

    return _json({
      ok: true,
      message: 'created new payroll file and wrote normalized_attendance',
      attendanceSpreadsheetId: attId,
      outputSpreadsheetId: outputSpreadsheetId,
      outputSpreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + outputSpreadsheetId + '/edit',
      normalizedRows: parsed.rows.length,
      period: parsed.period,
      payrollSheetName: payrollWrite.sheetName,
      payrollRows: payrollWrite.rowCount
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
    days.forEach(function(dn) {
      var col = colByDay[dn];
      var cell = (col != null && col < emp.punchRow.length) ? emp.punchRow[col] : '';
      var toks = _extractTimeTokens(cell);

      // Pair sequentially within the day cell to avoid cross-day pairing.
      for (var i = 0; i + 1 < toks.length; i += 2) {
        var timeIn = toks[i];
        var timeOut = toks[i + 1];

        var inDate = new Date(start.getFullYear(), start.getMonth(), dn);
        if (inDate < start || inDate > endPlus) continue;

        var hours = _hoursBetween(timeIn, timeOut);
        outRows.push([
          Utilities.formatDate(inDate, 'Etc/GMT', 'yyyy-MM-dd'),
          emp.name,
          timeIn,
          timeOut,
          Math.round(hours * 100) / 100
        ]);
      }
    });
  });

  outRows.sort(function(a, b) {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    var ea = String(a[1]), eb = String(b[1]);
    if (ea < eb) return -1;
    if (ea > eb) return 1;
    return String(a[2] || '').localeCompare(String(b[2] || ''));
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


/**
 * Creates or returns a month payroll sheet named like "February 2026 Payroll".
 * If the base name exists, suffixes: "(2)", "(3)", ...
 */
function ensureMonthPayrollSheet_(ss, period) {
  var base = _formatMonthLabel_(period) + ' Payroll';
  var name = base;
  var i = 2;
  while (ss.getSheetByName(name)) {
    name = base + ' (' + i + ')';
    i++;
  }
  var sh = ss.insertSheet(name);
  return sh;
}

/**
 * Ensures there is a `rates` sheet. If missing, creates it with DEFAULT + known override.
 * Returns a map keyed by employee name plus DEFAULT.
 *
 * Sheet schema (row 1 headers):
 * employee | daily_rate | ot_multiplier | nd_ot_premium_per_hr
 */
function ensureAndLoadRates_(ss) {
  var sh = ss.getSheetByName('rates');
  if (!sh) {
    sh = ss.insertSheet('rates');
    sh.getRange(1,1,1,4).setValues([["employee","daily_rate","ot_multiplier","nd_ot_premium_per_hr"]]);
    sh.getRange(2,1,2,4).setValues([
      ["DEFAULT", 485.00, 1, 6.75],
      ["Seducon, Vhanesza L.", 540.00, 1.25, 6.75]
    ]);
  }

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) throw new Error('rates sheet is empty');

  var header = values[0].map(function(x){ return String(x).trim(); });
  var idxEmp = header.indexOf('employee');
  var idxDaily = header.indexOf('daily_rate');
  var idxOtMul = header.indexOf('ot_multiplier');
  var idxNd = header.indexOf('nd_ot_premium_per_hr');
  if (idxEmp < 0 || idxDaily < 0 || idxOtMul < 0 || idxNd < 0) {
    throw new Error('rates sheet missing required headers: employee,daily_rate,ot_multiplier,nd_ot_premium_per_hr');
  }

  var map = {};
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var name = String(row[idxEmp] || '').trim();
    if (!name) continue;
    map[name] = {
      daily_rate: Number(row[idxDaily] || 0),
      ot_multiplier: Number(row[idxOtMul] || 1),
      nd_ot_premium_per_hr: Number(row[idxNd] || 0)
    };
  }
  if (!map.DEFAULT) {
    // safe fallback (shouldn't happen if we created it)
    map.DEFAULT = { daily_rate: 485.00, ot_multiplier: 1, nd_ot_premium_per_hr: 6.75 };
  }
  return map;
}

function _getRateFor_(ratesMap, employee) {
  return ratesMap[employee] || ratesMap.DEFAULT;
}

/**
 * Night differential window (locked): 22:00–00:00.
 * Returns overlap hours between [inMin,outMin] and window; handles overnight OUT < IN.
 */
function _ndOverlapHours_(timeIn, timeOut) {
  var inMin = _toMinutes(timeIn);
  var outMin = _toMinutes(timeOut);
  var durMin = (outMin >= inMin) ? (outMin - inMin) : ((outMin + 24*60) - inMin);

  // Represent the shift interval on a line starting at inMin and ending at inMin+durMin.
  // We'll compute overlap against ND window segments in that same line.
  // ND window is 22:00-24:00; relative to the calendar day of IN.
  // Because shifts can pass midnight, the window might appear at 22:00 of day0 and/or 22:00 of day1.

  var start = inMin;
  var end = inMin + durMin;

  function overlap(a1, a2, b1, b2) {
    var s = Math.max(a1, b1);
    var e = Math.min(a2, b2);
    return Math.max(0, e - s);
  }

  var nd0Start = 22*60;   // 1320
  var nd0End = 24*60;     // 1440
  var nd1Start = nd0Start + 24*60;
  var nd1End = nd0End + 24*60;

  var ovMin = 0;
  ovMin += overlap(start, end, nd0Start, nd0End);
  ovMin += overlap(start, end, nd1Start, nd1End);

  return ovMin / 60;
}

/**
 * Build daily detail payroll rows from normalized_attendance rows.
 * Output row schema:
 * date | employee | time_in | time_out | hours | regular_hours | ot_hours | nd_ot_hours | daily_rate | hourly_rate | ot_multiplier | regular_pay | ot_pay | nd_ot_premium | total_pay
 */

function _minutesSinceMidnight_(hhmm) {
  return _toMinutes(hhmm);
}

function _lateMinutesWithGrace_(actualInHHMM, scheduledHHMM, graceMinutes) {
  var actual = _minutesSinceMidnight_(actualInHHMM);
  var sched = _minutesSinceMidnight_(scheduledHHMM) + graceMinutes;
  return Math.max(0, actual - sched);
}

function _uniqueDatesCount_(dateSetObj) {
  return Object.keys(dateSetObj || {}).length;
}

/**
 * Summarize normalized_attendance rows into per-employee payroll totals.
 * normalizedRows schema: [date, employee, time_in, time_out, hours]
 */
function buildPayrollSummaryRows_(normalizedRows, ratesMap) {
  var byEmpDate = {}; // emp||date -> { employee, date, shifts:[], workedHours }
  var empDates = {};  // emp -> {date:true}
  var employees = {}; // emp -> true

  for (var i = 0; i < normalizedRows.length; i++) {
    var r = normalizedRows[i];
    var date = r[0];
    var employee = r[1];
    var timeIn = r[2];
    var timeOut = r[3];
    var hours = Number(r[4] || 0);

    employees[employee] = true;
    if (!empDates[employee]) empDates[employee] = {};
    empDates[employee][date] = true;

    var key = employee + '||' + date;
    if (!byEmpDate[key]) byEmpDate[key] = { employee: employee, date: date, shifts: [], workedHours: 0 };

    byEmpDate[key].shifts.push({
      timeIn: timeIn,
      timeOut: timeOut,
      hours: hours,
      ndOverlap: _ndOverlapHours_(timeIn, timeOut)
    });
    byEmpDate[key].workedHours += hours;
  }

  var summary = {};
  Object.keys(employees).forEach(function(emp) {
    var rate = _getRateFor_(ratesMap, emp);
    var dailyRate = Number(rate.daily_rate || 0);
    var hourlyRate = dailyRate / 8;
    var otMultiplier = Number(rate.ot_multiplier || 1);
    var ndPremiumPerHr = Number(rate.nd_ot_premium_per_hr || 0);

    summary[emp] = {
      employee: emp,
      rate: hourlyRate,
      otMultiplier: otMultiplier,
      ndPremiumPerHr: ndPremiumPerHr,

      days: _uniqueDatesCount_(empDates[emp]),
      lateMinutes: 0,

      regularHours: 0,
      otHours: 0,
      ndHours: 0,

      grossPay: 0,
      otPay: 0,
      ndPay: 0,

      // manual placeholders
      specialHolidayPay: 0,
      ut: 0,
      sss: 0,
      phic: 0,
      pagibig: 0
    };
  });

  Object.keys(byEmpDate).forEach(function(k) {
    var g = byEmpDate[k];
    var s = summary[g.employee];
    if (!s) return;

    g.shifts.sort(function(a, b) { return String(a.timeIn).localeCompare(String(b.timeIn)); });

    var late1 = 0, late2 = 0;
    if (g.shifts.length >= 1) late1 = _lateMinutesWithGrace_(g.shifts[0].timeIn, '11:00', 15);
    if (g.shifts.length >= 2) late2 = _lateMinutesWithGrace_(g.shifts[1].timeIn, '16:00', 15);

    var lateMin = late1 + late2;
    s.lateMinutes += lateMin;

    var lateHours = lateMin / 60;
    var paidRegularHours = Math.max(0, 8 - lateHours);

    var worked = Number(g.workedHours || 0);
    var dayOt = Math.max(0, worked - 8);

    s.regularHours += paidRegularHours;
    s.otHours += dayOt;

    // Allocate OT to last shift first to compute ND OT hours
    var otRemaining = dayOt;
    var ndOtHoursForDay = 0;
    for (var si = g.shifts.length - 1; si >= 0; si--) {
      var sh = g.shifts[si];
      var shiftOt = Math.min(Number(sh.hours || 0), otRemaining);
      otRemaining -= shiftOt;

      var ndOt = Math.min(shiftOt, Number(sh.ndOverlap || 0));
      ndOtHoursForDay += ndOt;

      if (otRemaining <= 0) break;
    }

    s.ndHours += ndOtHoursForDay;

    s.grossPay += paidRegularHours * s.rate;
    s.otPay += dayOt * s.rate * s.otMultiplier;
    s.ndPay += ndOtHoursForDay * s.ndPremiumPerHr;
  });

  function r2(x) { return Math.round(Number(x || 0) * 100) / 100; }

  var out = [];
  Object.keys(summary).sort().forEach(function(emp) {
    var s = summary[emp];

    var additionsTotal = s.otPay + s.ndPay + s.specialHolidayPay;
    var deductionsTotal = (s.lateMinutes / 60) * s.rate + s.ut + s.sss + s.phic + s.pagibig;
    var netPay = s.grossPay + additionsTotal - deductionsTotal;

    out.push([
      s.employee,
      r2(s.rate),
      s.days,
      r2(s.grossPay),
      r2(s.otHours),
      r2(s.otPay),
      r2(s.ndHours),
      r2(s.ndPay),
      r2(s.specialHolidayPay),
      r2(additionsTotal),
      Math.round(s.lateMinutes),
      r2(s.ut),
      r2(s.sss),
      r2(s.phic),
      r2(s.pagibig),
      r2(deductionsTotal),
      r2(netPay)
    ]);
  });

  return out;
}

function writePayrollMonthSheet_(ss, period, normalizedRows) {
  var payrollSh = ensureMonthPayrollSheet_(ss, period);
  var ratesMap = ensureAndLoadRates_(ss);

  var header = [[
    "Employee","Rate","No. of Days","Gross Pay",
    "OT Hours","OT Pay",
    "ND Hours","ND Pay",
    "Special Holiday Pay","Additions Total",
    "LATE","UT","SSS","PHIC","Pag-IBIG",
    "Deductions Total","Net Pay"
  ]];

  payrollSh.getRange(1,1,1,header[0].length).setValues(header);
  payrollSh.setFrozenRows(1);

  var rows = buildPayrollSummaryRows_(normalizedRows, ratesMap);
  if (rows.length) payrollSh.getRange(2,1,rows.length,header[0].length).setValues(rows);

  var n = Math.max(1, rows.length);

  payrollSh.getRange(2,2,n,1).setNumberFormat('0.00');  // Rate
  payrollSh.getRange(2,4,n,1).setNumberFormat('0.00');  // Gross Pay
  payrollSh.getRange(2,6,n,1).setNumberFormat('0.00');  // OT Pay
  payrollSh.getRange(2,8,n,1).setNumberFormat('0.00');  // ND Pay
  payrollSh.getRange(2,9,n,2).setNumberFormat('0.00');  // Special Holiday + Additions
  payrollSh.getRange(2,12,n,4).setNumberFormat('0.00'); // UT, SSS, PHIC, Pag-IBIG
  payrollSh.getRange(2,16,n,2).setNumberFormat('0.00'); // Deductions, Net

  payrollSh.getRange(2,3,n,1).setNumberFormat('0');     // No. of Days
  payrollSh.getRange(2,5,n,1).setNumberFormat('0.00');  // OT Hours
  payrollSh.getRange(2,7,n,1).setNumberFormat('0.00');  // ND Hours
  payrollSh.getRange(2,11,n,1).setNumberFormat('0');    // LATE minutes

  payrollSh.autoResizeColumns(1, header[0].length);

  return { sheetName: payrollSh.getName(), rowCount: rows.length };
}

