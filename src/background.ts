import { STORAGE_KEYS } from "./lib/storageKeys";
import { todayKey } from "./lib/dates";
import { classifyUrl, hostnameFromUrl, type SiteKind } from "./lib/classify";
import { cutoffDateKey, filterOldDateKeys, RETENTION_DAYS } from "./lib/prune";
import type { DailyRow, HostDayRow, PomodoroState, Pulse, Session } from "./lib/types";

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
const ALARM_POMODORO = "pomodoro-phase";
const META_LAST_PRUNE = "_studyHeatmapLastPrune";

const DEFAULT_GOAL_MINUTES = 120;
const DEFAULT_WEEKLY_GOAL_MINUTES = 600;

let pulse: Pulse | null = null;
let studyAnchorTs = Date.now();

async function updateActionBadge(): Promise<void> {
  try {
    const day = todayKey();
    const data = await chrome.storage.local.get(STORAGE_KEYS.dailyBuckets);
    const buckets = (data[STORAGE_KEYS.dailyBuckets] as Record<string, DailyRow>) || {};
    const row = buckets[day];
    const p = row?.productive ?? 0;
    const d = row?.distraction ?? 0;
    if (p + d < 60) {
      const mins = Math.floor(p / 60);
      chrome.action.setBadgeText({ text: mins > 0 ? String(Math.min(mins, 999)) : "" });
      chrome.action.setBadgeBackgroundColor({ color: mins > 0 ? "#16a34a" : "#27272a" });
      await chrome.action.setTitle({
        title: mins > 0 ? `Study Heatmap · ${mins}m productive today` : "Study Heatmap",
      });
      return;
    }
    const r = Math.round((100 * p) / (p + d));
    const text = String(Math.min(r, 999));
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({
      color: r >= 55 ? "#16a34a" : r >= 40 ? "#52525b" : "#e11d48",
    });
    await chrome.action.setTitle({
      title: `Study Heatmap · ${r}% focus today`,
    });
  } catch {
    /* ignore */
  }
}

async function isPaused(): Promise<boolean> {
  const { [STORAGE_KEYS.pauseUntil]: until } = await chrome.storage.local.get(STORAGE_KEYS.pauseUntil);
  return typeof until === "number" && Date.now() < until;
}

async function getLists(): Promise<{ productive: string[]; distraction: string[] }> {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.productiveHosts,
    STORAGE_KEYS.distractionHosts,
  ]);
  let productive = data[STORAGE_KEYS.productiveHosts] as string[] | undefined;
  let distraction = data[STORAGE_KEYS.distractionHosts] as string[] | undefined;
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

async function addSeconds(kind: SiteKind, seconds: number, host: string): Promise<void> {
  if (seconds <= 0) return;
  if (await isPaused()) return;
  const day = todayKey();
  const key = STORAGE_KEYS.dailyBuckets;
  const data = await chrome.storage.local.get(key);
  const buckets = (data[key] as Record<string, DailyRow>) || {};
  const row: DailyRow = buckets[day] || {
    productive: 0,
    distraction: 0,
    neutral: 0,
    study: 0,
  };
  row[kind] = (row[kind] || 0) + seconds;
  buckets[day] = row;
  await chrome.storage.local.set({ [key]: buckets });
  void updateActionBadge();

  if (host) {
    const hk = STORAGE_KEYS.dailyByHost;
    const hdata = await chrome.storage.local.get(hk);
    const tree = (hdata[hk] as Record<string, Record<string, HostDayRow>>) || {};
    const dayRow = tree[day] || {};
    const hr: HostDayRow = dayRow[host] || { productive: 0, distraction: 0, neutral: 0 };
    hr[kind] = (hr[kind] || 0) + seconds;
    dayRow[host] = hr;
    tree[day] = dayRow;
    await chrome.storage.local.set({ [hk]: tree });
  }
}

async function addStudyOverlay(seconds: number): Promise<void> {
  if (seconds <= 0) return;
  if (await isPaused()) return;
  const day = todayKey();
  const key = STORAGE_KEYS.dailyBuckets;
  const data = await chrome.storage.local.get(key);
  const buckets = (data[key] as Record<string, DailyRow>) || {};
  const row: DailyRow = buckets[day] || {
    productive: 0,
    distraction: 0,
    neutral: 0,
    study: 0,
  };
  row.study = (row.study || 0) + seconds;
  buckets[day] = row;
  await chrome.storage.local.set({ [key]: buckets });
  void updateActionBadge();
}

async function flushPulse(): Promise<void> {
  if (!pulse) return;
  const now = Date.now();
  const deltaSec = Math.min(3600, Math.max(0, (now - pulse.ts) / 1000));
  if (deltaSec > 0.5) {
    const host = hostnameFromUrl(pulse.url);
    await addSeconds(pulse.kind, deltaSec, host);
  }
  pulse.ts = now;
}

async function adoptTab(tab: chrome.tabs.Tab): Promise<void> {
  const { productive, distraction } = await getLists();
  await flushPulse();
  if (
    !tab.id ||
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("edge://") ||
    tab.url.startsWith("devtools:") ||
    tab.url.startsWith("chrome-extension:") ||
    tab.url.startsWith("about:")
  ) {
    pulse = null;
    return;
  }
  const kind = classifyUrl(tab.url, productive, distraction);
  pulse = { ts: Date.now(), url: tab.url, kind, tabId: tab.id };
}

async function refreshActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) await adoptTab(tab);
  else pulse = null;
}

async function maybePrune(): Promise<void> {
  const d = todayKey();
  const meta = await chrome.storage.local.get(META_LAST_PRUNE);
  if (meta[META_LAST_PRUNE] === d) return;
  const cutoff = cutoffDateKey(new Date(), RETENTION_DAYS);
  const bk = STORAGE_KEYS.dailyBuckets;
  const buckets = ((await chrome.storage.local.get(bk))[bk] as Record<string, DailyRow>) || {};
  const next: Record<string, DailyRow> = {};
  for (const key of filterOldDateKeys(Object.keys(buckets), cutoff)) {
    next[key] = buckets[key];
  }
  const hk = STORAGE_KEYS.dailyByHost;
  const hosts = ((await chrome.storage.local.get(hk))[hk] as Record<string, Record<string, HostDayRow>>) || {};
  const nextH: Record<string, Record<string, HostDayRow>> = {};
  for (const key of filterOldDateKeys(Object.keys(hosts), cutoff)) {
    nextH[key] = hosts[key];
  }
  await chrome.storage.local.set({
    [bk]: next,
    [hk]: nextH,
    [META_LAST_PRUNE]: d,
  });
}

async function schedulePomodoroAlarm(delayMs: number): Promise<void> {
  await chrome.alarms.clear(ALARM_POMODORO);
  const when = Date.now() + Math.max(1000, delayMs);
  chrome.alarms.create(ALARM_POMODORO, { when });
}

async function clearPomodoro(): Promise<void> {
  await chrome.alarms.clear(ALARM_POMODORO);
  await chrome.storage.local.remove(STORAGE_KEYS.pomodoroState);
}

async function startPomodoro(sessionId: string, workMin: number, breakMin: number): Promise<void> {
  const workSec = Math.max(1, workMin) * 60;
  const breakSec = Math.max(1, breakMin) * 60;
  const state: PomodoroState = { sessionId, workSec, breakSec, isWork: true };
  await chrome.storage.local.set({ [STORAGE_KEYS.pomodoroState]: state });
  await schedulePomodoroAlarm(workSec * 1000);
}

async function onPomodoroAlarm(): Promise<void> {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.pomodoroState,
    STORAGE_KEYS.activeSessionId,
    STORAGE_KEYS.pomodoroNotify,
  ]);
  const st = data[STORAGE_KEYS.pomodoroState] as PomodoroState | undefined;
  const active = data[STORAGE_KEYS.activeSessionId] as string | null | undefined;
  const notify = data[STORAGE_KEYS.pomodoroNotify] !== false;
  const canNotify =
    notify && (await chrome.permissions.contains({ permissions: ["notifications"] }));
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
          message: "Break time — short rest before the next focus block.",
        });
      } catch {
        /* optional permission */
      }
    }
    const next: PomodoroState = { ...st, isWork: false };
    await chrome.storage.local.set({ [STORAGE_KEYS.pomodoroState]: next });
    await schedulePomodoroAlarm(next.breakSec * 1000);
  } else {
    if (canNotify) {
      try {
        await chrome.notifications.create({
          type: "basic",
          iconUrl: icon,
          title: "Study Heatmap",
          message: "Focus block — time for the next work session.",
        });
      } catch {
        /* optional */
      }
    }
    const next: PomodoroState = { ...st, isWork: true };
    await chrome.storage.local.set({ [STORAGE_KEYS.pomodoroState]: next });
    await schedulePomodoroAlarm(next.workSec * 1000);
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await getLists();
  const goalData = await chrome.storage.local.get([
    STORAGE_KEYS.dailyGoalMinutes,
    STORAGE_KEYS.weeklyGoalMinutes,
    STORAGE_KEYS.focusModeEnabled,
    STORAGE_KEYS.focusModeBlockedSites,
    STORAGE_KEYS.focusModeOverrideCooldownMs,
    STORAGE_KEYS.focusModeOverrideDuration,
    STORAGE_KEYS.lockedTabIds,
    STORAGE_KEYS.deepFocusEnabled,
  ]);
  if (typeof goalData[STORAGE_KEYS.dailyGoalMinutes] !== "number") {
    await chrome.storage.local.set({ [STORAGE_KEYS.dailyGoalMinutes]: DEFAULT_GOAL_MINUTES });
  }
  if (typeof goalData[STORAGE_KEYS.weeklyGoalMinutes] !== "number") {
    await chrome.storage.local.set({
      [STORAGE_KEYS.weeklyGoalMinutes]: DEFAULT_WEEKLY_GOAL_MINUTES,
    });
  }
  // Initialize Focus Mode defaults if not set
  if (typeof goalData[STORAGE_KEYS.focusModeEnabled] !== "boolean") {
    await chrome.storage.local.set({ [STORAGE_KEYS.focusModeEnabled]: false });
  }
  if (!Array.isArray(goalData[STORAGE_KEYS.focusModeBlockedSites])) {
    await chrome.storage.local.set({ [STORAGE_KEYS.focusModeBlockedSites]: [] });
  }
  if (typeof goalData[STORAGE_KEYS.focusModeOverrideCooldownMs] !== "number") {
    await chrome.storage.local.set({ [STORAGE_KEYS.focusModeOverrideCooldownMs]: 5 * 60 * 1000 });
  }
  if (typeof goalData[STORAGE_KEYS.focusModeOverrideDuration] !== "number") {
    await chrome.storage.local.set({ [STORAGE_KEYS.focusModeOverrideDuration]: 15 * 60 * 1000 });
  }
  // Initialize Tab Locking defaults if not set
  if (!Array.isArray(goalData[STORAGE_KEYS.lockedTabIds])) {
    await chrome.storage.local.set({ [STORAGE_KEYS.lockedTabIds]: [] });
  }
  if (typeof goalData[STORAGE_KEYS.deepFocusEnabled] !== "boolean") {
    await chrome.storage.local.set({ [STORAGE_KEYS.deepFocusEnabled]: false });
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
  const sid = (await chrome.storage.local.get(STORAGE_KEYS.activeSessionId))[
    STORAGE_KEYS.activeSessionId
  ] as string | null | undefined;
  if (sid && idleState === "active" && !(await isPaused())) {
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
  void updateActionBadge();
});

// Focus Mode functions
async function getFocusModeConfig(): Promise<{
  enabled: boolean;
  blockedSites: string[];
  overrideCooldownMs: number;
  overrideDurationMs: number;
  lastOverrideTime?: number;
}> {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.focusModeEnabled,
    STORAGE_KEYS.focusModeBlockedSites,
    STORAGE_KEYS.focusModeOverrideCooldownMs,
    STORAGE_KEYS.focusModeOverrideDuration,
    STORAGE_KEYS.focusModeLastOverrideTime,
  ]);
  return {
    enabled: data[STORAGE_KEYS.focusModeEnabled] === true,
    blockedSites: (data[STORAGE_KEYS.focusModeBlockedSites] as string[]) || [],
    overrideCooldownMs:
      (data[STORAGE_KEYS.focusModeOverrideCooldownMs] as number) || 5 * 60 * 1000,
    overrideDurationMs: (data[STORAGE_KEYS.focusModeOverrideDuration] as number) || 15 * 60 * 1000,
    lastOverrideTime: data[STORAGE_KEYS.focusModeLastOverrideTime] as number | undefined,
  };
}

function isUrlBlocked(url: string | undefined, blockedSites: string[]): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const site of blockedSites) {
      const normalizedSite = site.toLowerCase().replace(/^www\./, "");
      if (hostname === normalizedSite || hostname.endsWith("." + normalizedSite)) {
        return true;
      }
    }
  } catch {
    /* invalid URL */
  }
  return false;
}

async function isInOverridePeriod(): Promise<boolean> {
  const config = await getFocusModeConfig();
  if (!config.lastOverrideTime) return false;
  const now = Date.now();
  const overrideUntil = config.lastOverrideTime + config.overrideDurationMs;
  return now < overrideUntil;
}

// Tab Locking functions
async function getLockedTabs(): Promise<number[]> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.lockedTabIds);
  return (data[STORAGE_KEYS.lockedTabIds] as number[]) || [];
}

async function isTabLocked(tabId: number): Promise<boolean> {
  const lockedTabs = await getLockedTabs();
  return lockedTabs.includes(tabId);
}

async function lockTab(tabId: number): Promise<void> {
  const lockedTabs = await getLockedTabs();
  if (!lockedTabs.includes(tabId)) {
    lockedTabs.push(tabId);
    await chrome.storage.local.set({ [STORAGE_KEYS.lockedTabIds]: lockedTabs });
  }
  // Notify content script of lock status
  try {
    await chrome.tabs.sendMessage(tabId, { type: "UPDATE_LOCK_INDICATOR", locked: true });
  } catch {
    /* tab not ready */
  }
}

async function unlockTab(tabId: number): Promise<void> {
  const lockedTabs = await getLockedTabs();
  const filtered = lockedTabs.filter((id) => id !== tabId);
  await chrome.storage.local.set({ [STORAGE_KEYS.lockedTabIds]: filtered });
  // Notify content script of lock status
  try {
    await chrome.tabs.sendMessage(tabId, { type: "UPDATE_LOCK_INDICATOR", locked: false });
  } catch {
    /* tab not ready */
  }
}

async function isDeepFocusEnabled(): Promise<boolean> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.deepFocusEnabled);
  return data[STORAGE_KEYS.deepFocusEnabled] === true;
}

async function handleSpaNavigation(tabId: number, url: string | undefined): Promise<void> {
  if (url == null) return;
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.id !== tabId) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    await adoptTab(tab);
  } catch {
    /* tab may have closed */
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

// Focus Mode: Block navigation to distracting sites
chrome.webNavigation.onBeforeNavigate.addListener(
  async (details) => {
    if (details.frameId !== 0) return; // Only check main frame
    
    // Deep Focus mode: prevent distraction tabs
    const deepFocus = await isDeepFocusEnabled();
    if (deepFocus) {
      const { distraction } = await getLists();
      if (isUrlBlocked(details.url, distraction)) {
        const hostname = new URL(details.url).hostname;
        const redirectUrl = chrome.runtime.getURL(
          `stay-focused.html?url=${encodeURIComponent(details.url)}&hostname=${encodeURIComponent(hostname)}&reason=deep-focus`
        );
        chrome.tabs.update(details.tabId, { url: redirectUrl });
        return;
      }
    }
    
    // Regular Focus Mode: block with override
    const config = await getFocusModeConfig();
    if (!config.enabled) return;
    if (isUrlBlocked(details.url, config.blockedSites)) {
      const inOverride = await isInOverridePeriod();
      if (!inOverride) {
        const hostname = new URL(details.url).hostname;
        const redirectUrl = chrome.runtime.getURL(
          `stay-focused.html?url=${encodeURIComponent(details.url)}&hostname=${encodeURIComponent(hostname)}`
        );
        chrome.tabs.update(details.tabId, { url: redirectUrl });
      }
    }
  },
  { url: [{ schemes: ["http", "https"] }] }
);

// Prevent closing locked tabs
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const lockedTabs = await getLockedTabs();
  if (lockedTabs.includes(tabId)) {
    // Remove from locked list since tab was closed
    const filtered = lockedTabs.filter((id) => id !== tabId);
    await chrome.storage.local.set({ [STORAGE_KEYS.lockedTabIds]: filtered });
  }
});

chrome.tabs.onActivated.addListener(async () => {
  await refreshActiveTab();
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
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
      const sessions = (data[STORAGE_KEYS.sessions] as Session[]) || [];
      const id = `${Date.now()}`;
      const start = Date.now();
      const label = (msg.label as string) || "Study";
      const workMin = msg.pomodoro?.workMin as number | undefined;
      const breakMin = msg.pomodoro?.breakMin as number | undefined;
      const s: Session = {
        id,
        start,
        end: null,
        label,
        ...(workMin != null && breakMin != null
          ? { pomodoroWorkMin: workMin, pomodoroBreakMin: breakMin }
          : {}),
      };
      sessions.push(s);
      studyAnchorTs = Date.now();
      await chrome.storage.local.set({
        [STORAGE_KEYS.sessions]: sessions,
        [STORAGE_KEYS.activeSessionId]: id,
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
        STORAGE_KEYS.activeSessionId,
      ]);
      let sessions = (data[STORAGE_KEYS.sessions] as Session[]) || [];
      const activeId = data[STORAGE_KEYS.activeSessionId] as string | null | undefined;
      const s = sessions.find((x) => x.id === activeId);
      if (s) {
        s.end = Date.now();
        const note = msg.note as string | undefined;
        if (note && note.trim()) s.note = note.trim();
      }
      if (sessions.length > 400) sessions = sessions.slice(-400);
      await clearPomodoro();
      await chrome.storage.local.set({
        [STORAGE_KEYS.sessions]: sessions,
        [STORAGE_KEYS.activeSessionId]: null,
      });
      sendResponse({ ok: true });
    } else if (msg?.type === "PAUSE_TRACKING") {
      const minutes = Math.max(1, Math.min(480, Number(msg.minutes) || 15));
      const until = Date.now() + minutes * 60 * 1000;
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
        const sid = (await chrome.storage.local.get(STORAGE_KEYS.activeSessionId))[
          STORAGE_KEYS.activeSessionId
        ] as string | null | undefined;
        if (sid && !(await isPaused())) {
          const now = Date.now();
          const ds = Math.min(120, Math.max(0, (now - studyAnchorTs) / 1000));
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
      ];
      const snap = await chrome.storage.local.get(keys);
      void updateActionBadge();
      sendResponse(snap);
    } else if (msg?.type === "ADD_HOST_RULE") {
      const list = msg.list as "productive" | "distraction";
      const raw = (msg.host as string | undefined)?.trim().toLowerCase().replace(/^www\./, "") ?? "";
      const host = raw.split("/")[0] ?? "";
      if (!host || (list !== "productive" && list !== "distraction")) {
        sendResponse({ ok: false, error: "invalid" });
        return;
      }
      const key =
        list === "productive" ? STORAGE_KEYS.productiveHosts : STORAGE_KEYS.distractionHosts;
      const data = await chrome.storage.local.get(key);
      const arr = ((data[key] as string[]) || []).slice();
      if (!arr.includes(host)) {
        arr.push(host);
        arr.sort();
        await chrome.storage.local.set({ [key]: arr });
      }
      sendResponse({ ok: true });
    } else if (msg?.type === "COMPLETE_ONBOARDING") {
      await chrome.storage.local.set({ [STORAGE_KEYS.onboardingDone]: true });
      sendResponse({ ok: true });
    } else if (msg?.type === "TOGGLE_FOCUS_MODE") {
      const enabled = msg.enabled as boolean | undefined;
      if (typeof enabled === "boolean") {
        await chrome.storage.local.set({ [STORAGE_KEYS.focusModeEnabled]: enabled });
        sendResponse({ ok: true, enabled });
      } else {
        const config = await getFocusModeConfig();
        const newEnabled = !config.enabled;
        await chrome.storage.local.set({ [STORAGE_KEYS.focusModeEnabled]: newEnabled });
        sendResponse({ ok: true, enabled: newEnabled });
      }
    } else if (msg?.type === "UPDATE_FOCUS_BLOCKED_SITES") {
      const sites = (msg.sites as string[]) || [];
      const normalized = sites
        .map((s) => s.trim().toLowerCase().replace(/^www\./, ""))
        .filter(Boolean);
      await chrome.storage.local.set({ [STORAGE_KEYS.focusModeBlockedSites]: normalized });
      sendResponse({ ok: true, sites: normalized });
    } else if (msg?.type === "UPDATE_FOCUS_MODE_SETTINGS") {
      const cooldownMs = msg.cooldownMs as number | undefined;
      const durationMs = msg.durationMs as number | undefined;
      const updates: Record<string, unknown> = {};
      if (typeof cooldownMs === "number" && cooldownMs > 0) {
        updates[STORAGE_KEYS.focusModeOverrideCooldownMs] = cooldownMs;
      }
      if (typeof durationMs === "number" && durationMs > 0) {
        updates[STORAGE_KEYS.focusModeOverrideDuration] = durationMs;
      }
      if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
      }
      sendResponse({ ok: true });
    } else if (msg?.type === "GET_FOCUS_MODE_CONFIG") {
      const config = await getFocusModeConfig();
      sendResponse(config);
    } else if (msg?.type === "LOCK_TAB") {
      const tabId = msg.tabId as number | undefined;
      if (typeof tabId === "number") {
        await lockTab(tabId);
        sendResponse({ ok: true, locked: true });
      } else {
        sendResponse({ ok: false, error: "invalid tabId" });
      }
    } else if (msg?.type === "UNLOCK_TAB") {
      const tabId = msg.tabId as number | undefined;
      if (typeof tabId === "number") {
        await unlockTab(tabId);
        sendResponse({ ok: true, locked: false });
      } else {
        sendResponse({ ok: false, error: "invalid tabId" });
      }
    } else if (msg?.type === "CHECK_TAB_LOCKED") {
      const tabId = (sender.tab?.id as number) || 0;
      const locked = await isTabLocked(tabId);
      sendResponse({ locked });
    } else if (msg?.type === "GET_LOCKED_TABS") {
      const lockedTabs = await getLockedTabs();
      sendResponse({ lockedTabs });
    } else if (msg?.type === "TOGGLE_DEEP_FOCUS") {
      const enabled = msg.enabled as boolean | undefined;
      if (typeof enabled === "boolean") {
        await chrome.storage.local.set({ [STORAGE_KEYS.deepFocusEnabled]: enabled });
        sendResponse({ ok: true, enabled });
      } else {
        const current = await isDeepFocusEnabled();
        const newEnabled = !current;
        await chrome.storage.local.set({ [STORAGE_KEYS.deepFocusEnabled]: newEnabled });
        sendResponse({ ok: true, enabled: newEnabled });
      }
    } else {
      sendResponse(null);
    }
  })();
  return true;
});
