# Tasks

## 1. Schedule navigation

- [x] 1.1 Add the Schedule URL mode and 30-local-day range/stepping; verify range boundaries and month/year/DST transitions in calendar helper tests.
- [x] 1.2 Integrate Schedule into the toolbar and page with localized labels; verify view switching, Today, mini-calendar selection, and previous/next through page tests.

## 2. Schedule presentation and interactions

- [x] 2.1 Render grouped date rails, month headings, today's highlight, and colored EventChip cards; verify chronological order, uncapped days, privacy, time preferences, and existing details/redeem permissions through page tests.
- [x] 2.2 Preserve filters and add loading/empty states; verify account and event toggles and delayed initial credit data through page tests.
- [x] 2.3 Update reset calendar documentation and add desktop/mobile screenshot scenes; verify actual rendered layouts and save before/after evidence.

## 3. Integration verification

- [x] 3.1 Run frontend lint, typecheck/build, relevant tests, and strict change validation; record results and any existing failures.
- [x] 3.2 Verify implementation against each Schedule scenario, sync its requirements/context to the main capability, and run spec validation.

## Workflow follow-up

- Archive add-calendar-schedule-view after verification, retaining the separate base calendar change.
