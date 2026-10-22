## ADDED Requirements

### Requirement: Calendar Schedule view navigation

The Calendar SHALL offer Schedule alongside Month, 14 days, and 7 days. `view=schedule` SHALL select it. Schedule SHALL cover 30 local calendar days starting at the URL anchor date, without aligning to Sunday. Previous and Next SHALL move that anchor by 30 local days. Today and the mini-calendar SHALL change the anchor while retaining Schedule. Missing or invalid views SHALL still fall back to Month.

#### Scenario: Open and navigate a schedule URL
- **WHEN** an operator opens `/calendar?view=schedule&date=2026-10-22`
- **THEN** Schedule shows October 22 through November 20, inclusive
- **AND** Next changes the anchor to November 21 and Previous returns it to October 22

#### Scenario: Switch views and return to today
- **GIVEN** the calendar is anchored on October 22 in Month view
- **WHEN** the operator selects Schedule
- **THEN** the URL uses `view=schedule` and retains the anchor
- **AND** Today sets the anchor to the current local date without leaving Schedule

### Requirement: Calendar Schedule groups readable event cards by local date

Schedule SHALL list events in chronological local-date groups with month/year headings, a weekday/date rail, and stacked full-width cards. Days without events SHALL be omitted except today when in range. Today SHALL have a highlighted date marker. Every event SHALL be visible without a per-day cap. Cards SHALL show event type, account, and local time using account colors; estimated resets SHALL remain dashed and credit expiries SHALL retain their countdown.

#### Scenario: Several events on one day
- **GIVEN** October 22 has a reset and three credit expiries
- **WHEN** Schedule covers that day
- **THEN** all four cards appear under October 22 in time order
- **AND** no overflow control or horizontal time-grid scrolling is required on a phone

#### Scenario: Month boundary and today
- **WHEN** Schedule includes October and November events and today's date
- **THEN** the event groups have separate October and November headings with years
- **AND** today is highlighted, including when it has no events

### Requirement: Calendar Schedule preserves filters and event actions

Schedule SHALL use the existing account and event-type visibility preferences, email privacy, and time-format preference. Cards SHALL open the existing event details. Credit redemption SHALL only be offered with `accounts:write` and SHALL open the existing confirmation. Schedule SHALL show a loading indicator while initial calendar data is pending and a localized empty-period message when no visible events remain after loading.

#### Scenario: Filters remove events
- **WHEN** the operator hides an account or disables an event type in Schedule
- **THEN** matching cards disappear
- **AND** if no cards remain the empty-period message is displayed

#### Scenario: Schedule credit actions respect permissions
- **WHEN** a read-only operator opens a Schedule credit-expiry card
- **THEN** the details appear without a Redeem credit action
- **WHEN** an operator with `accounts:write` opens the same card and selects Redeem credit
- **THEN** the existing confirmation dialog opens

#### Scenario: Privacy and display preferences
- **WHEN** email privacy is enabled and the time format is changed
- **THEN** Schedule account emails are blurred and card times use the selected format

#### Scenario: Initial data is loading
- **WHEN** account or credit snapshot data is initially pending
- **THEN** Schedule displays a loading indicator without an empty-period message
