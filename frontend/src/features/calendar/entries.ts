import type { CSSProperties } from "react";

import type { AccountSummary } from "@/features/accounts/schemas";
import type { CalendarEvent } from "@/features/calendar/events";

/** A calendar event joined with its account and colour slot, ready to render. */
export type CalendarEntry = CalendarEvent & { account: AccountSummary; colorSlot: number };

/** Exposes an account's colour slot to Tailwind as `--event-color`. */
export function eventColorStyle(colorSlot: number): CSSProperties {
  return { "--event-color": `var(--calendar-${colorSlot})` } as CSSProperties;
}

export function accountLabel(account: AccountSummary): string {
  return account.displayName || account.email;
}
