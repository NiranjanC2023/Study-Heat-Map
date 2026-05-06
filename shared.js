/** @typedef {'productive' | 'distraction' | 'neutral'} SiteKind */

export const STORAGE_KEYS = {
  productiveHosts: "productiveHosts",
  distractionHosts: "distractionHosts",
  /** seconds per YYYY-MM-DD: { [date]: { productive, distraction, neutral } } */
  dailyBuckets: "dailyBuckets",
  /** study sessions: { id, start, end?, label? } */
  sessions: "sessions",
  /** active study session id or null */
  activeSessionId: "activeSessionId",
  /** last tick state for attribution */
  tickState: "tickState",
};

/** @returns {string} */
export function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** @param {string} url */
export function hostnameFromUrl(url) {
  try {
    const u = new URL(url);
    return (u.hostname || "").toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * @param {string} host
 * @param {string[]} productive
 * @param {string[]} distraction
 * @returns {SiteKind}
 */
export function classifyHost(host, productive, distraction) {
  const h = host.toLowerCase();
  if (!h) return "neutral";
  if (productive.some((p) => h === p || h.endsWith("." + p))) return "productive";
  if (distraction.some((p) => h === p || h.endsWith("." + p))) return "distraction";
  return "neutral";
}

/**
 * @param {string} dateKey YYYY-MM-DD
 * @returns {number} Monday-based ISO week number (1-53)
 */
export function isoWeekNumber(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = (date.getDay() + 6) % 7; // Mon=0
  date.setDate(date.getDate() - day + 3);
  const firstThu = new Date(date.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7
    );
  return week;
}

/**
 * @param {string} dateKey
 * @returns {string} e.g. "2026-W19"
 */
export function weekLabel(dateKey) {
  const [y] = dateKey.split("-").map(Number);
  const w = isoWeekNumber(dateKey);
  return `${y}-W${String(w).padStart(2, "0")}`;
}
