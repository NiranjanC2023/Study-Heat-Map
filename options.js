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
    STORAGE_KEYS.pomodoroNotify,
    STORAGE_KEYS.focusModeEnabled,
    STORAGE_KEYS.focusModeOverrideCooldownMs,
    STORAGE_KEYS.focusModeOverrideDuration
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
  const focusEnabled = data[STORAGE_KEYS.focusModeEnabled] === true;
  document.getElementById("focusModeEnabled").checked = focusEnabled;
  const cooldownMs = data[STORAGE_KEYS.focusModeOverrideCooldownMs] || 5 * 60 * 1e3;
  document.getElementById("focusModeCooldown").value = String(
    Math.round(cooldownMs / 6e4)
  );
  const durationMs = data[STORAGE_KEYS.focusModeOverrideDuration] || 15 * 60 * 1e3;
  document.getElementById("focusModeOverrideDuration").value = String(
    Math.round(durationMs / 6e4)
  );
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
  const focusEnabled = document.getElementById("focusModeEnabled").checked;
  const cooldownMin = Math.max(
    1,
    Math.min(120, Number(document.getElementById("focusModeCooldown").value) || 5)
  );
  const durationMin = Math.max(
    1,
    Math.min(120, Number(document.getElementById("focusModeOverrideDuration").value) || 15)
  );
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
        [STORAGE_KEYS.pomodoroNotify]: false,
        [STORAGE_KEYS.focusModeEnabled]: focusEnabled,
        [STORAGE_KEYS.focusModeBlockedSites]: distraction,
        [STORAGE_KEYS.focusModeOverrideCooldownMs]: cooldownMin * 6e4,
        [STORAGE_KEYS.focusModeOverrideDuration]: durationMin * 6e4
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
    [STORAGE_KEYS.pomodoroNotify]: pomodoroNotify,
    [STORAGE_KEYS.focusModeEnabled]: focusEnabled,
    [STORAGE_KEYS.focusModeBlockedSites]: distraction,
    [STORAGE_KEYS.focusModeOverrideCooldownMs]: cooldownMin * 6e4,
    [STORAGE_KEYS.focusModeOverrideDuration]: durationMin * 6e4
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
