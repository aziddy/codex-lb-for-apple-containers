import { getTimeFormatPreference } from "@/hooks/use-time-format";
import { getIntlLocale } from "@/utils/formatters";

function hourCycle(): "h12" | "h23" {
  return getTimeFormatPreference() === "12h" ? "h12" : "h23";
}

/** Chip time, e.g. "12:49 AM" or "00:49" per the time-format preference. */
export function formatEventTime(date: Date): string {
  return new Intl.DateTimeFormat(getIntlLocale(), { hour: "numeric", minute: "2-digit", hourCycle: hourCycle() }).format(date);
}

/** Time-grid gutter label for an hour of the day, e.g. "1 AM" or "01". */
export function formatHourLabel(hour: number): string {
  return new Intl.DateTimeFormat(getIntlLocale(), { hour: "numeric", hourCycle: hourCycle() }).format(
    new Date(2000, 0, 1, hour),
  );
}

/** "October 2026". */
export function formatMonthTitle(date: Date): string {
  return new Intl.DateTimeFormat(getIntlLocale(), { month: "long", year: "numeric" }).format(date);
}

/** "Oct 18 – 24, 2026", collapsing the shared month and year. */
export function formatRangeTitle(start: Date, endInclusive: Date): string {
  return new Intl.DateTimeFormat(getIntlLocale(), { month: "short", day: "numeric", year: "numeric" }).formatRange(
    start,
    endInclusive,
  );
}

/** "Thu". */
export function formatWeekdayShort(date: Date): string {
  return new Intl.DateTimeFormat(getIntlLocale(), { weekday: "short" }).format(date);
}

/** "Thu, Oct 22". */
export function formatDayLong(date: Date): string {
  return new Intl.DateTimeFormat(getIntlLocale(), { weekday: "short", month: "short", day: "numeric" }).format(date);
}

/** Day-cell label: the month name on the 1st ("Oct 1"), otherwise the day number. */
export function formatDayOfMonth(date: Date): string {
  if (date.getDate() === 1) {
    return new Intl.DateTimeFormat(getIntlLocale(), { month: "short", day: "numeric" }).format(date);
  }
  return String(date.getDate());
}
