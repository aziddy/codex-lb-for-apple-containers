## 1. Navigation and routing

- [x] 1.1 Add `{ to: "/calendar", labelKey: "nav.calendar", requires: "accounts:read" }` to `CORE_NAV_ITEMS` after Accounts in `frontend/src/components/layout/nav-items.ts`.
- [x] 1.2 Raise `[core_nav] max_items` from 5 to 6 in `.github/simplicity-budgets.toml`.
- [x] 1.3 Register the lazy `/calendar` route inside `RouteGuard` in `frontend/src/App.tsx`.

## 2. Event derivation and state

- [x] 2.1 `frontend/src/features/calendar/events.ts`:
  - visible range per view (Sunday week start)
  - anchor stepping
  - weekly-reset events with estimated recurrences
  - credit-expiry events with the per-account soonest mark
  - grouping by local day
  - stable account colours
- [x] 2.2 `frontend/src/features/calendar/use-calendar-params.ts`: `view` and `date` URL state with fallbacks.
- [x] 2.3 `frontend/src/features/calendar/use-calendar-preferences.ts`: persisted account visibility and event-type toggles.
- [x] 2.4 `frontend/src/features/calendar/use-calendar-data.ts`: account list query plus per-account snapshot queries, the latter only for accounts with `availableResetCredits > 0`, sharing the redeem dialog's query key.

## 3. UI

- [x] 3.1 Calendar page shell: header, toolbar (Today, previous/next, title, view switch), sidebar and grid layout.
- [x] 3.2 Sidebar:
  - mini month
  - account toggles with colour, weekly bar and credit count
  - event-type toggles
  - "Coming up" summary
- [x] 3.3 Month grid: three events per day plus "+N more" linking to the 7-day view, and a compact phone layout with a day agenda.
- [x] 3.4 7- and 14-day time grids with events at their exact time and a current-time line.
- [x] 3.5 Event chips and the details popover. Redeem appears only with `accounts:write` and opens `ResetCreditConfirmDialog`.
- [x] 3.6 Theme-aware account colour tokens in `frontend/src/index.css`, and `nav.calendar` / `calendar.*` strings in `en`, `ko` and `zh-CN`.

## 4. Verification

- [x] 4.1 Unit tests for `events.ts`: range per view, stepping, estimated flag, range clipping, accounts with no weekly window, credit filtering and soonest mark.
- [x] 4.2 Page tests with MSW:
  - default and URL-driven views
  - next/previous
  - snapshot requested only for accounts with credits
  - hiding an account
  - hiding estimated resets
  - "+N more" navigation
  - Redeem shown for writers and hidden for read-only sessions
- [x] 4.3 Header navigation tests updated for Calendar as a core item, and the nav-permission flow covering `/calendar` without `accounts:read`.
- [x] 4.4 `bun run lint`, `bun run typecheck`, `bun run test`, `openspec validate add-dashboard-reset-calendar --strict`.
- [x] 4.5 Before/after screenshots of the header and the Calendar page for the PR (P5).

## 5. Documentation

- [x] 5.1 `docs/reset-calendar.md`, linked from `mkdocs.yml`, pointing back to `openspec/specs/frontend-architecture/`.
