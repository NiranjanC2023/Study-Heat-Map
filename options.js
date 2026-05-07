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
  pomodoroState: "pomodoroState"
};

// src/options.ts
function parseList(text) {
  return text.split(/\r?\n/).map((s) => s.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean);
}
async function syncNotifyWarning() {
  const warn = document.getElementById("notifyWarn");
  const box = document.getElementById("pomodoroNotify");
  const has = await chrome.permissions.contains({ permissions: ["notifications"] });
  if (box.checked && !has) {
    warn.hidden = false;
    warn.textContent = "Pomodoro alerts are enabled in settings, but Chrome has not granted notifications yet. Click Save to request permission.";
  } else {
    warn.hidden = true;
    warn.textContent = "";
  }
}
async function load() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.productiveHosts,
    STORAGE_KEYS.distractionHosts,
    STORAGE_KEYS.dailyGoalMinutes,
    STORAGE_KEYS.weeklyGoalMinutes,
    STORAGE_KEYS.pomodoroNotify
  ]);
  const p = data[STORAGE_KEYS.productiveHosts] || [];
  const d = data[STORAGE_KEYS.distractionHosts] || [];
  document.getElementById("productive").value = p.join("\n");
  document.getElementById("distraction").value = d.join("\n");
  const goal = typeof data[STORAGE_KEYS.dailyGoalMinutes] === "number" ? data[STORAGE_KEYS.dailyGoalMinutes] : 120;
  document.getElementById("dailyGoal").value = String(goal);
  const wgoal = typeof data[STORAGE_KEYS.weeklyGoalMinutes] === "number" ? data[STORAGE_KEYS.weeklyGoalMinutes] : 600;
  document.getElementById("weeklyGoal").value = String(wgoal);
  const notify = data[STORAGE_KEYS.pomodoroNotify] !== false;
  document.getElementById("pomodoroNotify").checked = notify;
  await syncNotifyWarning();
}
document.getElementById("pomodoroNotify").addEventListener("change", () => {
  void syncNotifyWarning();
});
document.getElementById("save").addEventListener("click", async () => {
  const productive = parseList(document.getElementById("productive").value);
  const distraction = parseList(
    document.getElementById("distraction").value
  );
  const goal = Math.max(
    1,
    Math.min(1440, Number(document.getElementById("dailyGoal").value) || 120)
  );
  const weeklyGoal = Math.max(
    1,
    Math.min(10080, Number(document.getElementById("weeklyGoal").value) || 600)
  );
  let pomodoroNotify = document.getElementById("pomodoroNotify").checked;
  const st = document.getElementById("status");
  if (pomodoroNotify) {
    const granted = await chrome.permissions.request({ permissions: ["notifications"] });
    if (!granted) {
      pomodoroNotify = false;
      document.getElementById("pomodoroNotify").checked = false;
      st.textContent = "Notifications not granted \u2014 Pomodoro alerts saved as off.";
      st.className = "status";
      await chrome.storage.local.set({
        [STORAGE_KEYS.productiveHosts]: productive,
        [STORAGE_KEYS.distractionHosts]: distraction,
        [STORAGE_KEYS.dailyGoalMinutes]: goal,
        [STORAGE_KEYS.weeklyGoalMinutes]: weeklyGoal,
        [STORAGE_KEYS.pomodoroNotify]: false
      });
      await syncNotifyWarning();
      setTimeout(() => {
        st.textContent = "";
      }, 4200);
      return;
    }
  }
  await chrome.storage.local.set({
    [STORAGE_KEYS.productiveHosts]: productive,
    [STORAGE_KEYS.distractionHosts]: distraction,
    [STORAGE_KEYS.dailyGoalMinutes]: goal,
    [STORAGE_KEYS.weeklyGoalMinutes]: weeklyGoal,
    [STORAGE_KEYS.pomodoroNotify]: pomodoroNotify
  });
  st.textContent = "Saved.";
  st.className = "status ok";
  await syncNotifyWarning();
  setTimeout(() => {
    st.textContent = "";
    st.className = "status";
  }, 3200);
});
void load();
