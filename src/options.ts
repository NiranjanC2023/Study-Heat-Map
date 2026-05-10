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
    STORAGE_KEYS.focusOverrideDurationMin,
    STORAGE_KEYS.focusOverrideCooldownMin,
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
  const od =
    typeof data[STORAGE_KEYS.focusOverrideDurationMin] === "number"
      ? (data[STORAGE_KEYS.focusOverrideDurationMin] as number)
      : 10;
  const oc =
    typeof data[STORAGE_KEYS.focusOverrideCooldownMin] === "number"
      ? (data[STORAGE_KEYS.focusOverrideCooldownMin] as number)
      : 30;
  (document.getElementById("focusOverrideDuration") as HTMLInputElement).value = String(od);
  (document.getElementById("focusOverrideCooldown") as HTMLInputElement).value = String(oc);
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
  const ovDur = Math.max(
    1,
    Math.min(180, Number((document.getElementById("focusOverrideDuration") as HTMLInputElement).value) || 10)
  );
  const ovCool = Math.max(
    1,
    Math.min(720, Number((document.getElementById("focusOverrideCooldown") as HTMLInputElement).value) || 30)
  );
  const st = document.getElementById("status")!;

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
        [STORAGE_KEYS.focusOverrideDurationMin]: ovDur,
        [STORAGE_KEYS.focusOverrideCooldownMin]: ovCool,
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
    [STORAGE_KEYS.focusOverrideDurationMin]: ovDur,
    [STORAGE_KEYS.focusOverrideCooldownMin]: ovCool,
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
