import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { isEmailLabel } from "@/components/blur-email";
import { MiniQuotaBar } from "@/components/mini-quota-bar";
import { buttonVariants } from "@/components/ui/button-variants";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import type { AccountSummary } from "@/features/accounts/schemas";
import { accountLabel, eventColorStyle } from "@/features/calendar/entries";
import { type DateRange, visibleRange } from "@/features/calendar/events";
import { useCalendarPreferencesStore } from "@/features/calendar/use-calendar-preferences";
import { usePrivacyStore } from "@/hooks/use-privacy";
import { cn } from "@/lib/utils";
import { formatQuotaResetLabel, formatSingleUnitRemaining, formatSlug, parseDate } from "@/utils/formatters";

const SECTION_CLASS = "rounded-xl border bg-card p-3.5";
const SECTION_TITLE_CLASS = "text-[11px] font-semibold tracking-wider text-muted-foreground uppercase";

export type CalendarSidebarProps = {
  accounts: AccountSummary[];
  colorSlots: Map<string, number>;
  anchor: Date;
  now: Date;
  /** Days in `range` that hold at least one visible event (mini-month dots). */
  eventDaysIn: (range: DateRange) => Date[];
  onSelectDate: (date: Date) => void;
  className?: string;
};

export function CalendarSidebar({
  accounts,
  colorSlots,
  anchor,
  now,
  eventDaysIn,
  onSelectDate,
  className,
}: CalendarSidebarProps) {
  return (
    <aside className={cn("flex min-w-0 flex-col gap-4", className)}>
      <MiniMonth
        key={`${anchor.getFullYear()}-${anchor.getMonth()}`}
        anchor={anchor}
        eventDaysIn={eventDaysIn}
        onSelectDate={onSelectDate}
      />
      <AccountFilters accounts={accounts} colorSlots={colorSlots} />
      <ComingUp accounts={accounts} now={now} />
    </aside>
  );
}

function MiniMonth({
  anchor,
  eventDaysIn,
  onSelectDate,
}: Pick<CalendarSidebarProps, "anchor" | "eventDaysIn" | "onSelectDate">) {
  const [month, setMonth] = useState(() => new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const eventDays = useMemo(() => eventDaysIn(visibleRange("month", month)), [eventDaysIn, month]);
  return (
    <section className={cn(SECTION_CLASS, "flex justify-center")}>
      <Calendar
        mode="single"
        required
        selected={anchor}
        onSelect={onSelectDate}
        month={month}
        onMonthChange={setMonth}
        modifiers={{ hasEvents: eventDays }}
        modifiersClassNames={{ hasEvents: "calendar-has-events" }}
        className="p-0"
        classNames={{
          month: "flex flex-col gap-3",
          button_previous: buttonVariants({ variant: "ghost", size: "icon-sm" }),
          button_next: buttonVariants({ variant: "ghost", size: "icon-sm" }),
          weekday: "w-8 text-[0.7rem] font-medium text-muted-foreground",
          week: "mt-1 flex w-full",
          day_button: cn(buttonVariants({ variant: "ghost" }), "size-8 p-0 text-xs font-normal tabular-nums"),
        }}
      />
    </section>
  );
}

function AccountFilters({ accounts, colorSlots }: Pick<CalendarSidebarProps, "accounts" | "colorSlots">) {
  const { t } = useTranslation();
  const blurred = usePrivacyStore((state) => state.blurred);
  const hiddenAccountIds = useCalendarPreferencesStore((state) => state.hiddenAccountIds);
  const showWeekly = useCalendarPreferencesStore((state) => state.showWeekly);
  const showEstimated = useCalendarPreferencesStore((state) => state.showEstimated);
  const showCredits = useCalendarPreferencesStore((state) => state.showCredits);
  const toggleAccount = useCalendarPreferencesStore((state) => state.toggleAccount);
  const setShowWeekly = useCalendarPreferencesStore((state) => state.setShowWeekly);
  const setShowEstimated = useCalendarPreferencesStore((state) => state.setShowEstimated);
  const setShowCredits = useCalendarPreferencesStore((state) => state.setShowCredits);
  const visibleCount = accounts.filter((account) => !hiddenAccountIds.includes(account.accountId)).length;
  const weeklyLabel = t("accounts.usage.remainingLabel", { label: t("common.quota.weekly") });

  return (
    <section aria-labelledby="calendar-accounts-heading" className={cn(SECTION_CLASS, "space-y-1")}>
      <div className="flex items-center justify-between px-1 pb-1.5">
        <h2 id="calendar-accounts-heading" className={SECTION_TITLE_CLASS}>
          {t("calendar.sidebar.accounts")}
        </h2>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {t("calendar.sidebar.visibleCount", { visible: visibleCount, total: accounts.length })}
        </span>
      </div>
      {accounts.length === 0 ? (
        <p className="px-1 pb-1 text-xs text-muted-foreground">{t("calendar.sidebar.noAccounts")}</p>
      ) : (
        <ul className="space-y-0.5">
          {accounts.map((account) => {
            const label = accountLabel(account);
            const percent = account.usage?.secondaryRemainingPercent ?? null;
            const credits = account.availableResetCredits ?? 0;
            return (
              <li key={account.accountId} style={eventColorStyle(colorSlots.get(account.accountId) ?? 1)}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-2 transition-colors hover:bg-muted/40">
                  <Checkbox
                    checked={!hiddenAccountIds.includes(account.accountId)}
                    onCheckedChange={() => toggleAccount(account.accountId)}
                    className="mt-px data-[state=checked]:border-(--event-color) data-[state=checked]:bg-(--event-color) data-[state=checked]:text-(--calendar-event-foreground) dark:data-[state=checked]:bg-(--event-color)"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span aria-hidden="true" className="size-2 shrink-0 rounded-[2px] bg-(--event-color)" />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-xs font-medium",
                          blurred && isEmailLabel(label, account.email) && "privacy-blur",
                        )}
                      >
                        {label}
                      </span>
                      <span className="shrink-0 rounded-full border px-1.5 text-[10px] leading-4 text-muted-foreground">
                        {formatSlug(account.planType)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <MiniQuotaBar
                        percent={percent}
                        testId={`calendar-account-quota-${account.accountId}`}
                        aria-label={weeklyLabel}
                      />
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {percent === null ? "--" : `${percent}%`}
                      </span>
                    </span>
                    <span className="flex justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>{t("calendar.sidebar.weeklyReset", { label: formatQuotaResetLabel(account.resetAtSecondary) })}</span>
                      <span className="tabular-nums">
                        {credits > 0 ? t("calendar.sidebar.credits", { count: credits }) : t("calendar.sidebar.noCredits")}
                      </span>
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="my-2 h-px bg-border" />

      <h2 className={cn(SECTION_TITLE_CLASS, "px-1 pb-1.5")}>{t("calendar.sidebar.show")}</h2>
      <EventTypeToggle checked={showWeekly} onCheckedChange={setShowWeekly} label={t("calendar.sidebar.showWeekly")}>
        <span className="h-3 w-5.5 rounded-[3px] bg-foreground/80" />
      </EventTypeToggle>
      <EventTypeToggle
        checked={showWeekly && showEstimated}
        disabled={!showWeekly}
        onCheckedChange={setShowEstimated}
        label={t("calendar.sidebar.showEstimated")}
      >
        <span className="h-3 w-5.5 rounded-[3px] border border-dashed border-foreground/80" />
      </EventTypeToggle>
      <EventTypeToggle checked={showCredits} onCheckedChange={setShowCredits} label={t("calendar.sidebar.showCredits")}>
        <span className="h-3 w-5.5 rounded-[3px] border border-foreground/50 bg-foreground/15" />
      </EventTypeToggle>
    </section>
  );
}

function EventTypeToggle({
  checked,
  disabled = false,
  onCheckedChange,
  label,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-xs transition-colors hover:bg-muted/40",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <span aria-hidden="true" className="flex">
        {children}
      </span>
      <span>{label}</span>
    </label>
  );
}

function ComingUp({ accounts, now }: Pick<CalendarSidebarProps, "accounts" | "now">) {
  const { t } = useTranslation();
  const blurred = usePrivacyStore((state) => state.blurred);
  const hiddenAccountIds = useCalendarPreferencesStore((state) => state.hiddenAccountIds);
  const visible = accounts.filter((account) => !hiddenAccountIds.includes(account.accountId));
  const soonest = (pick: (account: AccountSummary) => string | null | undefined) =>
    visible
      .map((account) => ({ account, at: parseDate(pick(account)) }))
      .filter((item): item is { account: AccountSummary; at: Date } => item.at !== null && item.at > now)
      .sort((a, b) => a.at.getTime() - b.at.getTime())[0] ?? null;
  const nextReset = soonest((account) => account.resetAtSecondary);
  const nextCredit = soonest((account) => account.resetCreditNearestExpiresAt);
  const nextCreditCountdown = nextCredit ? formatSingleUnitRemaining(nextCredit.at.toISOString()) : null;
  const creditAccounts = visible.filter((account) => (account.availableResetCredits ?? 0) > 0);
  const totalCredits = creditAccounts.reduce((total, account) => total + (account.availableResetCredits ?? 0), 0);
  const name = (account: AccountSummary) => {
    const label = accountLabel(account);
    return <span className={blurred && isEmailLabel(label, account.email) ? "privacy-blur" : undefined}>{label}</span>;
  };

  return (
    <section aria-labelledby="calendar-coming-up-heading" className={cn(SECTION_CLASS, "space-y-2.5 px-4")}>
      <h2 id="calendar-coming-up-heading" className={SECTION_TITLE_CLASS}>
        {t("calendar.sidebar.comingUp")}
      </h2>
      <dl className="space-y-2 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-muted-foreground">{t("calendar.sidebar.nextReset")}</dt>
          <dd className="min-w-0 truncate text-right">
            {nextReset ? (
              <>
                {name(nextReset.account)}{" "}
                <span className="text-muted-foreground">{formatQuotaResetLabel(nextReset.at.toISOString())}</span>
              </>
            ) : (
              <span className="text-muted-foreground">--</span>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-muted-foreground">{t("calendar.sidebar.nextCredit")}</dt>
          <dd className="min-w-0 truncate text-right">
            {nextCredit && nextCreditCountdown ? (
              <>
                {name(nextCredit.account)}{" "}
                <span className={nextCreditCountdown.expiringSoon ? "text-destructive" : "text-muted-foreground"}>
                  {nextCreditCountdown.label}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">--</span>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-muted-foreground">{t("calendar.sidebar.banked")}</dt>
          <dd className="text-right tabular-nums">
            {totalCredits > 0
              ? `${totalCredits} ${t("calendar.sidebar.bankedAccounts", { count: creditAccounts.length })}`
              : "--"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
