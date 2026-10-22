import { Clock, ExternalLink, RotateCcw, Ticket } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { isEmailLabel } from "@/components/blur-email";
import { MiniQuotaBar } from "@/components/mini-quota-bar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AccountSummary } from "@/features/accounts/schemas";
import { type CalendarEntry, accountLabel, eventColorStyle } from "@/features/calendar/entries";
import { formatDayLong, formatEventTime } from "@/features/calendar/format";
import { useDateDisplayFormatStore } from "@/hooks/use-date-format";
import { usePrivacyStore } from "@/hooks/use-privacy";
import { useTimeFormatStore } from "@/hooks/use-time-format";
import { cn } from "@/lib/utils";
import {
  formatDateTimeInline,
  formatQuotaResetLabel,
  formatSingleUnitRemaining,
  formatSlug,
  parseDate,
} from "@/utils/formatters";

const CHIP_KIND_CLASSES = {
  weekly: "border-(--event-color) bg-(--event-color) text-(--calendar-event-foreground)",
  estimated: "border-dashed border-(--event-color) bg-card text-(--event-color)",
  credit: "border-(--event-color)/60 bg-[color-mix(in_oklch,var(--event-color)_16%,var(--card))] text-foreground",
} as const;

const ROW_ICON_CLASSES = {
  weekly: "bg-(--event-color) text-(--calendar-event-foreground)",
  estimated: "border border-dashed border-(--event-color) text-(--event-color)",
  credit: "border border-(--event-color)/60 bg-(--event-color)/15 text-(--event-color)",
} as const;

function EventIcon({ entry, className }: { entry: CalendarEntry; className?: string }) {
  if (entry.kind === "credit") {
    return (
      <Ticket
        aria-hidden="true"
        className={cn("shrink-0 text-(--event-color)", entry.redeemsNext && "fill-(--event-color)/25", className)}
      />
    );
  }
  return <RotateCcw aria-hidden="true" className={cn("shrink-0", className)} />;
}

function useEntryLabels(entry: CalendarEntry) {
  const { t } = useTranslation();
  useTimeFormatStore((state) => state.timeFormat);
  const blurred = usePrivacyStore((state) => state.blurred);
  const label = accountLabel(entry.account);
  const time = formatEventTime(entry.at);
  const kindLabel = t(`calendar.event.${entry.kind}`);
  return {
    label,
    labelClassName: blurred && isEmailLabel(label, entry.account.email) ? "privacy-blur" : undefined,
    time,
    kindLabel,
    ariaLabel: `${kindLabel}, ${label}, ${formatDayLong(entry.at)} ${time}`,
    countdown: entry.kind === "credit" ? formatSingleUnitRemaining(entry.at.toISOString()) : null,
  };
}

export type EventChipProps = {
  entry: CalendarEntry;
  /** Compact grid chip, neutral day-agenda row, or colored Schedule card. */
  variant?: "chip" | "row" | "schedule";
  /** Narrow columns (14-day grid): icon and time only; the label stays in the accessible name and popover. */
  compact?: boolean;
  canRedeem: boolean;
  onRedeem: (account: AccountSummary) => void;
  className?: string;
  style?: CSSProperties;
};

export function EventChip({
  entry,
  variant = "chip",
  compact = false,
  canRedeem,
  onRedeem,
  className,
  style,
}: EventChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { label, labelClassName, time, kindLabel, ariaLabel, countdown } = useEntryLabels(entry);
  const renderCountdown = (sizeClassName: string) =>
    countdown ? (
      <span
        className={cn(
          "ml-auto shrink-0 font-semibold tabular-nums",
          sizeClassName,
          countdown.expiringSoon ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {countdown.label}
      </span>
    ) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "schedule" ? (
          <button
            type="button"
            aria-label={ariaLabel}
            data-kind={entry.kind}
            style={{ ...eventColorStyle(entry.colorSlot), ...style }}
            className={cn(
              "flex min-h-20 w-full min-w-0 flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none sm:px-4",
              CHIP_KIND_CLASSES[entry.kind],
              className,
            )}
          >
            <span className="flex w-full min-w-0 items-center gap-2 text-sm font-semibold">
              <EventIcon entry={entry} className="size-4 text-current" />
              <span>{kindLabel}</span>
              {renderCountdown("text-xs")}
            </span>
            <span className="text-sm tabular-nums">{time}</span>
            <span className={cn("w-full truncate text-xs opacity-80", labelClassName)}>{label}</span>
          </button>
        ) : variant === "row" ? (
          <button
            type="button"
            aria-label={ariaLabel}
            data-kind={entry.kind}
            style={{ ...eventColorStyle(entry.colorSlot), ...style }}
            className={cn(
              "flex min-h-13 w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              className,
            )}
          >
            <span className={cn("grid size-7.5 shrink-0 place-items-center rounded-md", ROW_ICON_CLASSES[entry.kind])}>
              <EventIcon entry={entry} className="size-3.5 text-current" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13px] font-medium">{kindLabel}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                <span className={labelClassName}>{label}</span> · {time}
              </span>
            </span>
            {renderCountdown("text-xs")}
          </button>
        ) : (
          <button
            type="button"
            aria-label={ariaLabel}
            data-kind={entry.kind}
            style={{ ...eventColorStyle(entry.colorSlot), ...style }}
            className={cn(
              "flex h-5 w-full min-w-0 items-center overflow-hidden rounded border text-left text-[11px] leading-none whitespace-nowrap transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              compact ? "gap-0.5 px-1" : "gap-1 px-1.5",
              CHIP_KIND_CLASSES[entry.kind],
              className,
            )}
          >
            <EventIcon entry={entry} className={compact ? "size-2.5" : "size-3"} />
            <span className={cn("font-semibold tabular-nums", compact ? "min-w-0 truncate" : "shrink-0")}>{time}</span>
            {compact ? null : (
              <>
                <span className={cn("min-w-0 truncate font-medium", labelClassName)}>{label}</span>
                {entry.kind === "estimated" ? (
                  <span className="ml-auto shrink-0 text-[10px]">{t("calendar.event.estimatedShort")}</span>
                ) : null}
                {renderCountdown("text-[10px]")}
              </>
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80" style={eventColorStyle(entry.colorSlot)}>
        <EventDetails
          entry={entry}
          canRedeem={canRedeem}
          onRedeem={() => {
            setOpen(false);
            onRedeem(entry.account);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function EventDetails({
  entry,
  canRedeem,
  onRedeem,
}: {
  entry: CalendarEntry;
  canRedeem: boolean;
  onRedeem: () => void;
}) {
  const { t } = useTranslation();
  const dateDisplayFormat = useDateDisplayFormatStore((state) => state.dateDisplayFormat);
  const { label, labelClassName, time, kindLabel, countdown } = useEntryLabels(entry);
  const { account } = entry;
  const weeklyPercent = account.usage?.secondaryRemainingPercent ?? null;
  const knownReset = parseDate(account.resetAtSecondary);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            "mt-1 size-3 shrink-0 rounded-[3px] border border-(--event-color)",
            entry.kind === "weekly" && "bg-(--event-color)",
            entry.kind === "estimated" && "border-dashed",
            entry.kind === "credit" && "bg-(--event-color)/15",
          )}
        />
        <div className="min-w-0">
          <p className="text-sm leading-5 font-semibold">{kindLabel}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {entry.kind === "credit"
              ? formatDateTimeInline(entry.at.toISOString(), dateDisplayFormat)
              : `${formatDayLong(entry.at)} · ${time}`}
            {countdown ? (
              <span className={cn("ml-1 tabular-nums", countdown.expiringSoon ? "text-destructive" : "text-foreground")}>
                ({countdown.label})
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", labelClassName)}>{label}</span>
        <span className="shrink-0 rounded-full border px-1.5 text-[10px] leading-4 text-muted-foreground">
          {formatSlug(account.planType)}
        </span>
      </div>

      {entry.kind === "weekly" ? (
        <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {t("accounts.usage.remainingLabel", { label: t("common.quota.weekly") })}
            </span>
            <span className="font-medium tabular-nums">{weeklyPercent === null ? "--" : `${weeklyPercent}%`}</span>
          </div>
          <div className="flex">
            <MiniQuotaBar
              percent={weeklyPercent}
              testId="calendar-weekly-quota"
              aria-label={t("accounts.usage.remainingLabel", { label: t("common.quota.weekly") })}
            />
          </div>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="size-3 shrink-0" aria-hidden="true" />
            {t("accounts.usage.resetAt", { label: formatQuotaResetLabel(account.resetAtSecondary) })}
          </p>
        </div>
      ) : null}

      {entry.kind === "estimated" && knownReset ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("calendar.details.estimatedNote", { date: `${formatDayLong(knownReset)} ${formatEventTime(knownReset)}` })}
        </p>
      ) : null}

      {entry.kind === "credit" ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("calendar.details.creditsAvailable", { count: account.availableResetCredits ?? 0 })}{" "}
          {entry.redeemsNext ? t("calendar.details.redeemsNext") : t("calendar.details.redeemsLater")}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to={`/accounts?selected=${encodeURIComponent(account.accountId)}`}>
            <ExternalLink aria-hidden="true" />
            {t("calendar.details.openAccount")}
          </Link>
        </Button>
        {entry.kind === "credit" && canRedeem ? (
          <Button size="sm" onClick={onRedeem}>
            {t("accounts.resetCreditDialog.confirm")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
