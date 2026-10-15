import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import App from "@/App";
import { useAuthStore } from "@/features/auth/hooks/use-auth";
import { createDashboardAuthSession, createSessionUser } from "@/test/mocks/factories";
import { server } from "@/test/mocks/server";
import { renderWithProviders } from "@/test/utils";

// A signed-in account whose role lacks `accounts:read`: the Accounts nav item
// disappears and its route falls back to the dashboard.
const dashboardOnlySession = createDashboardAuthSession({
  permissions: ["read", "dashboard:read:all"],
  user: createSessionUser({ username: "viewer", role: { id: "r3", slug: "custom", name: "Reader", kind: "custom" } }),
});

describe("permission-aware navigation integration", () => {
  // A previous test's grants would otherwise guard the route before the session reloads.
  beforeEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState());
  });

  it("redirects a guarded route the session cannot use to the dashboard and hides its nav item", async () => {
    server.use(http.get("/api/dashboard-auth/session", () => HttpResponse.json(dashboardOnlySession)));

    window.history.pushState({}, "", "/accounts");
    renderWithProviders(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/dashboard"));
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Accounts/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reports/i })).toBeInTheDocument();
  });

  it("guards the Calendar route and nav item behind account read access", async () => {
    server.use(http.get("/api/dashboard-auth/session", () => HttpResponse.json(dashboardOnlySession)));

    window.history.pushState({}, "", "/calendar");
    renderWithProviders(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/dashboard"));
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Calendar/i })).not.toBeInTheDocument();
  });

  it("opens the Calendar page from the header for a session with account read access", async () => {
    window.history.pushState({}, "", "/calendar");
    renderWithProviders(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Calendar/i })).toHaveAttribute("aria-current", "page");
  });
});
