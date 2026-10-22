# Design

## Context

See [proposal.md](proposal.md) for motivation. CalendarPage already derives filtered entries grouped by local date; EventChip owns details, privacy, countdowns, and redeem permissions. Calendar events are instants, with no duration.

## Goals / Non-Goals

**Goals:** Reuse the existing event pipeline and interaction behavior, with a readable date rail and colored cards on desktop and phones.

**Non-Goals:** Event creation, new data sources, historical reset reconstruction, and invented event end times.

## Decisions

- Use a bounded 30-day range starting at the selected date. This keeps Today and mini-calendar jumps predictable and event projection bounded; infinite scrolling would add range and scroll-state complexity.
- Add a ScheduleView component and a schedule variant to EventChip. Share its existing details and label handling rather than implementing separate popover or permission paths.
- Group by the existing local-day keys. Include today even without events for orientation; omit other empty dates. Place month/year headings before each month represented in the list.
- Keep solid weekly reset cards, dashed estimates, and outlined/tinted credit expiry cards. Use existing theme-aware account color tokens and contrast colors.
- Show initial loading until the account list and requested credit snapshots settle, so a credit-only schedule does not briefly claim to be empty.
- Add the schedule contract as new requirements in frontend-architecture. The base calendar is recorded by the separate, existing add-dashboard-reset-calendar change and is not archived by this work.

## Risks / Trade-offs

- DST can make elapsed hours differ from calendar days → use existing local `addDays` helpers.
- Long account labels can overflow narrow cards → constrain card width and truncate only the account label, retaining the accessible name and details.
- Failed credit snapshots can omit credits → preserve current query/error behavior; loading is distinct from an empty event list but this change does not redesign error recovery.
- Month sections can be sparse → the explicit toolbar date range makes the period visible.

## Migration Plan

Frontend-only deployment; existing URLs retain behavior. Reverting the change makes `view=schedule` fall back to Month.
