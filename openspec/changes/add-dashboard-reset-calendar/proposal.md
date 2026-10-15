## Why

Weekly quota resets and banked rate-limit reset credits are only visible one account at a time: the "Weekly remaining … Reset in 6d 8h" bar on an account card, the "Usage resets … Expires … (6d) 3 available" row on the Accounts page, and the list inside the redeem dialog. An operator with several accounts cannot see when the pool's weekly windows come back or when banked credits will lapse, so credits expire unredeemed and heavy work cannot be planned around upcoming resets.

## What Changes

- **New Calendar page** at `/calendar`: a month view (stepping into later months), a 14-day time grid, and a 7-day time grid, with the view and anchor date carried in the URL (`?view=month|14d|7d&date=YYYY-MM-DD`).
- **Weekly-reset events** from each account's `resetAtSecondary`. Later weeks are projected every `windowMinutesSecondary` and drawn as estimated (dashed, labelled "est.") because the backend only knows the next reset.
- **Reset-credit expiry events**, one per available credit, read from the existing per-account `GET /api/accounts/{id}/rate-limit-reset-credits` snapshot. The snapshot is only fetched for accounts whose summary reports `availableResetCredits > 0`. The credit that a redeem would consume (the soonest-expiring one per account) is marked.
- **Sidebar**:
  - a mini month
  - per-account visibility toggles, colour-coded, with the weekly-remaining bar and credit count
  - event-type toggles (weekly / estimated / credit expiries), persisted per browser
  - a short "Coming up" summary
- **Event details popover**. For a credit expiry, it offers **Redeem credit** (only for `accounts:write`), which opens the existing `ResetCreditConfirmDialog`.
- **Navigation**: Calendar becomes a sixth core navigation item, between Accounts and APIs, gated by `accounts:read`. `.github/simplicity-budgets.toml` `[core_nav] max_items` is raised from 5 to 6. Raising the budget needs the `simplicity-budget-approved` label plus this OpenSpec change. The why-not-advanced justification is in `context.md`.

No backend, schema, migration, setting, or environment-variable changes. The page reads `GET /api/accounts` and the existing per-account reset-credit snapshot only.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-architecture`:
  - Adds the Calendar page requirements: views and URL state, weekly-reset and estimated events, credit-expiry events, filters, event details and redeem gating.
  - Updates "Header navigation progressive disclosure" so Calendar is a core destination.

## Impact

- **Navigation and routing:** `frontend/src/components/layout/nav-items.ts`, `frontend/src/App.tsx`, `.github/simplicity-budgets.toml`.
- **New feature module `frontend/src/features/calendar/`:**
  - event derivation (`events.ts`)
  - view and URL state
  - the visibility store
  - the page, sidebar, month grid, time grid, event chip and event details components
- **Shared code:**
  - `frontend/src/utils/formatters.ts` exports the locale helper the calendar's `Intl` formatters reuse.
  - `frontend/src/index.css` adds theme-aware account colour tokens.
- **i18n:** `frontend/src/i18n/locales/{en,ko,zh-CN}.json` gain `nav.calendar` and `calendar.*`.
- **Tests:** unit tests for event derivation; page tests with MSW for views, filters, credit fetch gating and redeem gating; header navigation tests updated for the sixth core item.
- **Docs:** `docs/reset-calendar.md`, linked from `mkdocs.yml`.
