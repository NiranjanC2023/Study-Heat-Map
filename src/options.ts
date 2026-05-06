import { STORAGE_KEYS } from "./lib/storageKeys";

function parseList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim().toLowerCase().replace(/^www\./, ""))
    .filter(Boolean);
}

async function load(): Promise<void> {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.productiveHosts,
    STORAGE_KEYS.distractionHosts,
    STORAGE_KEYS.dailyGoalMinutes,
    STORAGE_KEYS.pomodoroNotify,
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
  const notify = data[STORAGE_KEYS.pomodoroNotify] !== false;
  (document.getElementById("pomodoroNotify") as HTMLInputElement).checked = notify;
}

document.getElementById("save")!.addEventListener("click", async () => {
  const productive = parseList((document.getElementById("productive") as HTMLTextAreaElement).value);
  const distraction = parseList(
    (document.getElementById("distraction") as HTMLTextAreaElement).value
  );
  const goal = Math.max(1, Math.min(1440, Number((document.getElementById("dailyGoal") as HTMLInputElement).value) || 120));
  const pomodoroNotify = (document.getElementById("pomodoroNotify") as HTMLInputElement).checked;
  await chrome.storage.local.set({
    [STORAGE_KEYS.productiveHosts]: productive,
    [STORAGE_KEYS.distractionHosts]: distraction,
    [STORAGE_KEYS.dailyGoalMinutes]: goal,
    [STORAGE_KEYS.pomodoroNotify]: pomodoroNotify,
  });
  const st = document.getElementById("status")!;
  st.textContent = "Saved.";
  st.className = "status ok";
  setTimeout(() => {
    st.textContent = "";
    st.className = "status";
  }, 3200);
});

void load();
