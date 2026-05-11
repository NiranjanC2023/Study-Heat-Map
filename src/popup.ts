import { STORAGE_KEYS } from "./lib/storageKeys";
import { todayKey, mondayOf } from "./lib/dates";
import { computeStreak } from "./lib/streak";
import { hostnameFromUrl } from "./lib/classify";
import { productiveSecondsThisIsoWeek, weeklyGoalProgressPercent } from "./lib/weekly";
import type { DailyRow } from "./lib/types";
import type { PomodoroState } from "./lib/types";

const POLL_MS = 2500;

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

function showError(message: string): void {
  const el = document.getElementById("errorBanner")!;
  el.textContent = message;
  el.hidden = false;
}

function hideError(): void {
  const el = document.getElementById("errorBanner")!;
  el.textContent = "";
  el.hidden = true;
}

async function refresh(): Promise<void> {
  try {
    const snap = (await chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" })) as Record<
      string,
      unknown
    >;
    hideError();
    const day = todayKey();
    const buckets = snap[STORAGE_KEYS.dailyBuckets] as Record<string, DailyRow> | undefined;
    const row: DailyRow = buckets?.[day] ?? {
      productive: 0,
      distraction: 0,
      neutral: 0,
      study: 0,
    };

    const goalMin =
      typeof snap[STORAGE_KEYS.dailyGoalMinutes] === "number"
        ? (snap[STORAGE_KEYS.dailyGoalMinutes] as number)
        : 120;
    const weekGoalMin =
      typeof snap[STORAGE_KEYS.weeklyGoalMinutes] === "number"
        ? (snap[STORAGE_KEYS.weeklyGoalMinutes] as number)
        : 600;

    document.getElementById("goalText")!.textContent = `${goalMin} min / day`;
    const streak = computeStreak(buckets || {}, goalMin, new Date());
    document.getElementById("streakText")!.textContent =
      streak > 0 ? `${streak} day${streak === 1 ? "" : "s"}` : "—";

    const mon = mondayOf(new Date());
    const weekProd = productiveSecondsThisIsoWeek(buckets || {}, mon);
    const pct = weeklyGoalProgressPercent(weekProd, weekGoalMin);
    document.getElementById("weekProgressText")!.textContent = `${fmtDuration(weekProd)} / ${weekGoalMin}m (${pct}%)`;
    const fill = document.getElementById("weekProgressFill")!;
    fill.style.width = `${pct}%`;

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

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const hint = document.getElementById("currentHostHint")!;
    if (tab?.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("edge://")) {
      const h = hostnameFromUrl(tab.url);
      hint.textContent = h ? `Active host: ${h}` : "This page has no host — can’t add to lists.";
    } else {
      hint.textContent = "Open a normal website tab to add its hostname to your lists.";
    }

    const focusOn = snap[STORAGE_KEYS.focusModeEnabled] === true;
    const deepOn = snap[STORAGE_KEYS.deepFocusEnabled] === true;
    const focusEl = document.getElementById("focusMode") as HTMLInputElement;
    const deepEl = document.getElementById("deepFocus") as HTMLInputElement;
    focusEl.checked = focusOn;
    deepEl.checked = deepOn;
    deepEl.disabled = !focusOn;

    const lockedIds = (snap[STORAGE_KEYS.lockedTabIds] as number[]) || [];
    const btnLock = document.getElementById("btnTabLock") as HTMLButtonElement;
    const tid = tab?.id;
    const isLocked = tid != null && lockedIds.includes(tid);
    btnLock.textContent = isLocked ? "Unlock this tab" : "Lock this tab";
    btnLock.disabled = tid == null;

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
        typeof pauseUntil === "number" && Date.now() < pauseUntil
          ? "Session on (tracking paused)"
          : "Session running";
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
  } catch {
    showError("Couldn’t reach the extension background. Reload the extension or try again.");
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
  try {
    await chrome.runtime.sendMessage({
      type: "START_SESSION",
      label: pom ? "Pomodoro" : "Focus",
      ...(pom ? { pomodoro: pom } : {}),
    });
  } catch {
    showError("Couldn’t start session — is the extension enabled?");
    return;
  }
  await refresh();
});

document.getElementById("btnStop")!.addEventListener("click", async () => {
  const note = window.prompt("Session note (optional):", "") ?? "";
  try {
    await chrome.runtime.sendMessage({ type: "STOP_SESSION", note });
  } catch {
    showError("Couldn’t stop session.");
    return;
  }
  await refresh();
});

async function addCurrentHost(list: "productive" | "distraction"): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    showError("No active tab.");
    return;
  }
  const host = hostnameFromUrl(tab.url);
  if (!host) {
    showError("This page doesn’t have a host to add (e.g. internal browser pages).");
    return;
  }
  try {
    const res = (await chrome.runtime.sendMessage({ type: "ADD_HOST_RULE", list, host })) as {
      ok?: boolean;
    };
    if (!res?.ok) {
      showError("Couldn’t save that rule.");
      return;
    }
    hideError();
    await refresh();
  } catch {
    showError("Couldn’t add rule — try again.");
  }
}

document.getElementById("addProd")!.addEventListener("click", () => void addCurrentHost("productive"));
document.getElementById("addDist")!.addEventListener("click", () => void addCurrentHost("distraction"));

document.querySelectorAll("[data-pause]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const m = Number((btn as HTMLElement).dataset.pause);
    try {
      await chrome.runtime.sendMessage({ type: "PAUSE_TRACKING", minutes: m });
    } catch {
      showError("Couldn’t pause tracking.");
      return;
    }
    await refresh();
  });
});

document.getElementById("pauseClear")!.addEventListener("click", async () => {
  try {
    await chrome.runtime.sendMessage({ type: "CLEAR_PAUSE" });
  } catch {
    showError("Couldn’t clear pause.");
    return;
  }
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

document.getElementById("focusMode")!.addEventListener("change", async (e) => {
  const on = (e.target as HTMLInputElement).checked;
  const patch: Record<string, unknown> = { [STORAGE_KEYS.focusModeEnabled]: on };
  if (!on) patch[STORAGE_KEYS.deepFocusEnabled] = false;
  await chrome.storage.local.set(patch);
  await refresh();
});

document.getElementById("deepFocus")!.addEventListener("change", async (e) => {
  const on = (e.target as HTMLInputElement).checked;
  await chrome.storage.local.set({
    [STORAGE_KEYS.deepFocusEnabled]: on,
    ...(on ? { [STORAGE_KEYS.focusModeEnabled]: true } : {}),
  });
  await refresh();
});

document.getElementById("btnTabLock")!.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) return;
  const snap = (await chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" })) as Record<
    string,
    unknown
  >;
  const lockedIds = (snap[STORAGE_KEYS.lockedTabIds] as number[]) || [];
  const locked = lockedIds.includes(tab.id);
  try {
    await chrome.runtime.sendMessage({
      type: "SET_TAB_LOCK",
      tabId: tab.id,
      locked: !locked,
    });
  } catch {
    showError("Couldn’t update tab lock.");
    return;
  }
  await refresh();
});

const WATCH_KEYS = new Set<string>([
  STORAGE_KEYS.dailyBuckets,
  STORAGE_KEYS.dailyByHost,
  STORAGE_KEYS.pauseUntil,
  STORAGE_KEYS.activeSessionId,
  STORAGE_KEYS.pomodoroState,
  STORAGE_KEYS.dailyGoalMinutes,
  STORAGE_KEYS.weeklyGoalMinutes,
  STORAGE_KEYS.focusModeEnabled,
  STORAGE_KEYS.deepFocusEnabled,
  STORAGE_KEYS.focusOverrideUntil,
  STORAGE_KEYS.lockedTabIds,
]);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (Object.keys(changes).some((k) => WATCH_KEYS.has(k))) {
    void refresh();
  }
});

let pollId: number | undefined;

function startPolling(): void {
  if (pollId != null) return;
  pollId = window.setInterval(() => void refresh(), POLL_MS);
}

function stopPolling(): void {
  if (pollId != null) {
    window.clearInterval(pollId);
    pollId = undefined;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void refresh();
    startPolling();
  } else {
    stopPolling();
  }
});

void refresh();
startPolling();
