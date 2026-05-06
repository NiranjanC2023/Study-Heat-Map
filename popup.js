import { STORAGE_KEYS, todayKey } from "./shared.js";

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
  return Math.round((100 * p) / t);
}

async function refresh() {
  const snap = await chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" });
  const day = todayKey();
  const row = snap[STORAGE_KEYS.dailyBuckets]?.[day] || {};

  document.getElementById("todayProd").textContent = fmtDuration(row.productive || 0);
  document.getElementById("todayDist").textContent = fmtDuration(row.distraction || 0);
  const r = focusRatio(row);
  const ratioEl = document.getElementById("todayRatio");
  if (r == null) {
    ratioEl.textContent = "—";
    ratioEl.style.color = "";
  } else {
    ratioEl.textContent = `${r}%`;
    ratioEl.style.color = r >= 55 ? "var(--good)" : r >= 40 ? "var(--text)" : "var(--bad)";
  }

  const activeId = snap[STORAGE_KEYS.activeSessionId];
  const status = document.getElementById("sessionStatus");
  const start = document.getElementById("btnStart");
  const stop = document.getElementById("btnStop");
  if (activeId) {
    status.textContent = "Session running";
    status.className = "pill live";
    start.disabled = true;
    stop.disabled = false;
  } else {
    status.textContent = "No active session";
    status.className = "pill idle";
    start.disabled = false;
    stop.disabled = true;
  }
}

document.getElementById("btnStart").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "START_SESSION", label: "Study" });
  await refresh();
});

document.getElementById("btnStop").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "STOP_SESSION" });
  await refresh();
});

document.getElementById("openDash").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

document.getElementById("openOpts").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refresh();
