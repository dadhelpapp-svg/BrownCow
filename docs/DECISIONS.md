# Decisions

- Do not modify the source attendance sheet.
- Always normalize attendance into a staging tab `normalized_attendance`.
- `normalized_attendance` contains **only complete IN/OUT pairs** (no off rows).
- workday = IN day.
- time in/out are real time values.
- total hours is formula-based (overnight supported) and displayed as decimal rounded to 2 decimals.
- New hires: auto-add columns in time_keeping.
- Removed employees: clear their time_keeping data for the period.
