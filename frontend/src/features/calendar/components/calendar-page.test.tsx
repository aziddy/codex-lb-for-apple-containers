import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/features/auth/hooks/use-auth";
import { CalendarPage } from "@/features/calendar/components/calendar-page";
import { useCalendarPreferencesStore } from "@/features/calendar/use-calendar-preferences";
import { usePrivacyStore } from "@/hooks/use-privacy";
import { useTimeFormatStore } from "@/hooks/use-time-format";
import { OPERATOR_PERMISSIONS, VIEWER_PERMISSIONS, createAccountSummary } from "@/test/mocks/factories";
import { server } from "@/test/mocks/server";
import { renderWithProviders } from "@/test/utils";

function local(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

const ALPHA = createAccountSummary({
  accountId: "acc_alpha",
  email: "alpha@example.com",
  displayName: "alpha@example.com",
  planType: "pro",
  usage: { primaryRemainingPercent: 90, secondaryRemainingPercent: 97, monthlyRemainingPercent: null },
  resetAtSecondary: local(2026, 10, 22, 9, 0).toISOString(),
  windowMinutesSecondary: 10_080,
  availableResetCredits: 3,
  resetCreditNearestExpiresAt: local(2026, 10, 22, 8, 0).toISOString(),
});

const BETA = createAccountSummary({
  accountId: "acc_beta",
  email: "beta@example.com",
  displayName: "beta@example.com",
  resetAtSecondary: local(2026, 10, 17, 9, 12).toISOString(),
  windowMinutesSecondary: 10_080,
  availableResetCredits: 0,
});

const ALPHA_SNAPSHOT = {
  availableCount: 3,
  nearestExpiresAt: local(2026, 10, 22, 8, 0).toISOString(),
  credits: [
    { id: "c1", status: "available", expiresAt: local(2026, 10, 22, 8, 0).toISOString() },
    { id: "c2", status: "available", expiresAt: local(2026, 10, 22, 15, 36).toISOString() },
    { id: "c3", status: "available", expiresAt: local(2026, 10, 22, 18, 45).toISOString() },
  ],
};

let snapshotRequests: string[] = [];

function renderCalendar(path = "/calendar") {
  window.history.pushState({}, "", path);
  return renderWithProviders(<CalendarPage />);
}

function dayCell(key: string) {
  return screen.getByTestId(`calendar-day-${key}`);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(local(2026, 10, 15, 16, 49));
  snapshotRequests = [];
  useCalendarPreferencesStore.setState({
    hiddenAccountIds: [],
    showWeekly: true,
    showEstimated: true,
    showCredits: true,
  });
  useAuthStore.setState({ permissions: VIEWER_PERMISSIONS });
  usePrivacyStore.setState({ blurred: false });
  useTimeFormatStore.setState({ timeFormat: "12h" });
  server.use(
    http.get("/api/accounts", () => HttpResponse.json({ accounts: [ALPHA, BETA] })),
    http.get("/api/accounts/:accountId/rate-limit-reset-credits", ({ params }) => {
      snapshotRequests.push(String(params.accountId));
      return HttpResponse.json(params.accountId === "acc_alpha" ? ALPHA_SNAPSHOT : null);
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  useAuthStore.setState({ permissions: [] });
  usePrivacyStore.setState({ blurred: false });
  useTimeFormatStore.setState({ timeFormat: "12h" });
  window.localStorage.removeItem("codex-lb-calendar-preferences");
});

describe("CalendarPage", () => {
  it("shows the current month with known, estimated, and credit-expiry events", async () => {
    renderCalendar();

    expect(screen.getByRole("heading", { level: 2, name: "October 2026" })).toBeInTheDocument();
    const oct22 = dayCell("2026-10-22");
    expect(await within(oct22).findByRole("button", { name: /^Weekly reset, alpha@example\.com/ })).toBeInTheDocument();
    expect(await within(oct22).findAllByRole("button", { name: /^Reset credit expires, alpha@example\.com/ })).toHaveLength(2);
    expect(within(oct22).getByRole("button", { name: "+1 more" })).toBeInTheDocument();
    expect(
      within(dayCell("2026-10-29")).getByRole("button", { name: /^Estimated weekly reset, alpha@example\.com/ }),
    ).toBeInTheDocument();
    expect(within(dayCell("2026-10-17")).getByRole("button", { name: /^Weekly reset, beta@example\.com/ })).toBeInTheDocument();
  });

  it("requests reset-credit snapshots only for accounts that report credits", async () => {
    renderCalendar();

    await within(dayCell("2026-10-22")).findAllByRole("button", { name: /^Reset credit expires/ });
    expect(snapshotRequests).toEqual(["acc_alpha"]);
  });

  it("hides every event of an account that is switched off", async () => {
    const user = userEvent.setup();
    renderCalendar();
    await within(dayCell("2026-10-22")).findByRole("button", { name: /^Weekly reset, alpha/ });

    await user.click(screen.getByRole("checkbox", { name: /alpha@example\.com/ }));

    expect(within(dayCell("2026-10-22")).queryByRole("button", { name: /alpha@example\.com/ })).not.toBeInTheDocument();
    expect(within(dayCell("2026-10-29")).queryByRole("button", { name: /alpha@example\.com/ })).not.toBeInTheDocument();
    expect(within(dayCell("2026-10-17")).getByRole("button", { name: /^Weekly reset, beta/ })).toBeInTheDocument();
  });

  it("hides estimated resets on their own", async () => {
    const user = userEvent.setup();
    renderCalendar();
    await within(dayCell("2026-10-29")).findByRole("button", { name: /^Estimated weekly reset/ });

    await user.click(screen.getByRole("checkbox", { name: "Estimated resets" }));

    expect(within(dayCell("2026-10-29")).queryByRole("button", { name: /^Estimated weekly reset/ })).not.toBeInTheDocument();
    expect(within(dayCell("2026-10-22")).getByRole("button", { name: /^Weekly reset, alpha/ })).toBeInTheDocument();
  });

  it("opens the 7-day view from an overflowing day", async () => {
    const user = userEvent.setup();
    renderCalendar();

    await user.click(await within(dayCell("2026-10-22")).findByRole("button", { name: "+1 more" }));

    const params = new URLSearchParams(window.location.search);
    expect(params.get("view")).toBe("7d");
    expect(params.get("date")).toBe("2026-10-22");
    expect(screen.getByRole("heading", { level: 2, name: /Oct 18\s*–\s*24, 2026/ })).toBeInTheDocument();
    expect(screen.getByTestId("calendar-column-2026-10-22")).toBeInTheDocument();
  });

  it("reads the view from the URL and falls back on invalid parameters", () => {
    renderCalendar("/calendar?view=year&date=not-a-date");
    expect(screen.getByRole("heading", { level: 2, name: "October 2026" })).toBeInTheDocument();
  });

  it("steps the 14-day view by 14 days and draws the now line on today", async () => {
    const user = userEvent.setup();
    renderCalendar("/calendar?view=14d&date=2026-10-15");

    expect(screen.getByRole("heading", { level: 2, name: /Oct 11\s*–\s*24, 2026/ })).toBeInTheDocument();
    expect(within(screen.getByTestId("calendar-column-2026-10-15")).getByTestId("calendar-now-line")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next 14 days" }));

    expect(new URLSearchParams(window.location.search).get("date")).toBe("2026-10-29");
    expect(screen.getByRole("heading", { level: 2, name: /Oct 25\s*–\s*Nov 7, 2026/ })).toBeInTheDocument();
  });

  it.each(["month", "schedule"])("offers Redeem credit to writers in %s", async (view) => {
    useAuthStore.setState({ permissions: OPERATOR_PERMISSIONS });
    const user = userEvent.setup();
    renderCalendar(`/calendar?view=${view}&date=2026-10-22`);

    const [credit] = await screen.findAllByRole("button", { name: /^Reset credit expires/ });
    await user.click(credit);
    await user.click(await screen.findByRole("button", { name: "Redeem credit" }));

    expect(await screen.findByRole("heading", { name: "Redeem rate-limit reset credit" })).toBeInTheDocument();
  });

  it.each(["month", "schedule"])("does not offer Redeem credit to read-only sessions in %s", async (view) => {
    const user = userEvent.setup();
    renderCalendar(`/calendar?view=${view}&date=2026-10-22`);

    const [credit] = await screen.findAllByRole("button", { name: /^Reset credit expires/ });
    await user.click(credit);

    expect(await screen.findByRole("link", { name: "Details" })).toHaveAttribute("href", "/accounts?selected=acc_alpha");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Redeem credit" })).not.toBeInTheDocument());
  });
});

describe("Calendar Schedule view", () => {
  it("groups every event by local day and time, with month headings and today's marker", async () => {
    vi.setSystemTime(local(2026, 10, 22, 7));
    renderCalendar("/calendar?view=schedule&date=2026-10-22");

    const schedule = screen.getByRole("region", { name: "Schedule" });
    const day = await within(schedule).findByRole("region", { name: "Thu, Oct 22" });
    expect(within(day).getByText("22", { selector: "time" })).toHaveAttribute("aria-current", "date");
    expect(within(day).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Reset credit expires, alpha@example.com, Thu, Oct 22 8:00 AM",
      "Weekly reset, alpha@example.com, Thu, Oct 22 9:00 AM",
      "Reset credit expires, alpha@example.com, Thu, Oct 22 3:36 PM",
      "Reset credit expires, alpha@example.com, Thu, Oct 22 6:45 PM",
    ]);
    expect(within(schedule).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "October 2026", "November 2026",
    ]);
    expect(within(schedule).queryByRole("region", { name: "Fri, Oct 23" })).not.toBeInTheDocument();
    expect(within(schedule).queryByRole("region", { name: "Sat, Nov 21" })).not.toBeInTheDocument();
    const estimated = within(schedule).getAllByRole("button", { name: /^Estimated weekly reset/ });
    expect(estimated[0]).toHaveClass("border-dashed");
    expect(within(schedule).queryByRole("button", { name: /more/ })).not.toBeInTheDocument();
  });

  it("switches to Schedule with the current anchor and steps by 30 days", async () => {
    const user = userEvent.setup();
    renderCalendar("/calendar?view=month&date=2026-10-22");
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    expect(window.location.search).toBe("?view=schedule&date=2026-10-22");
    expect(screen.getByRole("button", { name: "Schedule" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { level: 2, name: /Oct 22\s*–\s*Nov 20, 2026/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next 30 days" }));
    expect(window.location.search).toBe("?view=schedule&date=2026-11-21");
    await user.click(screen.getByRole("button", { name: "Previous 30 days" }));
    expect(window.location.search).toBe("?view=schedule&date=2026-10-22");
    await user.click(screen.getByRole("button", { name: /^Today$/ }));
    expect(window.location.search).toBe("?view=schedule&date=2026-10-15");
    const today = await screen.findByRole("region", { name: "Thu, Oct 15" });
    expect(within(today).getByText("15", { selector: "time" })).toHaveAttribute("aria-current", "date");
    expect(within(today).getByText("No resets or credit expiries on this day.")).toBeInTheDocument();
  });

  it("uses mini-calendar selection as the first Schedule day", async () => {
    const user = userEvent.setup();
    renderCalendar("/calendar?view=schedule&date=2026-10-22");
    await user.click(screen.getByRole("button", { name: /October 29th, 2026/ }));
    expect(window.location.search).toBe("?view=schedule&date=2026-10-29");
    const schedule = screen.getByRole("region", { name: "Schedule" });
    expect(await within(schedule).findByRole("region", { name: "Thu, Oct 29" })).toBeInTheDocument();
    expect(within(schedule).queryByRole("region", { name: "Thu, Oct 22" })).not.toBeInTheDocument();
  });

  it("applies account and event filters and shows an empty period", async () => {
    const user = userEvent.setup();
    renderCalendar("/calendar?view=schedule&date=2026-10-22");
    const schedule = screen.getByRole("region", { name: "Schedule" });
    await within(schedule).findAllByRole("button", { name: /^Reset credit expires/ });

    await user.click(screen.getByRole("checkbox", { name: /alpha@example\.com/ }));
    expect(within(schedule).queryByRole("button", { name: /alpha@example\.com/ })).not.toBeInTheDocument();
    expect(within(schedule).getAllByRole("button", { name: /beta@example\.com/ }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("checkbox", { name: /alpha@example\.com/ }));
    await user.click(screen.getByRole("checkbox", { name: "Estimated resets" }));
    expect(within(schedule).queryByRole("button", { name: /^Estimated weekly reset/ })).not.toBeInTheDocument();
    expect(within(schedule).getByRole("button", { name: /^Weekly reset/ })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Weekly resets" }));
    expect(within(schedule).queryByRole("button", { name: /^Weekly reset/ })).not.toBeInTheDocument();
    expect(within(schedule).getAllByRole("button", { name: /^Reset credit expires/ })).toHaveLength(3);
    await user.click(screen.getByRole("checkbox", { name: "Credit expiries" }));
    expect(within(schedule).getByRole("status")).toHaveTextContent("No resets or credit expiries in this period.");
  });

  it("updates privacy blur and times when display preferences change", async () => {
    renderCalendar("/calendar?view=schedule&date=2026-10-22");
    const schedule = screen.getByRole("region", { name: "Schedule" });
    const [credit] = await within(schedule).findAllByRole("button", { name: /^Reset credit expires/ });
    expect(within(credit).getByText("8:00 AM")).toBeInTheDocument();
    act(() => {
      usePrivacyStore.setState({ blurred: true });
      useTimeFormatStore.setState({ timeFormat: "24h" });
    });
    expect(within(credit).getByText("alpha@example.com")).toHaveClass("privacy-blur");
    expect(within(credit).getByText("08:00")).toBeInTheDocument();
  });

  it("waits for initial credit data before showing an empty state", async () => {
    let releaseSnapshot!: () => void;
    const pending = new Promise<void>((resolve) => { releaseSnapshot = resolve; });
    let requested = false;
    server.use(http.get("/api/accounts/:accountId/rate-limit-reset-credits", async () => {
      requested = true;
      await pending;
      return HttpResponse.json(ALPHA_SNAPSHOT);
    }));
    useCalendarPreferencesStore.setState({ showWeekly: false });
    renderCalendar("/calendar?view=schedule&date=2026-10-22");
    const schedule = screen.getByRole("region", { name: "Schedule" });
    await waitFor(() => expect(requested).toBe(true));
    expect(schedule).toHaveAttribute("aria-busy", "true");
    expect(within(schedule).getByRole("status")).toHaveTextContent("Loading...");
    expect(within(schedule).queryByText("No resets or credit expiries in this period.")).not.toBeInTheDocument();
    await act(async () => { releaseSnapshot(); });
    expect(await within(schedule).findAllByRole("button", { name: /^Reset credit expires/ })).toHaveLength(3);
    expect(schedule).toHaveAttribute("aria-busy", "false");
  });

  it("shows an empty period and today's marker when there are no accounts", async () => {
    server.use(http.get("/api/accounts", () => HttpResponse.json({ accounts: [] })));
    renderCalendar("/calendar?view=schedule");
    const schedule = screen.getByRole("region", { name: "Schedule" });
    expect(await within(schedule).findByText("No resets or credit expiries in this period.")).toBeInTheDocument();
    expect(within(schedule).getByText("15", { selector: "time" })).toHaveAttribute("aria-current", "date");
  });
});
