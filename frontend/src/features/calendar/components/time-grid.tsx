import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import type { AccountSummary } from "@/features/accounts/schemas";
import { EventChip } from "@/features/calendar/components/event-chip";
import type { CalendarEntry } from "@/features/calendar/entries";
import { type DateRange, dayKey, isSameDay, layoutTimedEvents, rangeDays } from "@/features/calendar/events";
import { formatDayOfMonth, formatHourLabel, formatWeekdayShort } from "@/features/calendar/format";
import { cn } from "@/lib/utils";

const HOUR_HEIGHT_PX = 32;
const CHIP_HEIGHT_PX = 22;
const GRID_HEIGHT_PX = 24 * HOUR_HEIGHT_PX;
const HOURS = Array.from({ length: 23 }, (_, index) => index + 1);
const HOUR_LINES: CSSProperties = {
  height: GRID_HEIGHT_PX,
  backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0, var(--border) 1px, transparent 1px, transparent ${HOUR_HEIGHT_PX}px)`,
};

// Static class strings so Tailwind generates both column templates.
const COLUMN_TEMPLATES = {
  7: "grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] min-w-[47rem]",
  14: "grid-cols-[3.5rem_repeat(14,minmax(0,1fr))] min-w-[66rem]",
} as const;

export type TimeGridProps = {
  days: 7 | 14;
  range: DateRange;
  now: Date;
  today: Date;
  entriesByDay: Map<string, CalendarEntry[]>;
  canRedeem: boolean;
  onRedeem: (account: AccountSummary) => void;
};

export function TimeGrid({ days, range, now, today, entriesByDay, canRedeem, onRedeem }: TimeGridProps) {
  const { t } = useTranslation();
  const columns = rangeDays(range);
  const template = COLUMN_TEMPLATES[days];
  const nowTop = Math.round((now.getHours() + now.getMinutes() / 60) * HOUR_HEIGHT_PX);

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <div className={cn("grid border-b", template)}>
        <div className="flex items-end justify-end pr-2 pb-2 text-[10px] text-muted-foreground">
          {t("calendar.grid.localTime")}
        </div>
        {columns.map((day, index) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={dayKey(day)}
              className={cn(
                "flex flex-col items-center gap-1 border-l py-2",
                days === 14 && index === 7 && "border-l-foreground/25",
              )}
            >
              <span
                className={cn(
                  "text-[10px] font-semibold tracking-wider uppercase",
                  isToday ? "text-primary" : "text-muted-foreground",
                )}
              >
                {formatWeekdayShort(day)}
              </span>
              <span
                aria-current={isToday ? "date" : undefined}
                className={cn(
                  "grid h-8 min-w-8 place-items-center rounded-full px-1 text-base tabular-nums",
                  isToday
                    ? "bg-primary font-semibold text-primary-foreground"
                    : day < today
                      ? "text-muted-foreground"
                      : "text-foreground",
                )}
              >
                {formatDayOfMonth(day)}
              </span>
            </div>
          );
        })}
      </div>

      <div className={cn("grid", template)}>
        <div className="relative" style={{ height: GRID_HEIGHT_PX }}>
          {HOURS.map((hour) => (
            <span
              key={hour}
              className="absolute right-2 text-[10px] whitespace-nowrap text-muted-foreground tabular-nums"
              style={{ top: hour * HOUR_HEIGHT_PX - 6 }}
            >
              {formatHourLabel(hour)}
            </span>
          ))}
        </div>
        {columns.map((day, index) => {
          const key = dayKey(day);
          const isToday = isSameDay(day, today);
          const placed = layoutTimedEvents(entriesByDay.get(key) ?? [], HOUR_HEIGHT_PX, CHIP_HEIGHT_PX);
          return (
            <div
              key={key}
              data-testid={`calendar-column-${key}`}
              className={cn(
                "relative border-l",
                day < today && "bg-muted/20",
                days === 14 && index === 7 && "border-l-foreground/25",
              )}
              style={HOUR_LINES}
            >
              {placed.map(({ item, top, left, width }) => (
                <EventChip
                  key={item.id}
                  entry={item}
                  compact={days === 14}
                  canRedeem={canRedeem}
                  onRedeem={onRedeem}
                  className="absolute z-1 h-5.5"
                  style={{ top, left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)` }}
                />
              ))}
              {isToday ? (
                <div
                  aria-hidden="true"
                  data-testid="calendar-now-line"
                  className="pointer-events-none absolute inset-x-0 z-2 h-0.5 bg-primary"
                  style={{ top: nowTop }}
                >
                  <span className="absolute -top-1 -left-1.25 size-2.5 rounded-full bg-primary" />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
