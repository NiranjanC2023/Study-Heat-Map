import { STORAGE_KEYS } from "./lib/storageKeys";
import { todayKey } from "./lib/dates";
import { classifyUrl, hostnameFromUrl, type SiteKind } from "./lib/classify";
import { isDistractionUrl } from "./lib/focusPolicy";
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
/** ~3s; catches focus toggle + tab switches without navigation events, and SPA URL drift. */
const ALARM_FOCUS_ACTIVE_POLL = "focus-active-poll";
const FOCUS_ACTIVE_POLL_PERIOD_MIN = 3 / 60;
const META_LAST_PRUNE = "_studyHeatmapLastPrune";

const DEFAULT_GOAL_MINUTES = 120;
const DEFAULT_WEEKLY_GOAL_MINUTES = 600;

let pulse: Pulse | null = null;
let studyAnchorTs = Date.now();

const TAB_LOCK_MOUNT = "tab-lock-mount.js";
const TAB_LOCK_UNMOUNT = "tab-lock-unmount.js";

function extensionOriginPrefix(): string {
  return chrome.runtime.getURL("");
}

async function getLiveTabUrl(tabId: number, fallback: string | undefined): Promise<string | undefined> {
  if (!fallback?.startsWith("http")) return fallback;
  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: () => window.location.href,
    });
    const href = injected[0]?.result;
    return typeof href === "string" ? href : fallback;
  } catch {
    return fallback;
  }
}

async function syncFocusPollAlarm(): Promise<void> {
  await chrome.alarms.clear(ALARM_FOCUS_ACTIVE_POLL);
  const { [STORAGE_KEYS.focusModeEnabled]: enabled } = await chrome.storage.local.get(
    STORAGE_KEYS.focusModeEnabled
  );
  if (enabled !== true) return;
  chrome.alarms.create(ALARM_FOCUS_ACTIVE_POLL, {
    delayInMinutes: FOCUS_ACTIVE_POLL_PERIOD_MIN,
    periodInMinutes: FOCUS_ACTIVE_POLL_PERIOD_MIN,
  });
}

async function pollActiveTabForFocusBlock(): Promise<void> {
  const { [STORAGE_KEYS.focusModeEnabled]: enabled } = await chrome.storage.local.get(
    STORAGE_KEYS.focusModeEnabled
  );
  if (enabled !== true) return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return;
  const fallback = tab.url ?? tab.pendingUrl;
  const url = await getLiveTabUrl(tab.id, fallback);
  await maybeRedirectBlockedTab(tab.id, url);
}

async function scanAllTabsForFocusBlock(): Promise<void> {
  const { [STORAGE_KEYS.focusModeEnabled]: enabled } = await chrome.storage.local.get(
    STORAGE_KEYS.focusModeEnabled
  );
  if (enabled !== true) return;
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (t.id == null) continue;
    await maybeRedirectBlockedTab(t.id, t.url ?? t.pendingUrl);
  }
}

async function maybeRedirectBlockedTab(tabId: number, url: string | undefined): Promise<void> {
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) return;
  const ext = extensionOriginPrefix();
  if (url.startsWith(ext)) return;

  const st = await chrome.storage.local.get([
    STORAGE_KEYS.focusModeEnabled,
    STORAGE_KEYS.focusOverrideUntil,
  ]);
  if (st[STORAGE_KEYS.focusModeEnabled] !== true) return;
  if (await isPaused()) return;
  const ou = st[STORAGE_KEYS.focusOverrideUntil] as number | undefined;
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
    /* tab may have closed */
  }
}

async function injectTabLock(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: [TAB_LOCK_MOUNT],
    });
  } catch {
    /* restricted pages */
  }
}

async function removeTabLockVisual(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: [TAB_LOCK_UNMOUNT],
    });
  } catch {
    /* */
  }
}

async function reinjectLockIfNeeded(tabId: number): Promise<void> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.lockedTabIds);
  const ids = (data[STORAGE_KEYS.lockedTabIds] as number[]) || [];
  if (ids.includes(tabId)) await injectTabLock(tabId);
}

async function migrateFocusDefaults(): Promise<void> {
  const keys = [
    STORAGE_KEYS.focusModeEnabled,
    STORAGE_KEYS.deepFocusEnabled,
    STORAGE_KEYS.focusOverrideDurationMin,
    STORAGE_KEYS.focusOverrideCooldownMin,
    STORAGE_KEYS.lockedTabIds,
  ] as const;
  const cur = await chrome.storage.local.get([...keys]);
  const patch: Record<string, unknown> = {};
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

async function updateActionBadge(): Promise<void> {
  const applyBadgeColors = async (backgroundColor: string, textColor: string): Promise<void> => {
    chrome.action.setBadgeBackgroundColor({ color: backgroundColor });
    try {
      await chrome.action.setBadgeTextColor({ color: textColor });
    } catch {
      /* setBadgeTextColor not supported on older Chromium */
    }
  };

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
      if (mins > 0) await applyBadgeColors("#f5f5f5", "#000000");
      else await applyBadgeColors("#262626", "#e5e5e5");
      await chrome.action.setTitle({
        title: mins > 0 ? `Study Heatmap · ${mins}m productive today` : "Study Heatmap",
      });
      return;
    }
    const r = Math.round((100 * p) / (p + d));
    const text = String(Math.min(r, 999));
    chrome.action.setBadgeText({ text });
    if (r >= 55) await applyBadgeColors("#ffffff", "#000000");
    else if (r >= 40) await applyBadgeColors("#525252", "#fafafa");
    else await applyBadgeColors("#171717", "#d4d4d4");
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
  await migrateFocusDefaults();
  const goalData = await chrome.storage.local.get([
    STORAGE_KEYS.dailyGoalMinutes,
    STORAGE_KEYS.weeklyGoalMinutes,
  ]);
  if (typeof goalData[STORAGE_KEYS.dailyGoalMinutes] !== "number") {
    await chrome.storage.local.set({ [STORAGE_KEYS.dailyGoalMinutes]: DEFAULT_GOAL_MINUTES });
  }
  if (typeof goalData[STORAGE_KEYS.weeklyGoalMinutes] !== "number") {
    await chrome.storage.local.set({
      [STORAGE_KEYS.weeklyGoalMinutes]: DEFAULT_WEEKLY_GOAL_MINUTES,
    });
  }
  chrome.alarms.create(ALARM_HEARTBEAT, { periodInMinutes: 1 });
  await syncFocusPollAlarm();
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
  await syncFocusPollAlarm();
  await refreshActiveTab();
  void updateActionBadge();
});

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === ALARM_FOCUS_ACTIVE_POLL) {
    await pollActiveTabForFocusBlock();
    return;
  }
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

async function handleSpaNavigation(tabId: number, url: string | undefined): Promise<void> {
  if (url == null) return;
  await maybeRedirectBlockedTab(tabId, url);
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

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await reinjectLockIfNeeded(activeInfo.tabId);
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const fallback = tab.url ?? tab.pendingUrl;
    const url = await getLiveTabUrl(activeInfo.tabId, fallback);
    await maybeRedirectBlockedTab(activeInfo.tabId, url);
  } catch {
    /* tab may have closed */
  }
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
    const ids = (data[STORAGE_KEYS.lockedTabIds] as number[]) || [];
    if (!ids.includes(tabId)) return;
    await chrome.storage.local.set({
      [STORAGE_KEYS.lockedTabIds]: ids.filter((x) => x !== tabId),
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const fm = changes[STORAGE_KEYS.focusModeEnabled];
  const prod = changes[STORAGE_KEYS.productiveHosts];
  const dist = changes[STORAGE_KEYS.distractionHosts];
  if (!fm && !prod && !dist) return;
  void (async () => {
    await syncFocusPollAlarm();
    if (fm?.newValue === true || prod || dist) await scanAllTabsForFocusBlock();
  })();
});

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
        STORAGE_KEYS.focusModeEnabled,
        STORAGE_KEYS.deepFocusEnabled,
        STORAGE_KEYS.focusOverrideUntil,
        STORAGE_KEYS.focusOverrideDurationMin,
        STORAGE_KEYS.focusOverrideCooldownMin,
        STORAGE_KEYS.lockedTabIds,
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
        STORAGE_KEYS.lastFocusOverrideAt,
      ]);
      const deepFocus = data[STORAGE_KEYS.deepFocusEnabled] === true;
      const ou = data[STORAGE_KEYS.focusOverrideUntil] as number | undefined;
      const overrideActive = typeof ou === "number" && now < ou;
      const cooldownMin =
        typeof data[STORAGE_KEYS.focusOverrideCooldownMin] === "number"
          ? (data[STORAGE_KEYS.focusOverrideCooldownMin] as number)
          : 30;
      const durationMin =
        typeof data[STORAGE_KEYS.focusOverrideDurationMin] === "number"
          ? (data[STORAGE_KEYS.focusOverrideDurationMin] as number)
          : 10;
      const lastAt = data[STORAGE_KEYS.lastFocusOverrideAt] as number | undefined;
      let cooldownRemainingMs = 0;
      if (!overrideActive && typeof lastAt === "number") {
        const need = cooldownMin * 60 * 1000;
        cooldownRemainingMs = Math.max(0, lastAt + need - now);
      }
      sendResponse({
        deepFocus,
        overrideActive,
        cooldownRemainingMs,
        cooldownMin,
        durationMin,
      });
    } else if (msg?.type === "FOCUS_OVERRIDE_AND_GO") {
      const target = msg.target as string;
      const tabId = _sender.tab?.id;
      const deep =
        (await chrome.storage.local.get(STORAGE_KEYS.deepFocusEnabled))[
          STORAGE_KEYS.deepFocusEnabled
        ] === true;
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
        STORAGE_KEYS.focusOverrideUntil,
      ]);
      const now = Date.now();
      const ou = data[STORAGE_KEYS.focusOverrideUntil] as number | undefined;
      if (typeof ou === "number" && now < ou) {
        if (tabId != null) await chrome.tabs.update(tabId, { url: target });
        sendResponse({ ok: true });
        return;
      }
      const cooldownMin =
        typeof data[STORAGE_KEYS.focusOverrideCooldownMin] === "number"
          ? (data[STORAGE_KEYS.focusOverrideCooldownMin] as number)
          : 30;
      const durationMin =
        typeof data[STORAGE_KEYS.focusOverrideDurationMin] === "number"
          ? (data[STORAGE_KEYS.focusOverrideDurationMin] as number)
          : 10;
      const lastAt = data[STORAGE_KEYS.lastFocusOverrideAt] as number | undefined;
      if (typeof lastAt === "number" && now - lastAt < cooldownMin * 60 * 1000) {
        sendResponse({ ok: false, reason: "cooldown" });
        return;
      }
      await chrome.storage.local.set({
        [STORAGE_KEYS.focusOverrideUntil]: now + durationMin * 60 * 1000,
        [STORAGE_KEYS.lastFocusOverrideAt]: now,
      });
      if (tabId != null) await chrome.tabs.update(tabId, { url: target });
      sendResponse({ ok: true });
    } else if (msg?.type === "SET_TAB_LOCK") {
      const tabId = msg.tabId as number;
      const locked = msg.locked === true;
      const data = await chrome.storage.local.get(STORAGE_KEYS.lockedTabIds);
      const set = new Set<number>((data[STORAGE_KEYS.lockedTabIds] as number[]) || []);
      if (locked) {
        set.add(tabId);
        try {
          await chrome.tabs.update(tabId, { pinned: true });
        } catch {
          /* */
        }
        await injectTabLock(tabId);
      } else {
        set.delete(tabId);
        await removeTabLockVisual(tabId);
        try {
          await chrome.tabs.update(tabId, { pinned: false });
        } catch {
          /* */
        }
      }
      await chrome.storage.local.set({ [STORAGE_KEYS.lockedTabIds]: [...set] });
      sendResponse({ ok: true });
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
    } else {
      sendResponse(null);
    }
  })();
  return true;
});
