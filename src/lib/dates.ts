function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`;
}

export function keyFromDate(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return todayKey(x);
}

export function isoWeekNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day + 3);
  const firstThu = new Date(date.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((date.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7
    )
  );
}

export function weekLabel(dateKey: string): string {
  const [y] = dateKey.split("-").map(Number);
  const w = isoWeekNumber(dateKey);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

export function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}
