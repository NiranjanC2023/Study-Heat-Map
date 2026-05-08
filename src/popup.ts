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

    const pauseUntil = snap[STORAGE_KEYS.pauseUntil] as number | undefined;
    const pauseHint = document.getElementById("pauseHint")!;
    if (typeof pauseUntil === "number" && Date.now() < pauseUntil) {
      pauseHint.textContent = `Paused until ${fmtTime(pauseUntil)} — site time and study timer won’t accrue.`;
    } else {
      pauseHint.textContent = "Skip counting time briefly (e.g. research rabbit holes).";
    }
    // Update Focus Mode status
    const focusModeEnabled = snap[STORAGE_KEYS.focusModeEnabled] === true;
    const focusToggle = document.getElementById("focusModeToggle") as HTMLInputElement;
    focusToggle.checked = focusModeEnabled;
    
    const focusStatus = document.getElementById("focusStatus")!;
    if (focusModeEnabled) {
      focusStatus.textContent = "Active";
      focusStatus.className = "status-pill active";
      focusStatus.hidden = false;
    } else {
      focusStatus.hidden = true;
    }

    // Update tab lock status for current tab
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const lockBtn = document.getElementById("lockTabBtn") as HTMLButtonElement;
    const lockStatus = document.getElementById("lockStatus")!;
    if (currentTab?.id) {
      try {
        const lockResponse = await chrome.runtime.sendMessage({
          type: "CHECK_TAB_LOCKED",
        });
        const isLocked = lockResponse?.locked === true;
        lockBtn.textContent = isLocked ? "Unlock Current Tab" : "Lock Current Tab";
        if (isLocked) {
          lockStatus.textContent = "Locked";
          lockStatus.className = "status-pill locked";
          lockStatus.hidden = false;
        } else {
          lockStatus.hidden = true;
        }
      } catch {
        lockStatus.hidden = true;
      }
    }

    // Update Deep Focus status
    const deepFocusEnabled = snap[STORAGE_KEYS.deepFocusEnabled] === true;
    const deepFocusToggle = document.getElementById("deepFocusToggle") as HTMLInputElement;
    deepFocusToggle.checked = deepFocusEnabled;
    
    const deepFocusStatus = document.getElementById("deepFocusStatus")!;
    if (deepFocusEnabled) {
      deepFocusStatus.textContent = "Active";
      deepFocusStatus.className = "status-pill active";
      deepFocusStatus.hidden = false;
    } else {
      deepFocusStatus.hidden = true;
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
      label: pom ? "Pomodoro" : "Study",
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
// Focus Mode toggle
document.getElementById("focusModeToggle")!.addEventListener("change", async (e) => {
  const checkbox = e.target as HTMLInputElement;
  try {
    await chrome.runtime.sendMessage({
      type: "TOGGLE_FOCUS_MODE",
      enabled: checkbox.checked,
    });
  } catch {
    showError("Couldn't toggle Focus Mode.");
    checkbox.checked = !checkbox.checked;
    return;
  }
  await refresh();
});

// Tab Locking: Lock/Unlock current tab
document.getElementById("lockTabBtn")!.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showError("No active tab.");
    return;
  }
  try {
    const isLocked = await chrome.runtime.sendMessage({
      type: "CHECK_TAB_LOCKED",
    });
    const response = await chrome.runtime.sendMessage({
      type: isLocked.locked ? "UNLOCK_TAB" : "LOCK_TAB",
      tabId: tab.id,
    });
    if (!response?.ok) {
      showError("Couldn't toggle tab lock.");
      return;
    }
    hideError();
    await refresh();
  } catch {
    showError("Couldn't lock tab — is the extension enabled?");
  }
});

// Deep Focus toggle
document.getElementById("deepFocusToggle")!.addEventListener("change", async (e) => {
  const checkbox = e.target as HTMLInputElement;
  try {
    await chrome.runtime.sendMessage({
      type: "TOGGLE_DEEP_FOCUS",
      enabled: checkbox.checked,
    });
  } catch {
    showError("Couldn't toggle Deep Focus.");
    checkbox.checked = !checkbox.checked;
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

const WATCH_KEYS = new Set<string>([
  STORAGE_KEYS.dailyBuckets,
  STORAGE_KEYS.dailyByHost,
  STORAGE_KEYS.pauseUntil,
  STORAGE_KEYS.activeSessionId,
  STORAGE_KEYS.pomodoroState,
  STORAGE_KEYS.dailyGoalMinutes,
  STORAGE_KEYS.weeklyGoalMinutes,
  STORAGE_KEYS.focusModeEnabled,
  STORAGE_KEYS.lockedTabIds,
  STORAGE_KEYS.deepFocusEnabled,
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
