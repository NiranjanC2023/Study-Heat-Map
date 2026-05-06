import { STORAGE_KEYS } from "./lib/storageKeys";
import { todayKey } from "./lib/dates";
import { computeStreak } from "./lib/streak";
import type { PomodoroState } from "./lib/types";

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(sec)}s`;
}

function focusRatio(row: { productive?: number; distraction?: number } | undefined): number | null {
  const p = row?.productive || 0;
  const d = row?.distraction || 0;
  const t = p + d;
  if (t < 60) return null;
  return Math.round((100 * p) / t);
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

async function refresh(): Promise<void> {
  const snap = (await chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" })) as Record<
    string,
    unknown
  >;
  const day = todayKey();
  const buckets = snap[STORAGE_KEYS.dailyBuckets] as
    | Record<string, { productive?: number; distraction?: number }>
    | undefined;
  const row = buckets?.[day] || {};

  const goalMin =
    typeof snap[STORAGE_KEYS.dailyGoalMinutes] === "number"
      ? (snap[STORAGE_KEYS.dailyGoalMinutes] as number)
      : 120;

  document.getElementById("goalText")!.textContent = `${goalMin} min productive`;
  const streak = computeStreak(buckets || {}, goalMin, new Date());
  document.getElementById("streakText")!.textContent =
    streak > 0 ? `${streak} day${streak === 1 ? "" : "s"}` : "—";

  document.getElementById("todayProd")!.textContent = fmtDuration(row.productive || 0);
  document.getElementById("todayDist")!.textContent = fmtDuration(row.distraction || 0);
  const r = focusRatio(row);
  const ratioEl = document.getElementById("todayRatio")!;
  if (r == null) {
    ratioEl.textContent = "—";
    ratioEl.style.color = "";
  } else {
    ratioEl.textContent = `${r}%`;
    ratioEl.style.color = r >= 55 ? "var(--good)" : r >= 40 ? "var(--text)" : "var(--bad)";
  }

  const pauseUntil = snap[STORAGE_KEYS.pauseUntil] as number | undefined;
  const pauseHint = document.getElementById("pauseHint")!;
  if (typeof pauseUntil === "number" && Date.now() < pauseUntil) {
    pauseHint.textContent = `Paused until ${fmtTime(pauseUntil)} — site time and study timer won’t accrue.`;
  } else {
    pauseHint.textContent = "Skip counting time briefly (e.g. research rabbit holes).";
  }

  const activeId = snap[STORAGE_KEYS.activeSessionId] as string | null | undefined;
  const pom = snap[STORAGE_KEYS.pomodoroState] as PomodoroState | undefined;
  const status = document.getElementById("sessionStatus")!;
  const start = document.getElementById("btnStart") as HTMLButtonElement;
  const stop = document.getElementById("btnStop") as HTMLButtonElement;
  const pomStatus = document.getElementById("pomodoroStatus")!;

  if (activeId) {
    status.textContent =
      typeof pauseUntil === "number" && Date.now() < pauseUntil ? "Session on (tracking paused)" : "Session running";
    status.className =
      typeof pauseUntil === "number" && Date.now() < pauseUntil ? "pill paused" : "pill live";
    start.disabled = true;
    stop.disabled = false;
    if (pom && pom.sessionId === activeId) {
      pomStatus.hidden = false;
      pomStatus.textContent = pom.isWork
        ? `Pomodoro: focus block (${Math.round(pom.workSec / 60)} min)`
        : `Pomodoro: break (${Math.round(pom.breakSec / 60)} min)`;
    } else {
      pomStatus.hidden = true;
    }
  } else {
    status.textContent = "No active session";
    status.className = "pill idle";
    start.disabled = false;
    stop.disabled = true;
    pomStatus.hidden = true;
  }
}

document.getElementById("btnStart")!.addEventListener("click", async () => {
  const sel = document.getElementById("pomodoroPreset") as HTMLSelectElement;
  const v = sel.value;
  let pom: { workMin: number; breakMin: number } | undefined;
  if (v) {
    const [w, b] = v.split(",").map((x) => Number(x));
    if (Number.isFinite(w) && Number.isFinite(b)) pom = { workMin: w, breakMin: b };
  }
  await chrome.runtime.sendMessage({
    type: "START_SESSION",
    label: pom ? "Pomodoro" : "Study",
    ...(pom ? { pomodoro: pom } : {}),
  });
  await refresh();
});

document.getElementById("btnStop")!.addEventListener("click", async () => {
  const note = window.prompt("Session note (optional):", "") ?? "";
  await chrome.runtime.sendMessage({ type: "STOP_SESSION", note });
  await refresh();
});

document.querySelectorAll("[data-pause]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const m = Number((btn as HTMLElement).dataset.pause);
    await chrome.runtime.sendMessage({ type: "PAUSE_TRACKING", minutes: m });
    await refresh();
  });
});

document.getElementById("pauseClear")!.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_PAUSE" });
  await refresh();
});

document.getElementById("openDash")!.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

document.getElementById("openOpts")!.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("openOnboard")!.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
});

void refresh();
