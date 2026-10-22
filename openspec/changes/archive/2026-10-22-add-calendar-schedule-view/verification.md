# Verification

Verified on 2026-10-22 before archive.

## Completeness and correctness

All seven tasks are complete. All three requirements and their eight scenarios are implemented and covered.

| Contract | Evidence |
|---|---|
| URL selection, anchor preservation, 30-day navigation, Today, mini-calendar | Calendar page tests exercise the actual toolbar and mini-calendar; helper tests cover month/year/leap-day boundaries and local midnights across DST. |
| Local chronological grouping, all events visible, month headings, today | Page tests assert four ordered cards on one date, separate October/November headings, range clipping, and today's marker with and without events. |
| Filters and empty state | Page tests toggle account, estimated, weekly, and credit filters; cover no-account and empty-period states. |
| Details and redemption permissions | Shared month/Schedule tests open credit details for read-only and writer sessions and verify the confirmation path. Mobile browser checks open the details popover. |
| Privacy and time formatting | Page test changes privacy and 12/24-hour preferences while Schedule is mounted. |
| Loading | Delayed credit response test verifies loading without a premature empty-period message. |
| Responsive presentation | Playwright captures light/dark desktop and dark mobile; asserts no page overflow at 390px and 320px. Screenshots were visually inspected. |

## Commands

- `TZ=America/Chicago bun run test src/features/calendar src/i18n/index.test.ts`: 42 tests passed across three files.
- `bun run lint`: passed.
- `bun run build`: TypeScript and production build passed.
- `SCREENSHOT_WEBSERVER_COMMAND='bun run dev --host 127.0.0.1 --port 4173' bunx playwright test --config screenshots/playwright.config.ts --grep 'calendar schedule'`: three browser scenes passed.
- `openspec validate add-calendar-schedule-view --strict`: passed.
- `openspec validate --specs --json`: all 67 main specs passed. Existing long-requirement warnings remain outside this change.
- `git diff --check`: passed.

## Screenshots

- Before: five existing calendar scenes were captured from an isolated copy of the pre-change frontend under `/tmp/codex-calendar-schedule/docs/screenshots/`.
- After: `docs/screenshots/calendar-schedule-dark.jpg`, `calendar-schedule-light.jpg`, and `calendar-schedule-narrow-dark.jpg`.

## Coherence

Schedule reuses the filtered CalendarEntry map and EventChip details/actions. It adds no backend API, dependencies, settings, or navigation destinations. Requirements and stable context were synced into `openspec/specs/frontend-architecture/`. The separate base calendar change remains active.

No unresolved findings for this change. The full frontend suite and backend suites were not run; verification targeted the changed calendar, translations, browser rendering, and the frontend build/lint checks.
