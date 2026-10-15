import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { getRateLimitResetCredits, listAccounts } from "@/features/accounts/api";
import type { AccountSummary } from "@/features/accounts/schemas";
import type { AccountCreditSnapshot } from "@/features/calendar/events";

const NO_ACCOUNTS: AccountSummary[] = [];
const NOW_TICK_MS = 60_000;

/**
 * The account list (shared with the header and Accounts page) plus the
 * per-account reset-credit snapshot, requested only for accounts whose summary
 * reports available credits. The snapshot shares the redeem dialog's query
 * key, so a redeem's invalidation refreshes the calendar too.
 */
export function useCalendarData() {
  const accountsQuery = useQuery({
    queryKey: ["accounts", "list"],
    queryFn: listAccounts,
    select: (data) => data.accounts,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const accounts = accountsQuery.data ?? NO_ACCOUNTS;
  const creditAccountIds = useMemo(
    () => accounts.filter((account) => (account.availableResetCredits ?? 0) > 0).map((account) => account.accountId),
    [accounts],
  );
  const snapshots = useQueries({
    queries: creditAccountIds.map((accountId) => ({
      queryKey: ["accounts", "reset-credits", accountId],
      queryFn: () => getRateLimitResetCredits(accountId),
      staleTime: 60_000,
    })),
    combine: (results): AccountCreditSnapshot[] =>
      results.map((result, index) => ({ accountId: creditAccountIds[index], snapshot: result.data })),
  });

  return { accountsQuery, accounts, snapshots };
}

/** The current time, refreshed every minute for the "now" line and relative labels. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), NOW_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
