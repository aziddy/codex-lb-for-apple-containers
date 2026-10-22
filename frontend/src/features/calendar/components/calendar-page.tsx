import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { AlertMessage } from "@/components/alert-message";
import { Button } from "@/components/ui/button";
import { ResetCreditConfirmDialog } from "@/features/accounts/components/reset-credit-confirm-dialog";
import type { AccountSummary } from "@/features/accounts/schemas";
import { usePermission } from "@/features/auth/hooks/use-auth";
import { CalendarSidebar } from "@/features/calendar/components/calendar-sidebar";
import type { CalendarEntry } from "@/features/calendar/entries";
import { MonthGrid } from "@/features/calendar/components/month-grid";
import { ScheduleView } from "@/features/calendar/components/schedule-view";
import { TimeGrid } from "@/features/calendar/components/time-grid";
import {
  CALENDAR_VIEWS,
  type CalendarView,
  type DateRange,
  accountColorSlots,
  addDays,
  buildCreditExpiryEvents,
  buildWeeklyResetEvents,
  dayKey,
  groupByDay,
  parseDayKey,
  startOfDay,
  stepAnchor,
  visibleRange,
} from "@/features/calendar/events";
import { formatMonthTitle, formatRangeTitle } from "@/features/calendar/format";
import { useCalendarData, useNow } from "@/features/calendar/use-calendar-data";
import { useCalendarParams } from "@/features/calendar/use-calendar-params";
import { useCalendarPreferencesStore } from "@/features/calendar/use-calendar-preferences";
import { useDialogState } from "@/hooks/use-dialog-state";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/utils/errors";

type RedeemTarget = { accountId: string; availableResetCredits: number };

export function CalendarPage() {
  const { t } = useTranslation();
  const now = useNow();
  const today = startOfDay(now);
  const { view, anchor, navigate } = useCalendarParams(now);
  const { accountsQuery, accounts, snapshots, isLoading } = useCalendarData();
  const hiddenAccountIds = useCalendarPreferencesStore((state) => state.hiddenAccountIds);
  const showWeekly = useCalendarPreferencesStore((state) => state.showWeekly);
  const showEstimated = useCalendarPreferencesStore((state) => state.showEstimated);
  const showCredits = useCalendarPreferencesStore((state) => state.showCredits);
  const canWriteAccounts = usePermission("accounts:write");
  const redeemDialog = useDialogState<RedeemTarget>();

  const colorSlots = useMemo(() => accountColorSlots(accounts), [accounts]);
  const buildEntries = useCallback(
    (range: DateRange): CalendarEntry[] => {
      const visible = accounts.filter((account) => !hiddenAccountIds.includes(account.accountId));
      const visibleIds = new Set(visible.map((account) => account.accountId));
      const accountById = new Map(visible.map((account) => [account.accountId, account]));
      const events = [
        ...(showWeekly ? buildWeeklyResetEvents(visible, range, { includeEstimated: showEstimated }) : []),
        ...(showCredits
          ? buildCreditExpiryEvents(
              snapshots.filter((entry) => visibleIds.has(entry.accountId)),
              range,
            )
          : []),
      ];
      return events.flatMap((event) => {
        const account = accountById.get(event.accountId);
        return account ? [{ ...event, account, colorSlot: colorSlots.get(event.accountId) ?? 1 }] : [];
      });
    },
    [accounts, colorSlots, hiddenAccountIds, showCredits, showEstimated, showWeekly, snapshots],
  );
  const eventDaysIn = useCallback(
    (range: DateRange) =>
      [...groupByDay(buildEntries(range)).keys()].flatMap((key) => {
        const day = parseDayKey(key);
        return day ? [day] : [];
      }),
    [buildEntries],
  );

  const anchorKey = dayKey(anchor);
  // Keyed on the day string: `anchor` is a fresh Date on every render.
  const range = useMemo(() => visibleRange(view, parseDayKey(anchorKey) ?? new Date()), [view, anchorKey]);
  const entriesByDay = useMemo(() => groupByDay(buildEntries(range)), [buildEntries, range]);
  const title = view === "month" ? formatMonthTitle(anchor) : formatRangeTitle(range.start, addDays(range.end, -1));

  const handleRedeem = (account: AccountSummary) =>
    redeemDialog.show({ accountId: account.accountId, availableResetCredits: account.availableResetCredits ?? 0 });
  const selectDay = (day: Date) => navigate({ anchor: day });

  return (
    <div className="animate-fade-in-up space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("calendar.page.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("calendar.page.subtitle")}</p>
      </div>

      {accountsQuery.error ? (
        <AlertMessage variant="error">{getErrorMessage(accountsQuery.error, t("calendar.page.loadFailed"))}</AlertMessage>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <section aria-label={t("calendar.page.title")} className="order-1 min-w-0 space-y-3 lg:order-2">
          <CalendarToolbar
            view={view}
            title={title}
            onToday={() => navigate({ anchor: today })}
            onStep={(direction) => navigate({ anchor: stepAnchor(view, anchor, direction) })}
            onViewChange={(nextView) => navigate({ view: nextView })}
          />
          {view === "month" ? (
            <MonthGrid
              range={range}
              anchor={anchor}
              today={today}
              entriesByDay={entriesByDay}
              canRedeem={canWriteAccounts}
              onRedeem={handleRedeem}
              onSelectDay={selectDay}
              onShowMore={(day) => navigate({ view: "7d", anchor: day })}
            />
          ) : view === "schedule" ? (
            <ScheduleView
              range={range}
              today={today}
              entriesByDay={entriesByDay}
              isLoading={isLoading}
              canRedeem={canWriteAccounts}
              onRedeem={handleRedeem}
            />
          ) : (
            <TimeGrid
              days={view === "7d" ? 7 : 14}
              range={range}
              now={now}
              today={today}
              entriesByDay={entriesByDay}
              canRedeem={canWriteAccounts}
              onRedeem={handleRedeem}
            />
          )}
        </section>
        <CalendarSidebar
          className="order-2 lg:order-1"
          accounts={accounts}
          colorSlots={colorSlots}
          anchor={anchor}
          now={now}
          eventDaysIn={eventDaysIn}
          onSelectDate={selectDay}
        />
      </div>

      {redeemDialog.data ? (
        <ResetCreditConfirmDialog
          open={redeemDialog.open}
          accountId={redeemDialog.data.accountId}
          summaryAvailableCount={redeemDialog.data.availableResetCredits}
          onOpenChange={redeemDialog.onOpenChange}
        />
      ) : null}
    </div>
  );
}

function CalendarToolbar({
  view,
  title,
  onToday,
  onStep,
  onViewChange,
}: {
  view: CalendarView;
  title: string;
  onToday: () => void;
  onStep: (direction: 1 | -1) => void;
  onViewChange: (view: CalendarView) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onToday}>
          {t("calendar.toolbar.today")}
        </Button>
        <div className="flex">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t(`calendar.toolbar.previous.${view}`)}
            onClick={() => onStep(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t(`calendar.toolbar.next.${view}`)}
            onClick={() => onStep(1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <h2 aria-live="polite" className="ml-1 truncate text-lg font-semibold tracking-tight">
          {title}
        </h2>
      </div>
      <div
        role="group"
        aria-label={t("calendar.view.label")}
        className="flex items-center rounded-lg border border-border/50 bg-muted/40 p-0.5"
      >
        {CALENDAR_VIEWS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            onClick={() => onViewChange(option)}
            className={cn(
              "inline-flex h-7 items-center rounded-md px-3.5 text-xs leading-none font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              view === option
                ? "bg-background text-foreground shadow-[var(--shadow-xs)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`calendar.view.${option}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
