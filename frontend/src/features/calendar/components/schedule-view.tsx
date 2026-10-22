import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import type { AccountSummary } from "@/features/accounts/schemas";
import { EventChip } from "@/features/calendar/components/event-chip";
import type { CalendarEntry } from "@/features/calendar/entries";
import { type DateRange, dayKey, isSameDay, rangeDays } from "@/features/calendar/events";
import { formatDayLong, formatMonthTitle, formatWeekdayShort } from "@/features/calendar/format";
import { cn } from "@/lib/utils";

type ScheduleViewProps = {
  range: DateRange;
  today: Date;
  entriesByDay: Map<string, CalendarEntry[]>;
  isLoading: boolean;
  canRedeem: boolean;
  onRedeem: (account: AccountSummary) => void;
};

export function ScheduleView({ range, today, entriesByDay, isLoading, canRedeem, onRedeem }: ScheduleViewProps) {
  const { t } = useTranslation();
  const days = rangeDays(range).filter((day) => entriesByDay.has(dayKey(day)) || isSameDay(day, today));
  const empty = entriesByDay.size === 0;

  return (
    <section
      aria-label={t("calendar.view.schedule")}
      aria-busy={isLoading}
      className="min-w-0 rounded-xl border bg-card p-3 sm:p-5"
    >
      {isLoading ? (
        <p role="status" className="py-12 text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : days.length === 0 ? (
        <p role="status" className="py-12 text-center text-sm text-muted-foreground">
          {t("calendar.schedule.empty")}
        </p>
      ) : (
        days.map((day, index) => {
          const key = dayKey(day);
          const entries = entriesByDay.get(key) ?? [];
          const isToday = isSameDay(day, today);
          const startsMonth = index === 0 || day.getMonth() !== days[index - 1].getMonth();
          return (
            <Fragment key={key}>
              {startsMonth ? (
                <h3 className={cn("border-b pb-3 text-sm font-semibold tracking-tight", index > 0 && "mt-6")}>
                  {formatMonthTitle(day)}
                </h3>
              ) : null}
              <section
                aria-label={formatDayLong(day)}
                className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 py-4 sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-5"
              >
                <h4 className={cn("flex flex-col items-center gap-1 pt-1", isToday ? "text-primary" : "text-muted-foreground")}>
                  <span className="text-[10px] font-semibold tracking-wider uppercase">{formatWeekdayShort(day)}</span>
                  <time
                    dateTime={key}
                    aria-current={isToday ? "date" : undefined}
                    className={cn(
                      "grid size-10 place-items-center rounded-full text-2xl tabular-nums",
                      isToday ? "bg-primary font-medium text-primary-foreground" : "font-normal",
                    )}
                  >
                    {day.getDate()}
                  </time>
                </h4>
                <div className="min-w-0 space-y-2">
                  {entries.length === 0 ? (
                    <p role="status" className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                      {t(empty ? "calendar.schedule.empty" : "calendar.agenda.empty")}
                    </p>
                  ) : (
                    entries.map((entry) => (
                      <EventChip key={entry.id} entry={entry} variant="schedule" canRedeem={canRedeem} onRedeem={onRedeem} />
                    ))
                  )}
                </div>
              </section>
            </Fragment>
          );
        })
      )}
    </section>
  );
}
