# Proposal

## Why

The reset calendar's month and time grids make sparse events harder to scan, especially on a phone. A Google Calendar-style Schedule view gives operators a chronological list of upcoming resets and credit expiries with readable event cards.

## What Changes

- Add Schedule beside Month, 14 days, and 7 days, addressable with `view=schedule`.
- Show 30 local calendar days from the selected date, grouped by day with month headings, a date rail, today's highlight, and stacked account-colored cards.
- Preserve event filters, email privacy, local time formatting, details, and permission-gated credit redemption.
- Provide loading and empty states, localized labels, documentation, and desktop/mobile screenshots.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-architecture`: Add Schedule presentation and navigation to the existing calendar.

## Impact

Calendar frontend components, view/range helpers, English/Korean/Simplified Chinese translations, calendar tests, and `docs/reset-calendar.md`. No backend, dependency, configuration, or navigation-budget changes.
