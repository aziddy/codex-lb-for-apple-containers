import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

import { type CalendarView, dayKey, isCalendarView, parseDayKey, startOfDay } from "@/features/calendar/events";

/** Calendar view and anchor date, carried in `?view=` and `?date=` so views are linkable. */
export function useCalendarParams(now: Date) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get("view");
  const view: CalendarView = isCalendarView(rawView) ? rawView : "month";
  const anchor = parseDayKey(searchParams.get("date")) ?? startOfDay(now);

  const navigate = useCallback(
    (next: { view?: CalendarView; anchor?: Date }) => {
      setSearchParams((previous) => {
        const params = new URLSearchParams(previous);
        if (next.view) {
          params.set("view", next.view);
        }
        if (next.anchor) {
          params.set("date", dayKey(next.anchor));
        }
        return params;
      });
    },
    [setSearchParams],
  );

  return { view, anchor, navigate };
}
