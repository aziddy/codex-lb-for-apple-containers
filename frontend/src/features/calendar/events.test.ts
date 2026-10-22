import { describe, expect, it } from "vitest";

import type { RateLimitResetCreditsSnapshot } from "@/features/accounts/schemas";
import {
  accountColorSlots,
  buildCreditExpiryEvents,
  buildWeeklyResetEvents,
  dayKey,
  groupByDay,
  isCalendarView,
  layoutTimedEvents,
  parseDayKey,
  rangeDays,
  stepAnchor,
  visibleRange,
} from "@/features/calendar/events";
import { createAccountSummary } from "@/test/mocks/factories";

const WEEK_MS = 7 * 24 * 60 * 60_000;

function local(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

function rangeKeys(range: { start: Date; end: Date }) {
  return [dayKey(range.start), dayKey(range.end)];
}

function snapshot(credits: RateLimitResetCreditsSnapshot["credits"]): RateLimitResetCreditsSnapshot {
  return { availableCount: credits.length, nearestExpiresAt: null, credits };
}

describe("calendar ranges", () => {
  it("covers every week of the anchor month, starting on Sunday", () => {
    expect(rangeKeys(visibleRange("month", local(2026, 10, 15)))).toEqual(["2026-09-27", "2026-11-01"]);
    // November 2026 starts on a Sunday and spills into December.
    expect(rangeKeys(visibleRange("month", local(2026, 11, 20)))).toEqual(["2026-11-01", "2026-12-06"]);
  });

  it("starts 7- and 14-day views on the Sunday on or before the anchor", () => {
    expect(rangeKeys(visibleRange("7d", local(2026, 10, 21)))).toEqual(["2026-10-18", "2026-10-25"]);
    expect(rangeKeys(visibleRange("7d", local(2026, 10, 18)))).toEqual(["2026-10-18", "2026-10-25"]);
    expect(rangeKeys(visibleRange("14d", local(2026, 10, 15)))).toEqual(["2026-10-11", "2026-10-25"]);
  });

  it("steps the anchor by a month, 14 days, or 7 days", () => {
    expect(dayKey(stepAnchor("month", local(2026, 10, 15), 1))).toBe("2026-11-01");
    expect(dayKey(stepAnchor("month", local(2026, 1, 31), -1))).toBe("2025-12-01");
    const next14 = stepAnchor("14d", local(2026, 10, 15), 1);
    expect(dayKey(next14)).toBe("2026-10-29");
    expect(rangeKeys(visibleRange("14d", next14))).toEqual(["2026-10-25", "2026-11-08"]);
    expect(dayKey(stepAnchor("7d", local(2026, 10, 15), -1))).toBe("2026-10-08");
  });

  it.each([
    [local(2026, 10, 22, 16), "2026-10-22", "2026-11-21"],
    [local(2026, 12, 20), "2026-12-20", "2027-01-19"],
    [local(2028, 2, 1), "2028-02-01", "2028-03-02"],
    [local(2026, 3, 1), "2026-03-01", "2026-03-31"],
  ])("covers exactly 30 local dates from a Schedule anchor %s", (anchor, start, end) => {
    const range = visibleRange("schedule", anchor);
    expect(rangeKeys(range)).toEqual([start, end]);
    expect(rangeDays(range)).toHaveLength(30);
    expect(rangeDays(range).every((day) => day.getHours() === 0)).toBe(true);
    const next = stepAnchor("schedule", anchor, 1);
    expect(dayKey(next)).toBe(end);
    expect(dayKey(stepAnchor("schedule", next, -1))).toBe(start);
  });

  it("parses only real YYYY-MM-DD dates and known views", () => {
    expect(parseDayKey("2026-10-22")?.getDate()).toBe(22);
    expect(parseDayKey("2026-02-31")).toBeNull();
    expect(parseDayKey("not-a-date")).toBeNull();
    expect(parseDayKey(null)).toBeNull();
    expect(isCalendarView("14d")).toBe(true);
    expect(isCalendarView("schedule")).toBe(true);
    expect(isCalendarView("year")).toBe(false);
  });
});

describe("buildWeeklyResetEvents", () => {
  const account = createAccountSummary({
    accountId: "acc_a",
    resetAtSecondary: local(2026, 10, 22, 9, 0).toISOString(),
    windowMinutesSecondary: 10_080,
  });

  it("marks the known reset and projects estimated weeks after it", () => {
    const events = buildWeeklyResetEvents([account], visibleRange("month", local(2026, 10, 1)), {
      includeEstimated: true,
    });
    expect(events.map((event) => [dayKey(event.at), event.kind])).toEqual([
      ["2026-10-22", "weekly"],
      ["2026-10-29", "estimated"],
    ]);
  });

  it("projects on absolute instants, a full window apart", () => {
    const events = buildWeeklyResetEvents([account], visibleRange("month", local(2026, 11, 1)), {
      includeEstimated: true,
    });
    expect(events).toHaveLength(5);
    expect(events.every((event) => event.kind === "estimated")).toBe(true);
    events.forEach((event, index) => {
      expect(event.at.getTime() - events[0].at.getTime()).toBe(index * WEEK_MS);
    });
  });

  it("drops estimated weeks when they are turned off", () => {
    const events = buildWeeklyResetEvents([account], visibleRange("month", local(2026, 10, 1)), {
      includeEstimated: false,
    });
    expect(events.map((event) => event.kind)).toEqual(["weekly"]);
  });

  it("starts a view that begins after the known reset at the first projected week", () => {
    const events = buildWeeklyResetEvents([account], visibleRange("7d", local(2026, 11, 2)), {
      includeEstimated: true,
    });
    expect(events.map((event) => [dayKey(event.at), event.kind])).toEqual([["2026-11-05", "estimated"]]);
  });

  it("skips accounts without a weekly window", () => {
    const noReset = createAccountSummary({ accountId: "acc_b", resetAtSecondary: null });
    const noWindow = createAccountSummary({
      accountId: "acc_c",
      resetAtSecondary: local(2026, 10, 22, 9).toISOString(),
      windowMinutesSecondary: null,
    });
    expect(
      buildWeeklyResetEvents([noReset, noWindow], visibleRange("month", local(2026, 10, 1)), {
        includeEstimated: true,
      }),
    ).toEqual([]);
  });
});

describe("buildCreditExpiryEvents", () => {
  const range = visibleRange("month", local(2026, 10, 1));

  it("emits one event per available credit and marks the soonest", () => {
    const events = buildCreditExpiryEvents(
      [
        {
          accountId: "acc_a",
          snapshot: snapshot([
            { id: "late", status: "available", expiresAt: local(2026, 10, 29, 13, 56).toISOString() },
            { id: "soon", status: "available", expiresAt: local(2026, 10, 22, 15, 36).toISOString() },
            { id: "used", status: "redeemed", expiresAt: local(2026, 10, 20, 8).toISOString() },
            { id: "no-expiry", status: "available", expiresAt: null },
            { id: "next-month", status: "available", expiresAt: local(2026, 11, 6, 17, 25).toISOString() },
          ]),
        },
      ],
      range,
    );
    expect(events.map((event) => [event.id, event.redeemsNext])).toEqual([
      ["acc_a:credit:late", false],
      ["acc_a:credit:soon", true],
    ]);
  });

  it("ignores missing and null snapshots", () => {
    expect(
      buildCreditExpiryEvents(
        [
          { accountId: "acc_a", snapshot: null },
          { accountId: "acc_b", snapshot: undefined },
        ],
        range,
      ),
    ).toEqual([]);
  });
});

describe("grid helpers", () => {
  it("groups events by local day in time order", () => {
    const byDay = groupByDay([
      { at: local(2026, 10, 22, 18) },
      { at: local(2026, 10, 22, 8) },
      { at: local(2026, 10, 23, 1) },
    ]);
    expect([...byDay.keys()]).toEqual(["2026-10-22", "2026-10-23"]);
    expect(byDay.get("2026-10-22")?.map((event) => event.at.getHours())).toEqual([8, 18]);
  });

  it("places time-grid events by time and splits overlapping ones side by side", () => {
    const placed = layoutTimedEvents(
      [{ at: local(2026, 10, 22, 8) }, { at: local(2026, 10, 22, 8, 15) }, { at: local(2026, 10, 22, 15, 30) }],
      32,
      22,
    );
    expect(placed.map(({ top, left, width }) => [top, left, width])).toEqual([
      [256, 0, 50],
      [264, 50, 50],
      [496, 0, 100],
    ]);
  });

  it("assigns colour slots in account order and cycles after six", () => {
    const accounts = Array.from({ length: 7 }, (_, index) => createAccountSummary({ accountId: `acc_${index}` }));
    const slots = accountColorSlots(accounts);
    expect([...slots.values()]).toEqual([1, 2, 3, 4, 5, 6, 1]);
  });
});
