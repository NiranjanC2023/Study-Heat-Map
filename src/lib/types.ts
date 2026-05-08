import type { SiteKind } from "./classify";

export type DailyRow = {
  productive: number;
  distraction: number;
  neutral: number;
  study: number;
};

export type HostDayRow = {
  productive: number;
  distraction: number;
  neutral: number;
};

export type Session = {
  id: string;
  start: number;
  end: number | null;
  label: string;
  note?: string;
  pomodoroWorkMin?: number;
  pomodoroBreakMin?: number;
};

export type PomodoroState = {
  sessionId: string;
  workSec: number;
  breakSec: number;
  isWork: boolean;
};

export type Pulse = {
  ts: number;
  url: string;
  kind: SiteKind;
  tabId: number;
};

export type FocusModeConfig = {
  enabled: boolean;
  blockedSites: string[];
  overrideCooldownMs: number;
  overrideDurationMs: number;
  lastOverrideTime?: number;
};

export type TabLockState = {
  lockedTabIds: number[];
  deepFocusEnabled: boolean;
};
