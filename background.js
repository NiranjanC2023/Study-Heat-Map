import {
  STORAGE_KEYS,
  todayKey,
  hostnameFromUrl,
  classifyHost,
} from "./shared.js";

const DEFAULT_PRODUCTIVE = [
  "github.com",
  "stackoverflow.com",
  "stackexchange.com",
  "coursera.org",
  "khanacademy.org",
  "notion.so",
  "wikipedia.org",
  "scholar.google.com",
  "arxiv.org",
];

const DEFAULT_DISTRACTION = [
  "youtube.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "reddit.com",
  "tiktok.com",
  "netflix.com",
  "twitch.tv",
];

const ALARM_HEARTBEAT = "heartbeat";

/** @type {{ ts: number, host: string, kind: string, tabId: number } | null} */
let pulse = null;

/** Wall-clock anchor for study-session overlay (counts any focused Chrome time while session is on). */
let studyAnchorTs = Date.now();

async function getLists() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.productiveHosts,
    STORAGE_KEYS.distractionHosts,
  ]);
  let productive = data[STORAGE_KEYS.productiveHosts];
  let distraction = data[STORAGE_KEYS.distractionHosts];
  if (!Array.isArray(productive) || productive.length === 0) {
    productive = [...DEFAULT_PRODUCTIVE];
    await chrome.storage.local.set({ [STORAGE_KEYS.productiveHosts]: productive });
  }
  if (!Array.isArray(distraction) || distraction.length === 0) {
    distraction = [...DEFAULT_DISTRACTION];
    await chrome.storage.local.set({ [STORAGE_KEYS.distractionHosts]: distraction });
  }
  return { productive, distraction };
}

/** @param {number} seconds */
async function addSeconds(kind, seconds) {
  if (seconds <= 0) return;
  const day = todayKey();
  const key = STORAGE_KEYS.dailyBuckets;
  const data = await chrome.storage.local.get(key);
  const buckets = data[key] || {};
  const row = buckets[day] || { productive: 0, distraction: 0, neutral: 0, study: 0 };
  row[kind] = (row[kind] || 0) + seconds;
  buckets[day] = row;
  await chrome.storage.local.set({ [key]: buckets });
}

/** @param {number} seconds */
async function addStudyOverlay(seconds) {
  if (seconds <= 0) return;
  const day = todayKey();
  const key = STORAGE_KEYS.dailyBuckets;
  const data = await chrome.storage.local.get(key);
  const buckets = data[key] || {};
  const row = buckets[day] || { productive: 0, distraction: 0, neutral: 0, study: 0 };
  row.study = (row.study || 0) + seconds;
  buckets[day] = row;
  await chrome.storage.local.set({ [key]: buckets });
}

async function flushPulse() {
  if (!pulse) return;
  const now = Date.now();
  const deltaSec = Math.min(3600, Math.max(0, (now - pulse.ts) / 1000));
  if (deltaSec > 0.5) {
    await addSeconds(pulse.kind, deltaSec);
  }
  pulse.ts = now;
}

/**
 * @param {chrome.tabs.Tab} tab
 */
async function adoptTab(tab) {
  const { productive, distraction } = await getLists();
  await flushPulse();
  if (!tab?.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) {
    pulse = null;
    return;
  }
  const host = hostnameFromUrl(tab.url);
  const kind = classifyHost(host, productive, distraction);
  pulse = { ts: Date.now(), host, kind, tabId: tab.id };
}

async function refreshActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) await adoptTab(tab);
  else pulse = null;
}

chrome.runtime.onInstalled.addListener(async () => {
  await getLists();
  chrome.alarms.create(ALARM_HEARTBEAT, { periodInMinutes: 1 });
  await refreshActiveTab();
});

chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create(ALARM_HEARTBEAT, { periodInMinutes: 1 });
  await refreshActiveTab();
});

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== ALARM_HEARTBEAT) return;
  const now = Date.now();
  const idleState = await chrome.idle.queryState(60);
  const sid = (await chrome.storage.local.get(STORAGE_KEYS.activeSessionId))[
    STORAGE_KEYS.activeSessionId
  ];
  if (sid && idleState === "active") {
    const ds = Math.min(120, Math.max(0, (now - studyAnchorTs) / 1000));
    if (ds >= 30) await addStudyOverlay(ds);
    studyAnchorTs = now;
  } else {
    studyAnchorTs = now;
  }
  if (idleState !== "active") {
    await flushPulse();
    pulse = null;
    return;
  }
  if (pulse) await flushPulse();
});

chrome.tabs.onActivated.addListener(async () => {
  await refreshActiveTab();
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status === "complete" || info.url) {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (active && active.id === tabId) await adoptTab(tab);
  }
});

chrome.windows.onFocusChanged.addListener(async (winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE) {
    await flushPulse();
    pulse = null;
    studyAnchorTs = Date.now();
    return;
  }
  await refreshActiveTab();
});

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state !== "active") {
    await flushPulse();
    pulse = null;
    studyAnchorTs = Date.now();
  } else {
    studyAnchorTs = Date.now();
    await refreshActiveTab();
  }
});

chrome.idle.setDetectionInterval(60);

/** Study session controls */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "START_SESSION") {
      const data = await chrome.storage.local.get(STORAGE_KEYS.sessions);
      const sessions = data[STORAGE_KEYS.sessions] || [];
      const id = `${Date.now()}`;
      const start = Date.now();
      sessions.push({ id, start, end: null, label: msg.label || "Study" });
      studyAnchorTs = Date.now();
      await chrome.storage.local.set({
        [STORAGE_KEYS.sessions]: sessions,
        [STORAGE_KEYS.activeSessionId]: id,
      });
      sendResponse({ ok: true, id });
    } else if (msg?.type === "STOP_SESSION") {
      const data = await chrome.storage.local.get([
        STORAGE_KEYS.sessions,
        STORAGE_KEYS.activeSessionId,
      ]);
      let sessions = data[STORAGE_KEYS.sessions] || [];
      const activeId = data[STORAGE_KEYS.activeSessionId];
      const s = sessions.find((x) => x.id === activeId);
      if (s) s.end = Date.now();
      if (sessions.length > 400) sessions = sessions.slice(-400);
      await chrome.storage.local.set({
        [STORAGE_KEYS.sessions]: sessions,
        [STORAGE_KEYS.activeSessionId]: null,
      });
      sendResponse({ ok: true });
    } else if (msg?.type === "GET_SNAPSHOT") {
      const keys = [
        STORAGE_KEYS.dailyBuckets,
        STORAGE_KEYS.sessions,
        STORAGE_KEYS.activeSessionId,
        STORAGE_KEYS.productiveHosts,
        STORAGE_KEYS.distractionHosts,
      ];
      const snap = await chrome.storage.local.get(keys);
      sendResponse(snap);
    } else {
      sendResponse(null);
    }
  })();
  return true;
});
