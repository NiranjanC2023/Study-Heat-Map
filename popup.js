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
  pomodoroNotify: "pomodoroNotify",
  pomodoroState: "pomodoroState"
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

// src/popup.ts
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
async function refresh() {
  const snap = await chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" });
  const day = todayKey();
  const buckets = snap[STORAGE_KEYS.dailyBuckets];
  const row = buckets?.[day] || {};
  const goalMin = typeof snap[STORAGE_KEYS.dailyGoalMinutes] === "number" ? snap[STORAGE_KEYS.dailyGoalMinutes] : 120;
  document.getElementById("goalText").textContent = `${goalMin} min productive`;
  const streak = computeStreak(buckets || {}, goalMin, /* @__PURE__ */ new Date());
  document.getElementById("streakText").textContent = streak > 0 ? `${streak} day${streak === 1 ? "" : "s"}` : "\u2014";
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
  const pauseUntil = snap[STORAGE_KEYS.pauseUntil];
  const pauseHint = document.getElementById("pauseHint");
  if (typeof pauseUntil === "number" && Date.now() < pauseUntil) {
    pauseHint.textContent = `Paused until ${fmtTime(pauseUntil)} \u2014 site time and study timer won\u2019t accrue.`;
  } else {
    pauseHint.textContent = "Skip counting time briefly (e.g. research rabbit holes).";
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
}
document.getElementById("btnStart").addEventListener("click", async () => {
  const sel = document.getElementById("pomodoroPreset");
  const v = sel.value;
  let pom;
  if (v) {
    const [w, b] = v.split(",").map((x) => Number(x));
    if (Number.isFinite(w) && Number.isFinite(b)) pom = { workMin: w, breakMin: b };
  }
  await chrome.runtime.sendMessage({
    type: "START_SESSION",
    label: pom ? "Pomodoro" : "Study",
    ...pom ? { pomodoro: pom } : {}
  });
  await refresh();
});
document.getElementById("btnStop").addEventListener("click", async () => {
  const note = window.prompt("Session note (optional):", "") ?? "";
  await chrome.runtime.sendMessage({ type: "STOP_SESSION", note });
  await refresh();
});
document.querySelectorAll("[data-pause]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const m = Number(btn.dataset.pause);
    await chrome.runtime.sendMessage({ type: "PAUSE_TRACKING", minutes: m });
    await refresh();
  });
});
document.getElementById("pauseClear").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_PAUSE" });
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
void refresh();
