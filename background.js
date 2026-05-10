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
  /** Block distraction URLs → Stay Focused page */
  focusModeEnabled: "focusModeEnabled",
  /** Stronger focus: no temporary override on blocked page */
  deepFocusEnabled: "deepFocusEnabled",
  /** Until this timestamp, distraction URLs are allowed (after override). */
  focusOverrideUntil: "focusOverrideUntil",
  /** How long an override lasts (minutes). */
  focusOverrideDurationMin: "focusOverrideDurationMin",
  /** Minimum minutes between override grants. */
  focusOverrideCooldownMin: "focusOverrideCooldownMin",
  /** Last time user granted an override (ms). */
  lastFocusOverrideAt: "lastFocusOverrideAt",
  /** Tab IDs pinned + injection for “locked” tabs */
  lockedTabIds: "lockedTabIds"
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
function parseRule(line) {
  const s = line.trim().toLowerCase().replace(/^www\./, "");
  if (!s) return { host: "", pathPrefix: null };
  const slash = s.indexOf("/");
  if (slash === -1) return { host: s, pathPrefix: null };
  return { host: s.slice(0, slash), pathPrefix: s.slice(slash) };
}
function hostMatchesRuleHost(h, ruleHost) {
  if (!ruleHost) return false;
  return h === ruleHost || h.endsWith("." + ruleHost);
}
function ruleMatchesUrl(url, ruleLine) {
  try {
    const u = new URL(url);
    const h = normalizeHost(u.hostname);
    const { host, pathPrefix } = parseRule(ruleLine);
    if (!host) return false;
    if (!hostMatchesRuleHost(h, host)) return false;
    if (pathPrefix == null) return true;
    return u.pathname.startsWith(pathPrefix);
  } catch {
    return false;
  }
}
function classifyUrl(url, productiveRules, distractionRules) {
  if (!url) return "neutral";
  const u = url.toLowerCase();
  if (u.startsWith("chrome://") || u.startsWith("edge://") || u.startsWith("about:") || u.startsWith("devtools:") || u.startsWith("chrome-extension:") || u.startsWith("moz-extension:") || u.startsWith("brave://")) {
    return "neutral";
  }
  if (u.startsWith("file:") || u.startsWith("blob:") || u.startsWith("data:")) {
    return "neutral";
  }
  try {
    new URL(url);
  } catch {
    return "neutral";
  }
  for (const r of productiveRules) {
    if (ruleMatchesUrl(url, r)) return "productive";
  }
  for (const r of distractionRules) {
    if (ruleMatchesUrl(url, r)) return "distraction";
  }
  return "neutral";
}

// src/lib/focusPolicy.ts
function isDistractionUrl(url, productiveRules, distractionRules) {
  return classifyUrl(url, productiveRules, distractionRules) === "distraction";
}

// src/lib/prune.ts
var RETENTION_DAYS = 800;
function filterOldDateKeys(keys, cutoffKey) {
  return keys.filter((k) => k >= cutoffKey);
}
function cutoffDateKey(anchor, days) {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// src/background.ts
var DEFAULT_PRODUCTIVE = [
  "github.com",
  "stackoverflow.com",
  "stackexchange.com",
  "coursera.org",
  "khanacademy.org",
  "notion.so",
  "wikipedia.org",
  "scholar.google.com",
  "arxiv.org"
];
var DEFAULT_DISTRACTION = [
  "youtube.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "reddit.com",
  "tiktok.com",
  "netflix.com",
  "twitch.tv"
];
var ALARM_HEARTBEAT = "heartbeat";
var ALARM_POMODORO = "pomodoro-phase";
var META_LAST_PRUNE = "_studyHeatmapLastPrune";
var DEFAULT_GOAL_MINUTES = 120;
var DEFAULT_WEEKLY_GOAL_MINUTES = 600;
var pulse = null;
var studyAnchorTs = Date.now();
var TAB_LOCK_MOUNT = "tab-lock-mount.js";
var TAB_LOCK_UNMOUNT = "tab-lock-unmount.js";
function extensionOriginPrefix() {
  return chrome.runtime.getURL("");
}
async function maybeRedirectBlockedTab(tabId, url) {
  if (!url || !url.startsWith("http://") && !url.startsWith("https://")) return;
  const ext = extensionOriginPrefix();
  if (url.startsWith(ext)) return;
  const st = await chrome.storage.local.get([
    STORAGE_KEYS.focusModeEnabled,
    STORAGE_KEYS.focusOverrideUntil
  ]);
  if (st[STORAGE_KEYS.focusModeEnabled] !== true) return;
  if (await isPaused()) return;
  const ou = st[STORAGE_KEYS.focusOverrideUntil];
  if (typeof ou === "number" && Date.now() < ou) return;
  const { productive, distraction } = await getLists();
  if (!isDistractionUrl(url, productive, distraction)) return;
  const blocked = chrome.runtime.getURL(`blocked.html?target=${encodeURIComponent(url)}`);
  try {
    const t = await chrome.tabs.get(tabId);
    const cur = t.url ?? "";
    if (cur.startsWith(ext) && cur.includes("blocked.html")) return;
    await chrome.tabs.update(tabId, { url: blocked });
  } catch {
  }
}
async function injectTabLock(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: [TAB_LOCK_MOUNT]
    });
  } catch {
  }
}
async function removeTabLockVisual(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: [TAB_LOCK_UNMOUNT]
    });
  } catch {
  }
}
async function reinjectLockIfNeeded(tabId) {
  const data = await chrome.storage.local.get(STORAGE_KEYS.lockedTabIds);
  const ids = data[STORAGE_KEYS.lockedTabIds] || [];
  if (ids.includes(tabId)) await injectTabLock(tabId);
}
async function migrateFocusDefaults() {
  const keys = [
    STORAGE_KEYS.focusModeEnabled,
    STORAGE_KEYS.deepFocusEnabled,
    STORAGE_KEYS.focusOverrideDurationMin,
    STORAGE_KEYS.focusOverrideCooldownMin,
    STORAGE_KEYS.lockedTabIds
  ];
  const cur = await chrome.storage.local.get([...keys]);
  const patch = {};
  if (typeof cur[STORAGE_KEYS.focusModeEnabled] !== "boolean")
    patch[STORAGE_KEYS.focusModeEnabled] = false;
  if (typeof cur[STORAGE_KEYS.deepFocusEnabled] !== "boolean")
    patch[STORAGE_KEYS.deepFocusEnabled] = false;
  if (typeof cur[STORAGE_KEYS.focusOverrideDurationMin] !== "number")
    patch[STORAGE_KEYS.focusOverrideDurationMin] = 10;
  if (typeof cur[STORAGE_KEYS.focusOverrideCooldownMin] !== "number")
    patch[STORAGE_KEYS.focusOverrideCooldownMin] = 30;
  if (!Array.isArray(cur[STORAGE_KEYS.lockedTabIds]))
    patch[STORAGE_KEYS.lockedTabIds] = [];
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
}
async function updateActionBadge() {
  try {
    const day = todayKey();
    const data = await chrome.storage.local.get(STORAGE_KEYS.dailyBuckets);
    const buckets = data[STORAGE_KEYS.dailyBuckets] || {};
    const row = buckets[day];
    const p = row?.productive ?? 0;
    const d = row?.distraction ?? 0;
    if (p + d < 60) {
      const mins = Math.floor(p / 60);
      chrome.action.setBadgeText({ text: mins > 0 ? String(Math.min(mins, 999)) : "" });
      chrome.action.setBadgeBackgroundColor({ color: mins > 0 ? "#16a34a" : "#27272a" });
      await chrome.action.setTitle({
        title: mins > 0 ? `Study Heatmap \xB7 ${mins}m productive today` : "Study Heatmap"
      });
      return;
    }
    const r = Math.round(100 * p / (p + d));
    const text = String(Math.min(r, 999));
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({
      color: r >= 55 ? "#16a34a" : r >= 40 ? "#52525b" : "#e11d48"
    });
    await chrome.action.setTitle({
      title: `Study Heatmap \xB7 ${r}% focus today`
    });
  } catch {
  }
}
async function isPaused() {
  const { [STORAGE_KEYS.pauseUntil]: until } = await chrome.storage.local.get(STORAGE_KEYS.pauseUntil);
  return typeof until === "number" && Date.now() < until;
}
async function getLists() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.productiveHosts,
    STORAGE_KEYS.distractionHosts
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
async function addSeconds(kind, seconds, host) {
  if (seconds <= 0) return;
  if (await isPaused()) return;
  const day = todayKey();
  const key = STORAGE_KEYS.dailyBuckets;
  const data = await chrome.storage.local.get(key);
  const buckets = data[key] || {};
  const row = buckets[day] || {
    productive: 0,
    distraction: 0,
    neutral: 0,
    study: 0
  };
  row[kind] = (row[kind] || 0) + seconds;
  buckets[day] = row;
  await chrome.storage.local.set({ [key]: buckets });
  void updateActionBadge();
  if (host) {
    const hk = STORAGE_KEYS.dailyByHost;
    const hdata = await chrome.storage.local.get(hk);
    const tree = hdata[hk] || {};
    const dayRow = tree[day] || {};
    const hr = dayRow[host] || { productive: 0, distraction: 0, neutral: 0 };
    hr[kind] = (hr[kind] || 0) + seconds;
    dayRow[host] = hr;
    tree[day] = dayRow;
    await chrome.storage.local.set({ [hk]: tree });
  }
}
async function addStudyOverlay(seconds) {
  if (seconds <= 0) return;
  if (await isPaused()) return;
  const day = todayKey();
  const key = STORAGE_KEYS.dailyBuckets;
  const data = await chrome.storage.local.get(key);
  const buckets = data[key] || {};
  const row = buckets[day] || {
    productive: 0,
    distraction: 0,
    neutral: 0,
    study: 0
  };
  row.study = (row.study || 0) + seconds;
  buckets[day] = row;
  await chrome.storage.local.set({ [key]: buckets });
  void updateActionBadge();
}
async function flushPulse() {
  if (!pulse) return;
  const now = Date.now();
  const deltaSec = Math.min(3600, Math.max(0, (now - pulse.ts) / 1e3));
  if (deltaSec > 0.5) {
    const host = hostnameFromUrl(pulse.url);
    await addSeconds(pulse.kind, deltaSec, host);
  }
  pulse.ts = now;
}
async function adoptTab(tab) {
  const { productive, distraction } = await getLists();
  await flushPulse();
  if (!tab.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("devtools:") || tab.url.startsWith("chrome-extension:") || tab.url.startsWith("about:")) {
    pulse = null;
    return;
  }
  const kind = classifyUrl(tab.url, productive, distraction);
  pulse = { ts: Date.now(), url: tab.url, kind, tabId: tab.id };
}
async function refreshActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) await adoptTab(tab);
  else pulse = null;
}
async function maybePrune() {
  const d = todayKey();
  const meta = await chrome.storage.local.get(META_LAST_PRUNE);
  if (meta[META_LAST_PRUNE] === d) return;
  const cutoff = cutoffDateKey(/* @__PURE__ */ new Date(), RETENTION_DAYS);
  const bk = STORAGE_KEYS.dailyBuckets;
  const buckets = (await chrome.storage.local.get(bk))[bk] || {};
  const next = {};
  for (const key of filterOldDateKeys(Object.keys(buckets), cutoff)) {
    next[key] = buckets[key];
  }
  const hk = STORAGE_KEYS.dailyByHost;
  const hosts = (await chrome.storage.local.get(hk))[hk] || {};
  const nextH = {};
  for (const key of filterOldDateKeys(Object.keys(hosts), cutoff)) {
    nextH[key] = hosts[key];
  }
  await chrome.storage.local.set({
    [bk]: next,
    [hk]: nextH,
    [META_LAST_PRUNE]: d
  });
}
async function schedulePomodoroAlarm(delayMs) {
  await chrome.alarms.clear(ALARM_POMODORO);
  const when = Date.now() + Math.max(1e3, delayMs);
  chrome.alarms.create(ALARM_POMODORO, { when });
}
async function clearPomodoro() {
  await chrome.alarms.clear(ALARM_POMODORO);
  await chrome.storage.local.remove(STORAGE_KEYS.pomodoroState);
}
async function startPomodoro(sessionId, workMin, breakMin) {
  const workSec = Math.max(1, workMin) * 60;
  const breakSec = Math.max(1, breakMin) * 60;
  const state = { sessionId, workSec, breakSec, isWork: true };
  await chrome.storage.local.set({ [STORAGE_KEYS.pomodoroState]: state });
  await schedulePomodoroAlarm(workSec * 1e3);
}
async function onPomodoroAlarm() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.pomodoroState,
    STORAGE_KEYS.activeSessionId,
    STORAGE_KEYS.pomodoroNotify
  ]);
  const st = data[STORAGE_KEYS.pomodoroState];
  const active = data[STORAGE_KEYS.activeSessionId];
  const notify = data[STORAGE_KEYS.pomodoroNotify] !== false;
  const canNotify = notify && await chrome.permissions.contains({ permissions: ["notifications"] });
  if (!st || !active || st.sessionId !== active) {
    await clearPomodoro();
    return;
  }
  const icon = chrome.runtime.getURL("icons/icon128.png");
  if (st.isWork) {
    if (canNotify) {
      try {
        await chrome.notifications.create({
          type: "basic",
          iconUrl: icon,
          title: "Study Heatmap",
          message: "Break time \u2014 short rest before the next focus block."
        });
      } catch {
      }
    }
    const next = { ...st, isWork: false };
    await chrome.storage.local.set({ [STORAGE_KEYS.pomodoroState]: next });
    await schedulePomodoroAlarm(next.breakSec * 1e3);
  } else {
    if (canNotify) {
      try {
        await chrome.notifications.create({
          type: "basic",
          iconUrl: icon,
          title: "Study Heatmap",
          message: "Focus block \u2014 time for the next work session."
        });
      } catch {
      }
    }
    const next = { ...st, isWork: true };
    await chrome.storage.local.set({ [STORAGE_KEYS.pomodoroState]: next });
    await schedulePomodoroAlarm(next.workSec * 1e3);
  }
}
chrome.runtime.onInstalled.addListener(async (details) => {
  await getLists();
  await migrateFocusDefaults();
  const goalData = await chrome.storage.local.get([
    STORAGE_KEYS.dailyGoalMinutes,
    STORAGE_KEYS.weeklyGoalMinutes
  ]);
  if (typeof goalData[STORAGE_KEYS.dailyGoalMinutes] !== "number") {
    await chrome.storage.local.set({ [STORAGE_KEYS.dailyGoalMinutes]: DEFAULT_GOAL_MINUTES });
  }
  if (typeof goalData[STORAGE_KEYS.weeklyGoalMinutes] !== "number") {
    await chrome.storage.local.set({
      [STORAGE_KEYS.weeklyGoalMinutes]: DEFAULT_WEEKLY_GOAL_MINUTES
    });
  }
  chrome.alarms.create(ALARM_HEARTBEAT, { periodInMinutes: 1 });
  await refreshActiveTab();
  void updateActionBadge();
  if (details.reason === "install") {
    const done = await chrome.storage.local.get(STORAGE_KEYS.onboardingDone);
    if (!done[STORAGE_KEYS.onboardingDone]) {
      const url = chrome.runtime.getURL("onboarding.html");
      await chrome.tabs.create({ url });
    }
  }
});
chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create(ALARM_HEARTBEAT, { periodInMinutes: 1 });
  await migrateFocusDefaults();
  await refreshActiveTab();
  void updateActionBadge();
});
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === ALARM_POMODORO) {
    await onPomodoroAlarm();
    return;
  }
  if (a.name !== ALARM_HEARTBEAT) return;
  await maybePrune();
  const now = Date.now();
  const idleState = await chrome.idle.queryState(60);
  const sid = (await chrome.storage.local.get(STORAGE_KEYS.activeSessionId))[STORAGE_KEYS.activeSessionId];
  if (sid && idleState === "active" && !await isPaused()) {
    const ds = Math.min(120, Math.max(0, (now - studyAnchorTs) / 1e3));
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
  void updateActionBadge();
});
async function handleSpaNavigation(tabId, url) {
  if (url == null) return;
  await maybeRedirectBlockedTab(tabId, url);
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.id !== tabId) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    await adoptTab(tab);
  } catch {
  }
}
chrome.webNavigation.onHistoryStateUpdated.addListener((d) => {
  if (d.frameId !== 0) return;
  void handleSpaNavigation(d.tabId, d.url);
});
chrome.webNavigation.onReferenceFragmentUpdated.addListener((d) => {
  if (d.frameId !== 0) return;
  void handleSpaNavigation(d.tabId, d.url);
});
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await reinjectLockIfNeeded(activeInfo.tabId);
  await refreshActiveTab();
});
chrome.webNavigation.onCommitted.addListener((d) => {
  if (d.frameId !== 0) return;
  if (!d.url.startsWith("http://") && !d.url.startsWith("https://")) return;
  void maybeRedirectBlockedTab(d.tabId, d.url);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    const data = await chrome.storage.local.get(STORAGE_KEYS.lockedTabIds);
    const ids = data[STORAGE_KEYS.lockedTabIds] || [];
    if (!ids.includes(tabId)) return;
    await chrome.storage.local.set({
      [STORAGE_KEYS.lockedTabIds]: ids.filter((x) => x !== tabId)
    });
  })();
});
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  const u = tab.url ?? tab.pendingUrl;
  await maybeRedirectBlockedTab(tabId, u);
  if (info.status === "complete") await reinjectLockIfNeeded(tabId);
  if (info.status === "complete" || info.url) {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (active?.id === tabId) await adoptTab(tab);
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
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  void (async () => {
    if (msg?.type === "START_SESSION") {
      const data = await chrome.storage.local.get(STORAGE_KEYS.sessions);
      const sessions = data[STORAGE_KEYS.sessions] || [];
      const id = `${Date.now()}`;
      const start = Date.now();
      const label = msg.label || "Study";
      const workMin = msg.pomodoro?.workMin;
      const breakMin = msg.pomodoro?.breakMin;
      const s = {
        id,
        start,
        end: null,
        label,
        ...workMin != null && breakMin != null ? { pomodoroWorkMin: workMin, pomodoroBreakMin: breakMin } : {}
      };
      sessions.push(s);
      studyAnchorTs = Date.now();
      await chrome.storage.local.set({
        [STORAGE_KEYS.sessions]: sessions,
        [STORAGE_KEYS.activeSessionId]: id
      });
      if (workMin != null && breakMin != null) {
        await startPomodoro(id, workMin, breakMin);
      } else {
        await clearPomodoro();
      }
      sendResponse({ ok: true, id });
    } else if (msg?.type === "STOP_SESSION") {
      const data = await chrome.storage.local.get([
        STORAGE_KEYS.sessions,
        STORAGE_KEYS.activeSessionId
      ]);
      let sessions = data[STORAGE_KEYS.sessions] || [];
      const activeId = data[STORAGE_KEYS.activeSessionId];
      const s = sessions.find((x) => x.id === activeId);
      if (s) {
        s.end = Date.now();
        const note = msg.note;
        if (note && note.trim()) s.note = note.trim();
      }
      if (sessions.length > 400) sessions = sessions.slice(-400);
      await clearPomodoro();
      await chrome.storage.local.set({
        [STORAGE_KEYS.sessions]: sessions,
        [STORAGE_KEYS.activeSessionId]: null
      });
      sendResponse({ ok: true });
    } else if (msg?.type === "PAUSE_TRACKING") {
      const minutes = Math.max(1, Math.min(480, Number(msg.minutes) || 15));
      const until = Date.now() + minutes * 60 * 1e3;
      await flushPulse();
      await chrome.storage.local.set({ [STORAGE_KEYS.pauseUntil]: until });
      sendResponse({ ok: true, until });
    } else if (msg?.type === "CLEAR_PAUSE") {
      await chrome.storage.local.remove(STORAGE_KEYS.pauseUntil);
      sendResponse({ ok: true });
    } else if (msg?.type === "GET_SNAPSHOT") {
      const idleState = await chrome.idle.queryState(60);
      if (idleState === "active") {
        if (pulse) await flushPulse();
        const sid = (await chrome.storage.local.get(STORAGE_KEYS.activeSessionId))[STORAGE_KEYS.activeSessionId];
        if (sid && !await isPaused()) {
          const now = Date.now();
          const ds = Math.min(120, Math.max(0, (now - studyAnchorTs) / 1e3));
          if (ds >= 1) {
            await addStudyOverlay(ds);
            studyAnchorTs = now;
          }
        }
      }
      const keys = [
        STORAGE_KEYS.dailyBuckets,
        STORAGE_KEYS.dailyByHost,
        STORAGE_KEYS.sessions,
        STORAGE_KEYS.activeSessionId,
        STORAGE_KEYS.productiveHosts,
        STORAGE_KEYS.distractionHosts,
        STORAGE_KEYS.pauseUntil,
        STORAGE_KEYS.dailyGoalMinutes,
        STORAGE_KEYS.weeklyGoalMinutes,
        STORAGE_KEYS.pomodoroState,
        STORAGE_KEYS.pomodoroNotify,
        STORAGE_KEYS.focusModeEnabled,
        STORAGE_KEYS.deepFocusEnabled,
        STORAGE_KEYS.focusOverrideUntil,
        STORAGE_KEYS.focusOverrideDurationMin,
        STORAGE_KEYS.focusOverrideCooldownMin,
        STORAGE_KEYS.lockedTabIds
      ];
      const snap = await chrome.storage.local.get(keys);
      void updateActionBadge();
      sendResponse(snap);
    } else if (msg?.type === "GET_FOCUS_BLOCK_UI") {
      const now = Date.now();
      const data = await chrome.storage.local.get([
        STORAGE_KEYS.deepFocusEnabled,
        STORAGE_KEYS.focusOverrideUntil,
        STORAGE_KEYS.focusOverrideCooldownMin,
        STORAGE_KEYS.focusOverrideDurationMin,
        STORAGE_KEYS.lastFocusOverrideAt
      ]);
      const deepFocus = data[STORAGE_KEYS.deepFocusEnabled] === true;
      const ou = data[STORAGE_KEYS.focusOverrideUntil];
      const overrideActive = typeof ou === "number" && now < ou;
      const cooldownMin = typeof data[STORAGE_KEYS.focusOverrideCooldownMin] === "number" ? data[STORAGE_KEYS.focusOverrideCooldownMin] : 30;
      const durationMin = typeof data[STORAGE_KEYS.focusOverrideDurationMin] === "number" ? data[STORAGE_KEYS.focusOverrideDurationMin] : 10;
      const lastAt = data[STORAGE_KEYS.lastFocusOverrideAt];
      let cooldownRemainingMs = 0;
      if (!overrideActive && typeof lastAt === "number") {
        const need = cooldownMin * 60 * 1e3;
        cooldownRemainingMs = Math.max(0, lastAt + need - now);
      }
      sendResponse({
        deepFocus,
        overrideActive,
        cooldownRemainingMs,
        cooldownMin,
        durationMin
      });
    } else if (msg?.type === "FOCUS_OVERRIDE_AND_GO") {
      const target = msg.target;
      const tabId = _sender.tab?.id;
      const deep = (await chrome.storage.local.get(STORAGE_KEYS.deepFocusEnabled))[STORAGE_KEYS.deepFocusEnabled] === true;
      if (deep) {
        sendResponse({ ok: false, reason: "deep_focus" });
        return;
      }
      if (!target.startsWith("http://") && !target.startsWith("https://")) {
        sendResponse({ ok: false, reason: "bad_target" });
        return;
      }
      const data = await chrome.storage.local.get([
        STORAGE_KEYS.focusOverrideCooldownMin,
        STORAGE_KEYS.focusOverrideDurationMin,
        STORAGE_KEYS.lastFocusOverrideAt,
        STORAGE_KEYS.focusOverrideUntil
      ]);
      const now = Date.now();
      const ou = data[STORAGE_KEYS.focusOverrideUntil];
      if (typeof ou === "number" && now < ou) {
        if (tabId != null) await chrome.tabs.update(tabId, { url: target });
        sendResponse({ ok: true });
        return;
      }
      const cooldownMin = typeof data[STORAGE_KEYS.focusOverrideCooldownMin] === "number" ? data[STORAGE_KEYS.focusOverrideCooldownMin] : 30;
      const durationMin = typeof data[STORAGE_KEYS.focusOverrideDurationMin] === "number" ? data[STORAGE_KEYS.focusOverrideDurationMin] : 10;
      const lastAt = data[STORAGE_KEYS.lastFocusOverrideAt];
      if (typeof lastAt === "number" && now - lastAt < cooldownMin * 60 * 1e3) {
        sendResponse({ ok: false, reason: "cooldown" });
        return;
      }
      await chrome.storage.local.set({
        [STORAGE_KEYS.focusOverrideUntil]: now + durationMin * 60 * 1e3,
        [STORAGE_KEYS.lastFocusOverrideAt]: now
      });
      if (tabId != null) await chrome.tabs.update(tabId, { url: target });
      sendResponse({ ok: true });
    } else if (msg?.type === "SET_TAB_LOCK") {
      const tabId = msg.tabId;
      const locked = msg.locked === true;
      const data = await chrome.storage.local.get(STORAGE_KEYS.lockedTabIds);
      const set = new Set(data[STORAGE_KEYS.lockedTabIds] || []);
      if (locked) {
        set.add(tabId);
        try {
          await chrome.tabs.update(tabId, { pinned: true });
        } catch {
        }
        await injectTabLock(tabId);
      } else {
        set.delete(tabId);
        await removeTabLockVisual(tabId);
        try {
          await chrome.tabs.update(tabId, { pinned: false });
        } catch {
        }
      }
      await chrome.storage.local.set({ [STORAGE_KEYS.lockedTabIds]: [...set] });
      sendResponse({ ok: true });
    } else if (msg?.type === "ADD_HOST_RULE") {
      const list = msg.list;
      const raw = msg.host?.trim().toLowerCase().replace(/^www\./, "") ?? "";
      const host = raw.split("/")[0] ?? "";
      if (!host || list !== "productive" && list !== "distraction") {
        sendResponse({ ok: false, error: "invalid" });
        return;
      }
      const key = list === "productive" ? STORAGE_KEYS.productiveHosts : STORAGE_KEYS.distractionHosts;
      const data = await chrome.storage.local.get(key);
      const arr = (data[key] || []).slice();
      if (!arr.includes(host)) {
        arr.push(host);
        arr.sort();
        await chrome.storage.local.set({ [key]: arr });
      }
      sendResponse({ ok: true });
    } else if (msg?.type === "COMPLETE_ONBOARDING") {
      await chrome.storage.local.set({ [STORAGE_KEYS.onboardingDone]: true });
      sendResponse({ ok: true });
    } else {
      sendResponse(null);
    }
  })();
  return true;
});
