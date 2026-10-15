## ADDED Requirements

### Requirement: Calendar page shows resets in month, 14-day, and 7-day views

The SPA SHALL expose a Calendar page at `/calendar` for principals holding `accounts:read`. The page SHALL offer three views: a month grid, a 14-day time grid, and a 7-day time grid. The active view SHALL be carried in the `view` query parameter (`month`, `14d`, or `7d`) and the anchor date in the `date` query parameter (`YYYY-MM-DD`, local time). A missing or invalid `view` SHALL fall back to `month`, and a missing or invalid `date` SHALL fall back to the current local date. Weeks SHALL start on Sunday.

The month view SHALL show every week that contains a day of the anchor month. The 14-day and 7-day views SHALL start on the Sunday on or before the anchor date. The previous and next controls SHALL move the anchor by one calendar month in the month view, by 14 days in the 14-day view, and by 7 days in the 7-day view. The Today control SHALL set the anchor to the current local date. The current day SHALL be highlighted in every view.

#### Scenario: Default view is the current month
- **WHEN** a user opens `/calendar` with no query parameters
- **THEN** the month view for the current local month renders
- **AND** today's date is highlighted

#### Scenario: View and date come from the URL
- **WHEN** a user opens `/calendar?view=7d&date=2026-10-21`
- **THEN** the 7-day view renders Sunday 2026-10-18 through Saturday 2026-10-24

#### Scenario: Invalid parameters fall back
- **WHEN** a user opens `/calendar?view=year&date=not-a-date`
- **THEN** the month view for the current local month renders

#### Scenario: Next steps by the view length
- **WHEN** the 14-day view is anchored on 2026-10-15 and the user activates Next
- **THEN** the view shows Sunday 2026-10-25 through Saturday 2026-11-07
- **AND** the URL `date` parameter is `2026-10-29`

### Requirement: Calendar shows weekly resets with estimated recurrences

For every account whose summary has both `resetAtSecondary` and a positive `windowMinutesSecondary`, the Calendar SHALL render a weekly-reset event at `resetAtSecondary`. It SHALL render further occurrences every `windowMinutesSecondary` minutes after that instant. Each further occurrence SHALL be flagged as estimated, and SHALL render with a dashed outline and an "est." label so it is visually distinct from the known reset. Accounts without a weekly window SHALL contribute no weekly-reset events. The Calendar SHALL NOT render primary (5-hour) or monthly window resets.

#### Scenario: Known reset and estimated recurrences
- **GIVEN** an account with `resetAtSecondary` of 2026-10-22T00:49 local time and `windowMinutesSecondary` of 10080
- **WHEN** the month view for October 2026 renders
- **THEN** a solid weekly-reset event appears on October 22
- **AND** an estimated weekly-reset event appears on October 29
- **AND** the month view for November 2026 shows estimated weekly-reset events on November 5, 12, 19, and 26

#### Scenario: Account without a weekly window
- **GIVEN** an account whose `resetAtSecondary` is null
- **WHEN** the Calendar renders
- **THEN** no weekly-reset event is drawn for that account

### Requirement: Calendar shows reset-credit expiries

The Calendar SHALL request `GET /api/accounts/{account_id}/rate-limit-reset-credits` only for accounts whose summary reports `availableResetCredits > 0`. For every credit in a returned snapshot with status `available` and a non-null `expiresAt`, it SHALL render one credit-expiry event at `expiresAt`. A `null` snapshot SHALL contribute no events. For each account, the credit with the soonest `expiresAt` SHALL be marked as the credit a redeem consumes. Each credit-expiry event SHALL display the single-unit countdown defined by "Reset actions display a single-unit expiry countdown", in the destructive colour when it is under seven days.

#### Scenario: Snapshot fetched only for accounts with credits
- **GIVEN** account A reports `availableResetCredits: 3` and account B reports `availableResetCredits: 0`
- **WHEN** the Calendar renders
- **THEN** the snapshot is requested for account A
- **AND** no snapshot request is issued for account B

#### Scenario: One event per available credit
- **GIVEN** account A's snapshot lists three `available` credits and one `redeemed` credit
- **WHEN** the Calendar renders a range containing all four expiry instants
- **THEN** exactly three credit-expiry events are drawn for account A
- **AND** the soonest of the three is marked as the one a redeem uses

### Requirement: Calendar filters accounts and event types

The Calendar SHALL list every account with a colour that stays stable for that account while the account list is unchanged, together with a visibility toggle. It SHALL provide toggles for weekly resets, estimated resets, and credit expiries. Hiding an account SHALL remove all of its events from every view. Turning off weekly resets SHALL also remove estimated resets. The account visibility and event-type choices SHALL persist in the browser across reloads and SHALL NOT be sent to the server. Account labels SHALL follow the dashboard email-privacy blur.

#### Scenario: Hiding an account removes its events
- **WHEN** a user turns off the visibility toggle for account A
- **THEN** no weekly-reset, estimated, or credit-expiry event for account A renders in the current view

#### Scenario: Estimated resets can be hidden alone
- **WHEN** a user turns off estimated resets and leaves weekly resets on
- **THEN** each account's known weekly reset still renders
- **AND** no estimated weekly-reset event renders

### Requirement: Calendar event details and redeem gating

Activating a calendar event SHALL open a details popover naming the event type, the account, and the event's date and time.

- For a weekly reset, the popover SHALL show the account's weekly remaining percentage and the relative time to its reset.
- For an estimated reset, it SHALL state that the time is projected from the known reset.
- For a credit expiry, it SHALL show the countdown and the account's available credit count.

A **Redeem credit** action SHALL appear in a credit-expiry popover only for principals holding `accounts:write`. It SHALL open the existing reset-credit redeem confirmation for that account. The Calendar SHALL NOT redeem a credit without that confirmation.

In the month view, a day cell SHALL show at most three events. When a day has more, it SHALL show a "+N more" control that opens the 7-day view anchored on that day.

#### Scenario: Redeem is offered to writers
- **GIVEN** the session holds `accounts:write`
- **WHEN** the user opens a credit-expiry event
- **THEN** a Redeem credit action is shown
- **AND** activating it opens the reset-credit redeem confirmation for that account

#### Scenario: Redeem is hidden from read-only sessions
- **GIVEN** the session holds `accounts:read` but not `accounts:write`
- **WHEN** the user opens a credit-expiry event
- **THEN** no Redeem credit action is shown

#### Scenario: Overflowing day links to the 7-day view
- **GIVEN** a day with five events in the month view
- **WHEN** the month view renders
- **THEN** the day cell shows three events and a "+2 more" control
- **AND** activating the control opens the 7-day view anchored on that day

## MODIFIED Requirements

### Requirement: Header navigation progressive disclosure

The application header SHALL render core destinations as top-level navigation items: Dashboard, Reports, Accounts, Calendar, APIs, and Settings. Non-core destinations (currently Automations) SHALL NOT render as top-level items. On desktop they SHALL be reachable through an Advanced menu that opens in one interaction, and in the mobile navigation menu they SHALL be grouped under an Advanced label. Direct routes to non-core destinations (e.g. `/automations`) SHALL continue to resolve, and the legacy `/firewall` route SHALL continue to redirect to `/settings`. A new page-level navigation destination SHALL default to the Advanced menu unless a spec explicitly designates it as core.

#### Scenario: Advanced menu reveals Automations

- **WHEN** a user opens the Advanced menu in the header
- **THEN** an Automations item is revealed
- **AND** activating it navigates to `/automations`

#### Scenario: Automations is not a top-level item

- **WHEN** a user views the header navigation
- **THEN** Dashboard, Reports, Accounts, Calendar, APIs, and Settings render as top-level links
- **AND** Automations does not render as a top-level link

#### Scenario: Calendar requires account read access

- **WHEN** the session lacks `accounts:read`
- **THEN** the Calendar navigation item is not rendered
- **AND** opening `/calendar` redirects to `/dashboard`

#### Scenario: Advanced trigger reflects the active route

- **WHEN** the current route is an advanced destination such as `/automations`
- **THEN** the Advanced menu trigger renders in the active state
- **AND** on core routes it renders in the inactive state

#### Scenario: Deep links to advanced destinations keep working

- **WHEN** a user opens `/automations` directly
- **THEN** the Automations page renders

#### Scenario: Legacy firewall route redirects

- **WHEN** a user opens `/firewall`
- **THEN** the app redirects to `/settings`
