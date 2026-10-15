import { create } from "zustand";

const CALENDAR_PREFERENCES_STORAGE_KEY = "codex-lb-calendar-preferences";

type CalendarPreferences = {
  hiddenAccountIds: string[];
  showWeekly: boolean;
  showEstimated: boolean;
  showCredits: boolean;
};

type CalendarPreferencesState = CalendarPreferences & {
  toggleAccount: (accountId: string) => void;
  setShowWeekly: (value: boolean) => void;
  setShowEstimated: (value: boolean) => void;
  setShowCredits: (value: boolean) => void;
};

const DEFAULT_PREFERENCES: CalendarPreferences = {
  hiddenAccountIds: [],
  showWeekly: true,
  showEstimated: true,
  showCredits: true,
};

function readStored(): CalendarPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES;
  }
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(CALENDAR_PREFERENCES_STORAGE_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_PREFERENCES;
    }
    const stored = parsed as Partial<Record<keyof CalendarPreferences, unknown>>;
    return {
      hiddenAccountIds: Array.isArray(stored.hiddenAccountIds)
        ? stored.hiddenAccountIds.filter((id): id is string => typeof id === "string")
        : [],
      showWeekly: stored.showWeekly !== false,
      showEstimated: stored.showEstimated !== false,
      showCredits: stored.showCredits !== false,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function persist(preferences: CalendarPreferences): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(CALENDAR_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* Storage blocked - silently ignore. */
  }
}

/** Per-browser calendar filters: never sent to the server. */
export const useCalendarPreferencesStore = create<CalendarPreferencesState>((set, get) => {
  const update = (patch: Partial<CalendarPreferences>) => {
    const { hiddenAccountIds, showWeekly, showEstimated, showCredits } = { ...get(), ...patch };
    persist({ hiddenAccountIds, showWeekly, showEstimated, showCredits });
    set(patch);
  };
  return {
    ...readStored(),
    toggleAccount: (accountId) => {
      const hidden = get().hiddenAccountIds;
      update({
        hiddenAccountIds: hidden.includes(accountId) ? hidden.filter((id) => id !== accountId) : [...hidden, accountId],
      });
    },
    setShowWeekly: (showWeekly) => update({ showWeekly }),
    setShowEstimated: (showEstimated) => update({ showEstimated }),
    setShowCredits: (showCredits) => update({ showCredits }),
  };
});
