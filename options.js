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

// src/options.ts
function parseList(text) {
  return text.split(/\r?\n/).map((s) => s.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean);
}
async function load() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.productiveHosts,
    STORAGE_KEYS.distractionHosts,
    STORAGE_KEYS.dailyGoalMinutes,
    STORAGE_KEYS.pomodoroNotify
  ]);
  const p = data[STORAGE_KEYS.productiveHosts] || [];
  const d = data[STORAGE_KEYS.distractionHosts] || [];
  document.getElementById("productive").value = p.join("\n");
  document.getElementById("distraction").value = d.join("\n");
  const goal = typeof data[STORAGE_KEYS.dailyGoalMinutes] === "number" ? data[STORAGE_KEYS.dailyGoalMinutes] : 120;
  document.getElementById("dailyGoal").value = String(goal);
  const notify = data[STORAGE_KEYS.pomodoroNotify] !== false;
  document.getElementById("pomodoroNotify").checked = notify;
}
document.getElementById("save").addEventListener("click", async () => {
  const productive = parseList(document.getElementById("productive").value);
  const distraction = parseList(
    document.getElementById("distraction").value
  );
  const goal = Math.max(1, Math.min(1440, Number(document.getElementById("dailyGoal").value) || 120));
  const pomodoroNotify = document.getElementById("pomodoroNotify").checked;
  await chrome.storage.local.set({
    [STORAGE_KEYS.productiveHosts]: productive,
    [STORAGE_KEYS.distractionHosts]: distraction,
    [STORAGE_KEYS.dailyGoalMinutes]: goal,
    [STORAGE_KEYS.pomodoroNotify]: pomodoroNotify
  });
  const st = document.getElementById("status");
  st.textContent = "Saved.";
  st.className = "status ok";
  setTimeout(() => {
    st.textContent = "";
    st.className = "status";
  }, 3200);
});
void load();
