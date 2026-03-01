# normalized_attendance (Staging Tab)

Decision: **ONLY complete IN/OUT pairs** are written as rows.

## Tab name
- `normalized_attendance`

## Columns
| Column | Name | Type | Notes |
|---:|---|---|---|
| A | date | Date | Calendar date derived from the report period (`YYYY-MM-DD ~ YYYY-MM-DD`) plus +1 day |
| B | employee | Text | Employee name as it appears in the attendance export |
| C | time_in | Time | Workday = IN day |
| D | time_out | Time | May be next-day time (e.g., 16:18 → 00:03), still attributed to IN day |
| E | hours | Number | Decimal hours rounded to 2 decimals; overnight supported |

## Attendance parsing rules
- Extract day columns using the day header row (11..26) column indexes.
- Extract time tokens from each day cell, including concatenated values like `11:2518:30`.
- Flatten tokens left-to-right across day columns.
- Pair sequentially: (IN, OUT), drop last unmatched.
- Attribute each pair to the IN day.

## Important
- No `off` rows are written.
