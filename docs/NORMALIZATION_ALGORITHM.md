# Normalization algorithm

Implemented in Apps Script at:
- `apps-script/Code.gs` (`_parseAttLogReport`)

## Summary
1) Find day header row (11..)
2) Find period string (YYYY-MM-DD ~ YYYY-MM-DD)
3) For each employee block:
   - read day cells by column index
   - extract time tokens per day
   - flatten left-to-right
   - pair sequentially
   - attribute to IN day
4) Emit rows to `normalized_attendance`

## Output
Rows: `[date, employee, time_in, time_out, hours]`
Only complete pairs are emitted.
