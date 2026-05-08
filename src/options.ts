import { STORAGE_KEYS } from "./lib/storageKeys";

function parseList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim().toLowerCase().replace(/^www\./, ""))
    .filter(Boolean);
}

async function syncNotifyWarning(): Promise<void> {
  const warn = document.getElementById("notifyWarn")!;
  const box = document.getElementById("pomodoroNotify") as HTMLInputElement;
  const has = await chrome.permissions.contains({ permissions: ["notifications"] });
  if (box.checked && !has) {
    warn.hidden = false;
    warn.textContent =
      "Pomodoro alerts are enabled in settings, but Chrome has not granted notifications yet. Click Save to request permission.";
  } else {
    warn.hidden = true;
    warn.textContent = "";
  }
}

async function load(): Promise<void> {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.productiveHosts,
    STORAGE_KEYS.distractionHosts,
    STORAGE_KEYS.dailyGoalMinutes,
    STORAGE_KEYS.weeklyGoalMinutes,
    STORAGE_KEYS.pomodoroNotify,
    STORAGE_KEYS.focusModeEnabled,
    STORAGE_KEYS.focusModeOverrideCooldownMs,
    STORAGE_KEYS.focusModeOverrideDuration,
  ]);
  const p = (data[STORAGE_KEYS.productiveHosts] as string[]) || [];
  const d = (data[STORAGE_KEYS.distractionHosts] as string[]) || [];
  (document.getElementById("productive") as HTMLTextAreaElement).value = p.join("\n");
  (document.getElementById("distraction") as HTMLTextAreaElement).value = d.join("\n");
  const goal =
    typeof data[STORAGE_KEYS.dailyGoalMinutes] === "number"
      ? (data[STORAGE_KEYS.dailyGoalMinutes] as number)
      : 120;
  (document.getElementById("dailyGoal") as HTMLInputElement).value = String(goal);
  const wgoal =
    typeof data[STORAGE_KEYS.weeklyGoalMinutes] === "number"
      ? (data[STORAGE_KEYS.weeklyGoalMinutes] as number)
      : 600;
  (document.getElementById("weeklyGoal") as HTMLInputElement).value = String(wgoal);
  const notify = data[STORAGE_KEYS.pomodoroNotify] !== false;
  (document.getElementById("pomodoroNotify") as HTMLInputElement).checked = notify;
  
  // Load Focus Mode settings
  const focusEnabled = data[STORAGE_KEYS.focusModeEnabled] === true;
  (document.getElementById("focusModeEnabled") as HTMLInputElement).checked = focusEnabled;
  
  const cooldownMs = (data[STORAGE_KEYS.focusModeOverrideCooldownMs] as number) || 5 * 60 * 1000;
  (document.getElementById("focusModeCooldown") as HTMLInputElement).value = String(
    Math.round(cooldownMs / 60000)
  );
  
  const durationMs = (data[STORAGE_KEYS.focusModeOverrideDuration] as number) || 15 * 60 * 1000;
  (document.getElementById("focusModeOverrideDuration") as HTMLInputElement).value = String(
    Math.round(durationMs / 60000)
  );
  
  await syncNotifyWarning();
}

(document.getElementById("pomodoroNotify") as HTMLInputElement).addEventListener("change", () => {
  void syncNotifyWarning();
});

document.getElementById("save")!.addEventListener("click", async () => {
  const productive = parseList((document.getElementById("productive") as HTMLTextAreaElement).value);
  const distraction = parseList(
    (document.getElementById("distraction") as HTMLTextAreaElement).value
  );
  const goal = Math.max(
    1,
    Math.min(1440, Number((document.getElementById("dailyGoal") as HTMLInputElement).value) || 120)
  );
  const weeklyGoal = Math.max(
    1,
    Math.min(10080, Number((document.getElementById("weeklyGoal") as HTMLInputElement).value) || 600)
  );
  let pomodoroNotify = (document.getElementById("pomodoroNotify") as HTMLInputElement).checked;
  const st = document.getElementById("status")!;

  // Get Focus Mode settings
  const focusEnabled = (document.getElementById("focusModeEnabled") as HTMLInputElement).checked;
  const cooldownMin = Math.max(
    1,
    Math.min(120, Number((document.getElementById("focusModeCooldown") as HTMLInputElement).value) || 5)
  );
  const durationMin = Math.max(
    1,
    Math.min(120, Number((document.getElementById("focusModeOverrideDuration") as HTMLInputElement).value) || 15)
  );

  if (pomodoroNotify) {
    const granted = await chrome.permissions.request({ permissions: ["notifications"] });
    if (!granted) {
      pomodoroNotify = false;
      (document.getElementById("pomodoroNotify") as HTMLInputElement).checked = false;
      st.textContent = "Notifications not granted — Pomodoro alerts saved as off.";
      st.className = "status";
      await chrome.storage.local.set({
        [STORAGE_KEYS.productiveHosts]: productive,
        [STORAGE_KEYS.distractionHosts]: distraction,
        [STORAGE_KEYS.dailyGoalMinutes]: goal,
        [STORAGE_KEYS.weeklyGoalMinutes]: weeklyGoal,
        [STORAGE_KEYS.pomodoroNotify]: false,
        [STORAGE_KEYS.focusModeEnabled]: focusEnabled,
        [STORAGE_KEYS.focusModeBlockedSites]: distraction,
        [STORAGE_KEYS.focusModeOverrideCooldownMs]: cooldownMin * 60000,
        [STORAGE_KEYS.focusModeOverrideDuration]: durationMin * 60000,
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
    [STORAGE_KEYS.focusModeOverrideCooldownMs]: cooldownMin * 60000,
    [STORAGE_KEYS.focusModeOverrideDuration]: durationMin * 60000,
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
