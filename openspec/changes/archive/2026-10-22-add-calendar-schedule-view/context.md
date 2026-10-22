# Schedule view

Schedule follows the Google Calendar reference: a narrow date column beside stacked event cards, with clear month boundaries and today's highlighted date. The 30-day window begins at the selected date; for example, October 22 includes events through November 20 and Next begins November 21.

The calendar has reset/expiry instants, not meeting durations. Cards show a single local time. Colors and distinctions retain the meaning established by the existing calendar, and clicking a card uses the existing details and credit confirmation behavior. Filters can empty the list; a pending initial request displays loading instead. No historical resets are reconstructed when browsing backwards.

Requirements are in [the delta spec](specs/frontend-architecture/spec.md). Stable context is synced to the frontend-architecture capability after verification.
