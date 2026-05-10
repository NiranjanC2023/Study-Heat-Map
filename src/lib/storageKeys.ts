export const STORAGE_KEYS = {
  productiveHosts: "productiveHosts",
  distractionHosts: "distractionHosts",
  dailyBuckets: "dailyBuckets",
  dailyByHost: "dailyByHost",
  sessions: "sessions",
  activeSessionId: "activeSessionId",
  pauseUntil: "pauseUntil",
  onboardingDone: "onboardingDone",
  dailyGoalMinutes: "dailyGoalMinutes",
  weeklyGoalMinutes: "weeklyGoalMinutes",
  pomodoroNotify: "pomodoroNotify",
  pomodoroState: "pomodoroState",
  /** Block distraction URLs → Stay Focused page */
  focusModeEnabled: "focusModeEnabled",
  /** Stronger focus: no temporary override on blocked page */
  deepFocusEnabled: "deepFocusEnabled",
  /** Until this timestamp, distraction URLs are allowed (after override). */
  focusOverrideUntil: "focusOverrideUntil",
  /** How long an override lasts (minutes). */
  focusOverrideDurationMin: "focusOverrideDurationMin",
  /** Minimum minutes between override grants. */
  focusOverrideCooldownMin: "focusOverrideCooldownMin",
  /** Last time user granted an override (ms). */
  lastFocusOverrideAt: "lastFocusOverrideAt",
  /** Tab IDs pinned + injection for “locked” tabs */
  lockedTabIds: "lockedTabIds",
} as const;
