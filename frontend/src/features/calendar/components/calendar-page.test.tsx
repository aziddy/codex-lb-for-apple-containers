import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/features/auth/hooks/use-auth";
import { CalendarPage } from "@/features/calendar/components/calendar-page";
import { useCalendarPreferencesStore } from "@/features/calendar/use-calendar-preferences";
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

  it("offers Redeem credit to sessions that can write accounts", async () => {
    useAuthStore.setState({ permissions: OPERATOR_PERMISSIONS });
    const user = userEvent.setup();
    renderCalendar();

    const [credit] = await within(dayCell("2026-10-22")).findAllByRole("button", { name: /^Reset credit expires/ });
    await user.click(credit);
    await user.click(await screen.findByRole("button", { name: "Redeem credit" }));

    expect(await screen.findByRole("heading", { name: "Redeem rate-limit reset credit" })).toBeInTheDocument();
  });

  it("does not offer Redeem credit to read-only sessions", async () => {
    const user = userEvent.setup();
    renderCalendar();

    const [credit] = await within(dayCell("2026-10-22")).findAllByRole("button", { name: /^Reset credit expires/ });
    await user.click(credit);

    expect(await screen.findByRole("link", { name: "Details" })).toHaveAttribute("href", "/accounts?selected=acc_alpha");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Redeem credit" })).not.toBeInTheDocument());
  });
});
