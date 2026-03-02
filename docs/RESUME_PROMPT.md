# BrownCow — RESUME PROMPT (Project Handoff)

Use this document as the source of truth. If chat context conflicts with this doc, assume this doc is correct and ask before changing production.

## Current baseline

- Repo: https://github.com/dadhelpapp-svg/BrownCow
- Branch: `main`

## Current /exec (Apps Script Web App)

- **/exec URL (CURRENT):** https://script.google.com/macros/s/AKfycbylciB9sHopkPyvyMhuxRgL6WO2LMiVRifEbCuQQ2SJlcH6-UihUR9Wdk8tK6Gm_1YG/exec
- Script ID: `1J_YHPWVaQpLrNacqsWbM3DtICSbLqg_2Pjo4Dp5F_APIPlgq9fxqP9Fj`
- Deployment setting (required): **Execute as: Me (dadhelpapp@gmail.com)**

## Payroll template

- Spreadsheet ID: `1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ`
- Name: **BrownCow Payroll - Template** (ID unchanged)
- Required tab: `rates`
  - Header: `employee | daily_rate | ot_multiplier | ot_nd_premium_per_hr`
  - Rows:
    - `DEFAULT | 485 | 1 | 6.75`
    - `Seducon, Vhanesza L. | 540 | 1.25 | 6.75`

## Attendance input (example)

- Attendance sheet URL (example used for E2E):
  - https://docs.google.com/spreadsheets/d/1qSFdNVqtBTat1PzMEkgiPKvvh3BiEdXq1RJurOLg74E/edit?gid=1112430549#gid=1112430549

## Current known status

- ✅ Worker deployed; webhook set.
- ✅ Apps Script Drive consent completed for deployer account (DriveApp.makeCopy works).

## Last known-good end-to-end run

- Period: `2026-02-11` ~ `2026-02-25`
- normalizedRows: `39`
- Example output sheet:
  - https://docs.google.com/spreadsheets/d/1Rpb3Vi1aG3KbzQkCTPirkTNMKb6Sj1qcZBKmDLAPOpk/edit

## Payroll rules (locked)

- Default daily rate: **485 PHP/day**
- Special daily rate: **Seducon, Vhanesza L. = 540 PHP/day**
- Hourly rate: `daily_rate / 8`
- Regular day: `8 hours`
- OT hours per day: `max(0, total_hours - 8)`
- OT pay: `ot_hours * hourly_rate * ot_multiplier` (from `rates` tab)
- ND window: **22:00–00:00**
- OT+ND premium: **+6.75 PHP/hr** applied to OT hours overlapping ND window (`ot_nd_hours`)

## Apps Script deployment via clasp (Windows + PowerShell)

> Use clasp to push code to the Apps Script project and deploy a new version.

- Script ID: `1J_YHPWVaQpLrNacqsWbM3DtICSbLqg_2Pjo4Dp5F_APIPlgq9fxqP9Fj`

### Setup

- Install + login:
  - `npm i -g @google/clasp`
  - `clasp login`

### Push + deploy

From the repo’s Apps Script folder (recommended: `apps-script/`):

- `clasp push`
- `clasp deploy --description "update web app"`

### Make /exec use the new version

In Apps Script UI:

- Deploy → Manage deployments → edit the **Web app** deployment used by the stable /exec URL
- Set **Version** to the newly deployed version
- Keep **Execute as: Me**

## PowerShell E2E test (Web App only)

```powershell
$EXEC = "https://script.google.com/macros/s/AKfycbylciB9sHopkPyvyMhuxRgL6WO2LMiVRifEbCuQQ2SJlcH6-UihUR9Wdk8tK6Gm_1YG/exec"

# authorize
$body = @{ action = "authorize" } | ConvertTo-Json
Invoke-RestMethod -Uri $EXEC -Method POST -ContentType "application/json" -Body $body

# run
$attendanceUrl = "https://docs.google.com/spreadsheets/d/1qSFdNVqtBTat1PzMEkgiPKvvh3BiEdXq1RJurOLg74E/edit?gid=1112430549#gid=1112430549"
$templateId = "1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ"
$body = @{ attendanceSheetUrl = $attendanceUrl; payrollTemplateSpreadsheetId = $templateId } | ConvertTo-Json
$res = Invoke-RestMethod -Uri $EXEC -Method POST -ContentType "application/json" -Body $body
$res | ConvertTo-Json -Depth 10
```
