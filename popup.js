// src/lib/storageKeys.ts
var STORAGE_KEYS = {
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
  focusModeEnabled: "focusModeEnabled",
  focusModeBlockedSites: "focusModeBlockedSites",
  focusModeOverrideCooldownMs: "focusModeOverrideCooldownMs",
  focusModeLastOverrideTime: "focusModeLastOverrideTime",
  focusModeOverrideDuration: "focusModeOverrideDuration"
};

// src/lib/dates.ts
function pad(n) {
  return String(n).padStart(2, "0");
}
function todayKey(d = /* @__PURE__ */ new Date()) {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`;
}
function keyFromDate(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return todayKey(x);
}
function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

// src/lib/streak.ts
function computeStreak(buckets, goalMinutes, today) {
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

// src/lib/classify.ts
function normalizeHost(host) {
  return host.toLowerCase().replace(/^www\./, "");
}
function hostnameFromUrl(url) {
  try {
    const u = new URL(url);
    return normalizeHost(u.hostname);
  } catch {
    return "";
  }
}

// src/lib/weekly.ts
function productiveSecondsThisIsoWeek(buckets, weekMonday) {
  let s = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekMonday);
    d.setDate(d.getDate() + i);
    s += buckets[keyFromDate(d)]?.productive ?? 0;
  }
  return s;
}
function weeklyGoalProgressPercent(productiveSec, goalMinutes) {
  if (goalMinutes <= 0) return 0;
  const g = goalMinutes * 60;
  return Math.min(100, Math.round(100 * productiveSec / g));
}

// src/popup.ts
var POLL_MS = 2500;
function fmtDuration(sec) {
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(sec)}s`;
}
function focusRatio(row) {
  const p = row?.productive || 0;
  const d = row?.distraction || 0;
  const t = p + d;
  if (t < 60) return null;
  return Math.round(100 * p / t);
}
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit" });
}
function showError(message) {
  const el = document.getElementById("errorBanner");
  el.textContent = message;
  el.hidden = false;
}
function hideError() {
  const el = document.getElementById("errorBanner");
  el.textContent = "";
  el.hidden = true;
}
async function refresh() {
  try {
    const snap = await chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" });
    hideError();
    const day = todayKey();
    const buckets = snap[STORAGE_KEYS.dailyBuckets];
    const row = buckets?.[day] ?? {
      productive: 0,
      distraction: 0,
      neutral: 0,
      study: 0
    };
    const goalMin = typeof snap[STORAGE_KEYS.dailyGoalMinutes] === "number" ? snap[STORAGE_KEYS.dailyGoalMinutes] : 120;
    const weekGoalMin = typeof snap[STORAGE_KEYS.weeklyGoalMinutes] === "number" ? snap[STORAGE_KEYS.weeklyGoalMinutes] : 600;
    document.getElementById("goalText").textContent = `${goalMin} min / day`;
    const streak = computeStreak(buckets || {}, goalMin, /* @__PURE__ */ new Date());
    document.getElementById("streakText").textContent = streak > 0 ? `${streak} day${streak === 1 ? "" : "s"}` : "\u2014";
    const mon = mondayOf(/* @__PURE__ */ new Date());
    const weekProd = productiveSecondsThisIsoWeek(buckets || {}, mon);
    const pct = weeklyGoalProgressPercent(weekProd, weekGoalMin);
    document.getElementById("weekProgressText").textContent = `${fmtDuration(weekProd)} / ${weekGoalMin}m (${pct}%)`;
    const fill = document.getElementById("weekProgressFill");
    fill.style.width = `${pct}%`;
    document.getElementById("todayProd").textContent = fmtDuration(row.productive || 0);
    document.getElementById("todayDist").textContent = fmtDuration(row.distraction || 0);
    const r = focusRatio(row);
    const ratioEl = document.getElementById("todayRatio");
    if (r == null) {
      ratioEl.textContent = "\u2014";
      ratioEl.style.color = "";
    } else {
      ratioEl.textContent = `${r}%`;
      ratioEl.style.color = r >= 55 ? "var(--good)" : r >= 40 ? "var(--text)" : "var(--bad)";
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const hint = document.getElementById("currentHostHint");
    if (tab?.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("edge://")) {
      const h = hostnameFromUrl(tab.url);
      hint.textContent = h ? `Active host: ${h}` : "This page has no host \u2014 can\u2019t add to lists.";
    } else {
      hint.textContent = "Open a normal website tab to add its hostname to your lists.";
    }
    const pauseUntil = snap[STORAGE_KEYS.pauseUntil];
    const pauseHint = document.getElementById("pauseHint");
    if (typeof pauseUntil === "number" && Date.now() < pauseUntil) {
      pauseHint.textContent = `Paused until ${fmtTime(pauseUntil)} \u2014 site time and study timer won\u2019t accrue.`;
    } else {
      pauseHint.textContent = "Skip counting time briefly (e.g. research rabbit holes).";
    }
    const focusModeEnabled = snap[STORAGE_KEYS.focusModeEnabled] === true;
    const focusToggle = document.getElementById("focusModeToggle");
    focusToggle.checked = focusModeEnabled;
    const focusStatus = document.getElementById("focusStatus");
    if (focusModeEnabled) {
      focusStatus.textContent = "Active";
      focusStatus.className = "status-pill active";
      focusStatus.hidden = false;
    } else {
      focusStatus.hidden = true;
    }
    const activeId = snap[STORAGE_KEYS.activeSessionId];
    const pom = snap[STORAGE_KEYS.pomodoroState];
    const status = document.getElementById("sessionStatus");
    const start = document.getElementById("btnStart");
    const stop = document.getElementById("btnStop");
    const pomStatus = document.getElementById("pomodoroStatus");
    if (activeId) {
      status.textContent = typeof pauseUntil === "number" && Date.now() < pauseUntil ? "Session on (tracking paused)" : "Session running";
      status.className = typeof pauseUntil === "number" && Date.now() < pauseUntil ? "pill paused" : "pill live";
      start.disabled = true;
      stop.disabled = false;
      if (pom && pom.sessionId === activeId) {
        pomStatus.hidden = false;
        pomStatus.textContent = pom.isWork ? `Pomodoro: focus block (${Math.round(pom.workSec / 60)} min)` : `Pomodoro: break (${Math.round(pom.breakSec / 60)} min)`;
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
    showError("Couldn\u2019t reach the extension background. Reload the extension or try again.");
  }
}
document.getElementById("btnStart").addEventListener("click", async () => {
  const sel = document.getElementById("pomodoroPreset");
  const v = sel.value;
  let pom;
  if (v) {
    const [w, b] = v.split(",").map((x) => Number(x));
    if (Number.isFinite(w) && Number.isFinite(b)) pom = { workMin: w, breakMin: b };
  }
  try {
    await chrome.runtime.sendMessage({
      type: "START_SESSION",
      label: pom ? "Pomodoro" : "Study",
      ...pom ? { pomodoro: pom } : {}
    });
  } catch {
    showError("Couldn\u2019t start session \u2014 is the extension enabled?");
    return;
  }
  await refresh();
});
document.getElementById("btnStop").addEventListener("click", async () => {
  const note = window.prompt("Session note (optional):", "") ?? "";
  try {
    await chrome.runtime.sendMessage({ type: "STOP_SESSION", note });
  } catch {
    showError("Couldn\u2019t stop session.");
    return;
  }
  await refresh();
});
async function addCurrentHost(list) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    showError("No active tab.");
    return;
  }
  const host = hostnameFromUrl(tab.url);
  if (!host) {
    showError("This page doesn\u2019t have a host to add (e.g. internal browser pages).");
    return;
  }
  try {
    const res = await chrome.runtime.sendMessage({ type: "ADD_HOST_RULE", list, host });
    if (!res?.ok) {
      showError("Couldn\u2019t save that rule.");
      return;
    }
    hideError();
    await refresh();
  } catch {
    showError("Couldn\u2019t add rule \u2014 try again.");
  }
}
document.getElementById("addProd").addEventListener("click", () => void addCurrentHost("productive"));
document.getElementById("addDist").addEventListener("click", () => void addCurrentHost("distraction"));
document.querySelectorAll("[data-pause]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const m = Number(btn.dataset.pause);
    try {
      await chrome.runtime.sendMessage({ type: "PAUSE_TRACKING", minutes: m });
    } catch {
      showError("Couldn\u2019t pause tracking.");
      return;
    }
    await refresh();
  });
});
document.getElementById("pauseClear").addEventListener("click", async () => {
  try {
    await chrome.runtime.sendMessage({ type: "CLEAR_PAUSE" });
  } catch {
    showError("Couldn\u2019t clear pause.");
    return;
  }
  await refresh();
});
document.getElementById("focusModeToggle").addEventListener("change", async (e) => {
  const checkbox = e.target;
  try {
    await chrome.runtime.sendMessage({
      type: "TOGGLE_FOCUS_MODE",
      enabled: checkbox.checked
    });
  } catch {
    showError("Couldn't toggle Focus Mode.");
    checkbox.checked = !checkbox.checked;
    return;
  }
  await refresh();
});
document.getElementById("openDash").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});
document.getElementById("openOpts").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
document.getElementById("openOnboard").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
});
var WATCH_KEYS = /* @__PURE__ */ new Set([
  STORAGE_KEYS.dailyBuckets,
  STORAGE_KEYS.dailyByHost,
  STORAGE_KEYS.pauseUntil,
  STORAGE_KEYS.activeSessionId,
  STORAGE_KEYS.pomodoroState,
  STORAGE_KEYS.dailyGoalMinutes,
  STORAGE_KEYS.weeklyGoalMinutes,
  STORAGE_KEYS.focusModeEnabled
]);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (Object.keys(changes).some((k) => WATCH_KEYS.has(k))) {
    void refresh();
  }
});
var pollId;
function startPolling() {
  if (pollId != null) return;
  pollId = window.setInterval(() => void refresh(), POLL_MS);
}
function stopPolling() {
  if (pollId != null) {
    window.clearInterval(pollId);
    pollId = void 0;
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
