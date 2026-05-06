import { keyFromDate } from "./dates";

export function computeStreak(
  buckets: Record<string, { productive?: number } | undefined>,
  goalMinutes: number,
  today: Date
): number {
  const goalSec = goalMinutes * 60;
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const tk = keyFromDate(t);
  if ((buckets[tk]?.productive ?? 0) < goalSec) {
    t.setDate(t.getDate() - 1);
  }
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const k = keyFromDate(t);
    if ((buckets[k]?.productive ?? 0) >= goalSec) {
      streak++;
      t.setDate(t.getDate() - 1);
    } else break;
  }
  return streak;
}
