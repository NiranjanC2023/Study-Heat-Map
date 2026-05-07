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

let pulse: Pulse | null = null;
let studyAnchorTs = Date.now();

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
  if (!tab.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) {
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
  if (!st || !active || st.sessionId !== active) {
    await clearPomodoro();
    return;
  }
  const icon = chrome.runtime.getURL("icons/icon128.png");
  if (st.isWork) {
    if (notify) {
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
    if (notify) {
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
  const goalData = await chrome.storage.local.get(STORAGE_KEYS.dailyGoalMinutes);
  if (typeof goalData[STORAGE_KEYS.dailyGoalMinutes] !== "number") {
    await chrome.storage.local.set({ [STORAGE_KEYS.dailyGoalMinutes]: DEFAULT_GOAL_MINUTES });
  }
  chrome.alarms.create(ALARM_HEARTBEAT, { periodInMinutes: 1 });
  await refreshActiveTab();
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
        STORAGE_KEYS.pomodoroState,
        STORAGE_KEYS.pomodoroNotify,
      ];
      const snap = await chrome.storage.local.get(keys);
      sendResponse(snap);
    } else if (msg?.type === "COMPLETE_ONBOARDING") {
      await chrome.storage.local.set({ [STORAGE_KEYS.onboardingDone]: true });
      sendResponse({ ok: true });
    } else {
      sendResponse(null);
    }
  })();
  return true;
});
