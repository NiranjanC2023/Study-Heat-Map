import { keyFromDate } from "./dates";
import type { DailyRow } from "./types";

export function productiveSecondsThisIsoWeek(
  buckets: Record<string, DailyRow | undefined>,
  weekMonday: Date
): number {
  let s = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekMonday);
    d.setDate(d.getDate() + i);
    s += buckets[keyFromDate(d)]?.productive ?? 0;
  }
  return s;
}

export function weeklyGoalProgressPercent(productiveSec: number, goalMinutes: number): number {
  if (goalMinutes <= 0) return 0;
  const g = goalMinutes * 60;
  return Math.min(100, Math.round((100 * productiveSec) / g));
}
