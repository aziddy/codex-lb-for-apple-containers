import { useTranslation } from "react-i18next";

import type { AccountSummary } from "@/features/accounts/schemas";
import { EventChip } from "@/features/calendar/components/event-chip";
import { type CalendarEntry, eventColorStyle } from "@/features/calendar/entries";
import { type DateRange, dayKey, isSameDay, rangeDays } from "@/features/calendar/events";
import { formatDayLong, formatDayOfMonth, formatWeekdayShort } from "@/features/calendar/format";
import { cn } from "@/lib/utils";

const MAX_CHIPS_PER_DAY = 3;
const MAX_DOTS_PER_DAY = 4;

export type MonthGridProps = {
  range: DateRange;
  /** Any day in the displayed month; also the selected day for the phone agenda. */
  anchor: Date;
  today: Date;
  entriesByDay: Map<string, CalendarEntry[]>;
  canRedeem: boolean;
  onRedeem: (account: AccountSummary) => void;
  onSelectDay: (day: Date) => void;
  onShowMore: (day: Date) => void;
};

export function MonthGrid({
  range,
  anchor,
  today,
  entriesByDay,
  canRedeem,
  onRedeem,
  onSelectDay,
  onShowMore,
}: MonthGridProps) {
  const { t } = useTranslation();
  const days = rangeDays(range);
  const agenda = entriesByDay.get(dayKey(anchor)) ?? [];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-7 border-b">
          {days.slice(0, 7).map((day) => (
            <div
              key={day.getDay()}
              className="py-2 text-center text-[10px] font-semibold tracking-wider text-muted-foreground uppercase sm:text-[11px]"
            >
              {formatWeekdayShort(day)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border">
          {days.map((day) => {
            const key = dayKey(day);
            const entries = entriesByDay.get(key) ?? [];
            const inMonth = day.getMonth() === anchor.getMonth();
            const isToday = isSameDay(day, today);
            const isSelected = isSameDay(day, anchor);
            const muted = !inMonth || day < today;
            const hidden = entries.length - MAX_CHIPS_PER_DAY;
            return (
              <div
                key={key}
                data-testid={`calendar-day-${key}`}
                className={cn(
                  "flex min-h-13 min-w-0 flex-col gap-0.5 p-1 sm:min-h-31 sm:gap-[3px] sm:p-1.5",
                  inMonth ? "bg-card" : "bg-muted/25",
                  isSelected && "max-sm:bg-muted",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectDay(day)}
                  aria-pressed={isSelected}
                  aria-label={t("calendar.grid.dayEvents", { date: formatDayLong(day), count: entries.length })}
                  className={cn(
                    "mx-auto grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-medium whitespace-nowrap tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : muted
                        ? "text-muted-foreground hover:bg-muted"
                        : "text-foreground hover:bg-muted",
                  )}
                >
                  {formatDayOfMonth(day)}
                </button>
                <div className="hidden min-w-0 flex-col gap-[3px] sm:flex">
                  {entries.slice(0, MAX_CHIPS_PER_DAY).map((entry) => (
                    <EventChip key={entry.id} entry={entry} canRedeem={canRedeem} onRedeem={onRedeem} />
                  ))}
                  {hidden > 0 ? (
                    <button
                      type="button"
                      onClick={() => onShowMore(day)}
                      className="h-5 self-start rounded px-1.5 text-[11px] font-semibold text-foreground/80 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {t("calendar.grid.more", { count: hidden })}
                    </button>
                  ) : null}
                </div>
                <div aria-hidden="true" className="flex h-1.5 items-center justify-center gap-0.5 sm:hidden">
                  {entries.slice(0, MAX_DOTS_PER_DAY).map((entry) => (
                    <span
                      key={entry.id}
                      style={eventColorStyle(entry.colorSlot)}
                      className={cn(
                        "size-1.5 rounded-full border-[1.5px] border-(--event-color)",
                        entry.kind === "weekly" && "bg-(--event-color)",
                        entry.kind === "credit" && "rounded-[1.5px] bg-(--event-color)/15",
                      )}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <section aria-label={formatDayLong(anchor)} data-testid="calendar-day-agenda" className="space-y-2 sm:hidden">
        <h2 className="text-sm font-semibold">{formatDayLong(anchor)}</h2>
        {agenda.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            {t("calendar.agenda.empty")}
          </p>
        ) : (
          agenda.map((entry) => (
            <EventChip key={entry.id} entry={entry} variant="row" canRedeem={canRedeem} onRedeem={onRedeem} />
          ))
        )}
      </section>
    </div>
  );
}
