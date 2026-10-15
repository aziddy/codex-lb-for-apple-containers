# Context: dashboard reset calendar

## Purpose

Operators running several ChatGPT accounts through codex-lb plan work around two kinds of clock:

- **Weekly window resets.** Each account's weekly quota comes back at its own time.
- **Banked rate-limit reset credits.** These expire if they are not redeemed.

Before this change, both were visible only per account. The calendar puts every account on one time axis.

## Decisions

### Estimated recurrence instead of only the known reset

`GET /api/accounts` carries only the next weekly reset (`resetAtSecondary`). Showing just that instant would leave later weeks and months almost empty, which defeats the point of a month view. The calendar therefore projects later occurrences every `windowMinutesSecondary` from the known instant. These are drawn as estimated, with a dashed outline and "est.", because the true next window is only fixed once the current one resets.

The projection uses absolute time (`resetAt + k × window`). Across a daylight-saving change, a projected reset therefore moves by an hour on the wall clock, which is what the upstream absolute reset does too.

### Per-account snapshot reads, no new endpoint

Individual credit expiries exist only in the per-account snapshot (`GET /api/accounts/{id}/rate-limit-reset-credits`). That endpoint is served from the in-memory reset-credit store and never calls upstream. The calendar requests it only for accounts whose summary reports `availableResetCredits > 0`, using the same query key as the redeem dialog, so the two share a cache and a redeem invalidates both.

A bulk dashboard endpoint (modelled on `_list_available_reset_credits` in `app/modules/proxy/api.py`) is the follow-up if very large fleets make the fan-out noticeable. It is not needed for the common case of a handful of accounts.

### Calendar as a core navigation item

`.github/simplicity-budgets.toml` caps core navigation at five items. The progressive-disclosure requirement defaults new pages to the Advanced menu.

The calendar is promoted to core because it is the only place that answers "when does capacity come back and what is about to expire" across the pool. That is a daily-use question on par with the Accounts page, not an occasional administrative task like Automations. Burying it in Advanced would hide the expiry warning it exists to surface.

The budget moves from 5 to 6 in this change. Raising a budget needs the `simplicity-budget-approved` label as well as this OpenSpec change.

### Weeks start on Sunday

This matches the familiar month layout and the existing mini-calendar (react-day-picker default). Locale-aware week starts can follow if requested.

## Constraints

- Read-only for principals without `accounts:write`. Redeem always goes through the existing confirmation dialog and its idempotency key; the calendar never consumes a credit directly.
- No new settings or environment variables. Filter choices are per-browser conveniences in `localStorage`.
- Primary (5-hour) and monthly windows are out of scope. They would crowd the month view, and the brief asked for weekly resets and banked credits only.

## Failure modes

- **Stale weekly data.** If `resetAtSecondary` is already in the past (usage not yet refreshed), the known reset still renders on its past date and later occurrences are projected from it. The next usage refresh replaces it.
- **Reset-credit cache empty after a restart.** Summaries report `availableResetCredits: 0` until the first refresh tick, so no snapshots are requested and no credit events render. They appear on the next 30-second accounts refetch after the store fills.
- **Snapshot returns `null`** (paused, re-auth, deactivated, or pending deletion). That account contributes no credit events.

## Example

The time is Thu 15 Oct 2026, 16:49 local. Account A has `resetAtSecondary` 22 Oct 00:49 and `windowMinutesSecondary` 10080, plus credits expiring 22 Oct 15:36, 29 Oct 13:56 and 6 Nov 17:25.

The October month view then shows, for account A:

| Date | Event | Chip label | Countdown |
|---|---|---|---|
| 22 Oct | Solid weekly reset | 12:49 AM | — |
| 22 Oct | Credit expiry, marked as the redeem target | 3:36 PM | `6d`, in red |
| 29 Oct | Dashed estimated reset | — | — |
| 29 Oct | Credit expiry | — | `13d` |

Stepping to November shows the 6 Nov expiry (`22d`) and the estimated resets, one every 7 days. In a timezone that leaves daylight saving on 1 Nov, they land at 23:49 on 4, 11, 18 and 25 Nov rather than at 00:49 the following mornings. The absolute instant is the same; only the wall clock moves.
