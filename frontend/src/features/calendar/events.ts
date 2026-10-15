import type { AccountSummary, RateLimitResetCreditsSnapshot } from "@/features/accounts/schemas";
import { parseDate } from "@/utils/formatters";

export const CALENDAR_VIEWS = ["month", "14d", "7d"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export type CalendarEventKind = "weekly" | "estimated" | "credit";

export type CalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  accountId: string;
  at: Date;
  /** Credit expiries only: the credit a redeem consumes next for this account. */
  redeemsNext: boolean;
};

/** Half-open local-time range: `start` is included, `end` is not. */
export type DateRange = { start: Date; end: Date };

export type AccountCreditSnapshot = {
  accountId: string;
  snapshot: RateLimitResetCreditsSnapshot | null | undefined;
};

export type TimedLayout<T> = { item: T; top: number; left: number; width: number };

const MINUTE_MS = 60_000;
// Upper bound on projected weekly occurrences per account in one range, so a
// malformed (tiny) window can never turn into an unbounded loop.
const MAX_OCCURRENCES_PER_ACCOUNT = 64;
const VIEW_DAYS: Record<Exclude<CalendarView, "month">, number> = { "14d": 14, "7d": 7 };
const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCalendarView(value: string | null): value is CalendarView {
  return value !== null && (CALENDAR_VIEWS as readonly string[]).includes(value);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Adds calendar days in local time (wall-clock safe across DST changes). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** The Sunday on or before `date`. */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  return addDays(day, -day.getDay());
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseDayKey(value: string | null): Date | null {
  const match = value ? DAY_KEY_PATTERN.exec(value) : null;
  if (!match) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // Reject rollovers such as 2026-02-31.
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function viewDayCount(view: Exclude<CalendarView, "month">): number {
  return VIEW_DAYS[view];
}

export function visibleRange(view: CalendarView, anchor: Date): DateRange {
  if (view === "month") {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil((first.getDay() + daysInMonth) / 7);
    const start = startOfWeek(first);
    return { start, end: addDays(start, weeks * 7) };
  }
  const start = startOfWeek(anchor);
  return { start, end: addDays(start, VIEW_DAYS[view]) };
}

export function stepAnchor(view: CalendarView, anchor: Date, direction: 1 | -1): Date {
  if (view === "month") {
    return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
  }
  return addDays(startOfDay(anchor), VIEW_DAYS[view] * direction);
}

export function rangeDays(range: DateRange): Date[] {
  const days: Date[] = [];
  for (let day = range.start; day < range.end; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/**
 * Weekly-reset events: the known `resetAtSecondary` instant, then a projected
 * occurrence every `windowMinutesSecondary` after it, flagged as estimated.
 */
export function buildWeeklyResetEvents(
  accounts: readonly AccountSummary[],
  range: DateRange,
  options: { includeEstimated: boolean },
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const account of accounts) {
    const resetAt = parseDate(account.resetAtSecondary);
    const windowMinutes = account.windowMinutesSecondary ?? 0;
    if (!resetAt || windowMinutes <= 0) {
      continue;
    }
    const periodMs = windowMinutes * MINUTE_MS;
    const firstIndex = Math.max(0, Math.ceil((range.start.getTime() - resetAt.getTime()) / periodMs));
    for (let index = firstIndex; index < firstIndex + MAX_OCCURRENCES_PER_ACCOUNT; index += 1) {
      const estimated = index > 0;
      const at = new Date(resetAt.getTime() + index * periodMs);
      if (at >= range.end || (estimated && !options.includeEstimated)) {
        break;
      }
      events.push({
        id: `${account.accountId}:weekly:${index}`,
        kind: estimated ? "estimated" : "weekly",
        accountId: account.accountId,
        at,
        redeemsNext: false,
      });
    }
  }
  return events;
}

/**
 * One event per available credit with a known expiry; the soonest-expiring
 * credit per account is the one a redeem consumes next.
 */
export function buildCreditExpiryEvents(
  snapshots: readonly AccountCreditSnapshot[],
  range: DateRange,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const { accountId, snapshot } of snapshots) {
    const credits = (snapshot?.credits ?? []).flatMap((credit) => {
      const expiresAt = credit.status === "available" ? parseDate(credit.expiresAt) : null;
      return expiresAt ? [{ id: credit.id, expiresAt }] : [];
    });
    const soonest = credits.reduce<(typeof credits)[number] | null>(
      (best, credit) => (best === null || credit.expiresAt < best.expiresAt ? credit : best),
      null,
    );
    for (const credit of credits) {
      if (credit.expiresAt < range.start || credit.expiresAt >= range.end) {
        continue;
      }
      events.push({
        id: `${accountId}:credit:${credit.id}`,
        kind: "credit",
        accountId,
        at: credit.expiresAt,
        redeemsNext: credit.id === soonest?.id,
      });
    }
  }
  return events;
}

export function sortByTime<T extends { at: Date }>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function groupByDay<T extends { at: Date }>(events: readonly T[]): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const event of sortByTime(events)) {
    const key = dayKey(event.at);
    const bucket = byDay.get(key);
    if (bucket) {
      bucket.push(event);
    } else {
      byDay.set(key, [event]);
    }
  }
  return byDay;
}

/**
 * Places one day's events on a time grid: `top` in px from midnight, and
 * events whose boxes would overlap share the column width side by side.
 */
export function layoutTimedEvents<T extends { at: Date }>(
  events: readonly T[],
  hourHeightPx: number,
  boxHeightPx: number,
): TimedLayout<T>[] {
  const placed = sortByTime(events).map((item) => ({
    item,
    top: Math.round((item.at.getHours() + item.at.getMinutes() / 60) * hourHeightPx),
  }));
  const clusters: (typeof placed)[] = [];
  let current: typeof placed | null = null;
  let clusterBottom = Number.NEGATIVE_INFINITY;
  for (const entry of placed) {
    if (current && entry.top < clusterBottom) {
      current.push(entry);
      clusterBottom = Math.max(clusterBottom, entry.top + boxHeightPx);
    } else {
      current = [entry];
      clusters.push(current);
      clusterBottom = entry.top + boxHeightPx;
    }
  }
  return clusters.flatMap((cluster) =>
    cluster.map((entry, index) => ({
      ...entry,
      left: (index * 100) / cluster.length,
      width: 100 / cluster.length,
    })),
  );
}

export const ACCOUNT_COLOR_COUNT = 6;

/** Account colour slots in account-list order, so a colour stays put while the list is unchanged. */
export function accountColorSlots(accounts: readonly AccountSummary[]): Map<string, number> {
  return new Map(accounts.map((account, index) => [account.accountId, (index % ACCOUNT_COLOR_COUNT) + 1]));
}
