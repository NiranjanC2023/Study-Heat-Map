export const RETENTION_DAYS = 800;

/** YYYY-MM-DD keys; drop those strictly before cutoffKey. */
export function filterOldDateKeys(keys: string[], cutoffKey: string): string[] {
  return keys.filter((k) => k >= cutoffKey);
}

export function cutoffDateKey(anchor: Date, days: number): string {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
