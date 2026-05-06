import { STORAGE_KEYS } from "./lib/storageKeys";
import { todayKey, weekLabel, keyFromDate, mondayOf } from "./lib/dates";
import type { DailyRow, HostDayRow, Session } from "./lib/types";

const HEATMAP_WEEKS = 18;

function fmtHours(sec: number): string {
  const h = sec / 3600;
  if (h >= 10) return `${h.toFixed(1)}h`;
  if (h >= 1) return `${h.toFixed(1)}h`;
  return `${Math.round(sec / 60)}m`;
}

function levelForProductive(sec: number, maxSec: number): number {
  if (!maxSec || sec <= 0) return 0;
  const r = sec / maxSec;
  if (r < 0.15) return 1;
  if (r < 0.35) return 2;
  if (r < 0.6) return 3;
  return 4;
}

function drawStackedWeeks(
  canvas: HTMLCanvasElement,
  weeks: { productive: number; distraction: number }[],
  labels: string[]
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const padL = 44;
  const padB = 36;
  const padT = 16;
  const chartW = w - padL - 12;
  const chartH = h - padB - padT;
  const n = weeks.length;
  const gap = 8;
  const barW = (chartW - gap * (n - 1)) / n;
  let maxH = 1;
  for (const x of weeks) {
    maxH = Math.max(maxH, x.productive + x.distraction);
  }

  weeks.forEach((wk, i) => {
    const x0 = padL + i * (barW + gap);
    const total = wk.productive + wk.distraction;
    const hp = (wk.productive / maxH) * chartH;
    const hd = (wk.distraction / maxH) * chartH;
    const yBase = padT + chartH;
    ctx.fillStyle = "rgba(225, 29, 72, 0.85)";
    ctx.fillRect(x0, yBase - hd, barW, hd);
    ctx.fillStyle = "rgba(22, 163, 74, 0.9)";
    ctx.fillRect(x0, yBase - hd - hp, barW, hp);
    if (total === 0) {
      ctx.fillStyle = "#27272a";
      ctx.fillRect(x0, yBase - 2, barW, 2);
    }
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "10px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(labels[i], x0 + barW / 2, yBase + 18);
  });

  ctx.textAlign = "left";
  ctx.fillStyle = "#71717a";
  ctx.font = "11px system-ui";
  ctx.fillText("Hours", 8, padT + 10);
}

function drawLineFocus(
  canvas: HTMLCanvasElement,
  points: { ratio: number; hasData: boolean; label: string }[]
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const padL = 40;
  const padB = 28;
  const padT = 18;
  const cw = w - padL - 10;
  const ch = h - padB - padT;
  const min = 0;
  const max = 100;
  const n = points.length;

  ctx.strokeStyle = "#27272a";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (ch * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + cw, y);
    ctx.stroke();
    const v = max - ((max - min) * i) / 4;
    ctx.fillStyle = "#71717a";
    ctx.font = "10px system-ui";
    ctx.fillText(`${Math.round(v)}%`, 6, y + 3);
  }

  const usable = points.filter((p) => p.hasData);
  if (usable.length < 2) {
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "12px system-ui";
    ctx.fillText(
      "Not enough data yet — browse on classified sites, then refresh.",
      padL,
      padT + ch / 2
    );
    return;
  }

  const step = cw / (n - 1);
  ctx.strokeStyle = "rgba(234, 88, 12, 0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let started = false;
  points.forEach((p, i) => {
    if (!p.hasData) {
      started = false;
      return;
    }
    const x = padL + i * step;
    const y = padT + ch - ((p.ratio - min) / (max - min)) * ch;
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "rgba(234, 88, 12, 0.95)";
  points.forEach((p, i) => {
    if (!p.hasData) return;
    const x = padL + i * step;
    const y = padT + ch - ((p.ratio - min) / (max - min)) * ch;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#71717a";
  ctx.font = "10px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(points[0].label, padL, padT + ch + 18);
  ctx.fillText(points[n - 1].label, padL + cw, padT + ch + 18);
}

async function loadData(): Promise<Record<string, unknown>> {
  return chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" }) as Promise<Record<string, unknown>>;
}

function renderHeatmap(root: HTMLElement, buckets: Record<string, DailyRow>): void {
  root.replaceChildren();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKeyStr = keyFromDate(today);
  const start = mondayOf(today);
  start.setDate(start.getDate() - (HEATMAP_WEEKS - 1) * 7);

  let maxP = 1;
  for (let c = 0; c < HEATMAP_WEEKS; c++) {
    for (let r = 0; r < 7; r++) {
      const d = new Date(start);
      d.setDate(d.getDate() + c * 7 + r);
      const k = keyFromDate(d);
      const row = buckets[k];
      if (row?.productive) maxP = Math.max(maxP, row.productive);
    }
  }

  for (let c = 0; c < HEATMAP_WEEKS; c++) {
    const col = document.createElement("div");
    col.className = "week";
    for (let r = 0; r < 7; r++) {
      const d = new Date(start);
      d.setDate(d.getDate() + c * 7 + r);
      const k = keyFromDate(d);
      const cell = document.createElement("div");
      cell.className = "cell";
      const row = buckets[k] || {};
      const p = row.productive || 0;
      const lvl = levelForProductive(p, maxP);
      if (k > todayKeyStr) {
        cell.classList.add("future");
      } else if (lvl > 0) {
        cell.style.background = [
          "",
          "rgba(22, 163, 74, 0.28)",
          "rgba(22, 163, 74, 0.45)",
          "rgba(22, 163, 74, 0.68)",
          "rgba(22, 163, 74, 0.95)",
        ][lvl];
      }
      const dateStr = d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      cell.title = `${dateStr} · productive ${fmtHours(p)}`;
      col.appendChild(cell);
    }
    root.appendChild(col);
  }
}

function aggregateRollingWeeks(
  buckets: Record<string, DailyRow>,
  numWeeks: number
): { series: { productive: number; distraction: number; study: number }[]; labels: string[] } {
  const today = new Date();
  const startMonday = mondayOf(today);
  const out: { productive: number; distraction: number; study: number }[] = [];
  const labels: string[] = [];
  for (let i = numWeeks - 1; i >= 0; i--) {
    const m = new Date(startMonday);
    m.setDate(m.getDate() - i * 7);
    let productive = 0;
    let distraction = 0;
    let study = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(m);
      day.setDate(day.getDate() + d);
      const k = keyFromDate(day);
      const row = buckets[k] || {};
      productive += row.productive || 0;
      distraction += row.distraction || 0;
      study += row.study || 0;
    }
    out.push({ productive, distraction, study });
    const wl = weekLabel(keyFromDate(m));
    labels.push(wl.replace(/^\d{4}-W/, "W"));
  }
  return { series: out, labels };
}

function focusSeriesLastDays(
  buckets: Record<string, DailyRow>,
  days: number
): { k: string; ratio: number; hasData: boolean; label: string }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pts: { k: string; ratio: number; hasData: boolean; label: string }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const k = keyFromDate(d);
    const row = buckets[k] || {};
    const p = row.productive || 0;
    const x = row.distraction || 0;
    const t = p + x;
    const hasData = t >= 120;
    const ratio = hasData ? Math.round((100 * p) / t) : 0;
    pts.push({ k, ratio, hasData, label: "" });
  }
  if (pts.length) {
    pts[0].label = "Today";
    pts[pts.length - 1].label = `${days}d ago`;
  }
  return pts;
}

function sumWeek(startMonday: Date, buckets: Record<string, DailyRow>): {
  productive: number;
  distraction: number;
} {
  let productive = 0;
  let distraction = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(startMonday);
    d.setDate(d.getDate() + i);
    const k = keyFromDate(d);
    const row = buckets[k] || {};
    productive += row.productive || 0;
    distraction += row.distraction || 0;
  }
  return { productive, distraction };
}

function ratio(p: number, d: number): number | null {
  return p + d >= 120 ? Math.round((100 * p) / (p + d)) : null;
}

function pctDelta(cur: number, prev: number): string {
  if (prev === 0 && cur === 0) return "0%";
  if (prev === 0) return "+∞";
  const x = Math.round(((cur - prev) / prev) * 100);
  return `${x > 0 ? "+" : ""}${x}%`;
}

function renderWow(el: HTMLElement, buckets: Record<string, DailyRow>): void {
  const thisM = mondayOf(new Date());
  const lastM = new Date(thisM);
  lastM.setDate(lastM.getDate() - 7);
  const cur = sumWeek(thisM, buckets);
  const prev = sumWeek(lastM, buckets);
  const rCur = ratio(cur.productive, cur.distraction);
  const rPrev = ratio(prev.productive, prev.distraction);
  const prodDelta = pctDelta(cur.productive, prev.productive);
  const distDelta = pctDelta(cur.distraction, prev.distraction);
  const prodCls = cur.productive >= prev.productive ? "delta-pos" : "delta-neg";
  const distCls = cur.distraction <= prev.distraction ? "delta-pos" : "delta-neg";

  let ratioBlurb = "Not enough classified time yet this week.";
  if (rCur != null && rPrev != null) {
    const dr = rCur - rPrev;
    ratioBlurb = `Focus ratio ${rCur}% vs ${rPrev}% prior week (${dr >= 0 ? "+" : ""}${dr} pts).`;
  } else if (rCur != null) {
    ratioBlurb = `Focus ratio this week: ${rCur}%.`;
  }

  el.innerHTML = `
    <div class="tile">
      <h3>Productive</h3>
      <p>${fmtHours(cur.productive)} <span class="${prodCls}">(${prodDelta} vs prior week)</span></p>
    </div>
    <div class="tile">
      <h3>Distraction</h3>
      <p>${fmtHours(cur.distraction)} <span class="${distCls}">(${distDelta} vs prior week)</span></p>
    </div>
    <div class="tile">
      <h3>Focus ratio</h3>
      <p>${ratioBlurb}</p>
    </div>
  `;
}

function topDistractionHosts(
  byHost: Record<string, Record<string, HostDayRow>> | undefined,
  endDate: Date,
  numDays: number,
  topN: number
): { host: string; sec: number }[] {
  const map = new Map<string, number>();
  const t = new Date(endDate);
  t.setHours(0, 0, 0, 0);
  for (let i = 0; i < numDays; i++) {
    const d = new Date(t);
    d.setDate(d.getDate() - i);
    const k = keyFromDate(d);
    const row = byHost?.[k];
    if (!row) continue;
    for (const [h, hr] of Object.entries(row)) {
      map.set(h, (map.get(h) || 0) + (hr.distraction || 0));
    }
  }
  return [...map.entries()]
    .filter(([, sec]) => sec >= 60)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([host, sec]) => ({ host, sec }));
}

function renderTopHosts(root: HTMLElement, byHost: Record<string, Record<string, HostDayRow>> | undefined): void {
  const rows = topDistractionHosts(byHost, new Date(), 7, 12);
  if (!rows.length) {
    root.innerHTML = `<p class="muted">No distraction time recorded in the last seven days.</p>`;
    return;
  }
  root.innerHTML = `
    <table class="hosts" aria-label="Top distraction hosts">
      <thead><tr><th>Host</th><th class="num">Time</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (r) =>
              `<tr><td><code>${escapeHtml(r.host)}</code></td><td class="num">${fmtHours(r.sec)}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderWeekly(
  container: HTMLElement,
  buckets: Record<string, DailyRow>,
  sessions: Session[]
): void {
  const wk = weekLabel(todayKey());
  let productive = 0;
  let distraction = 0;
  let study = 0;
  for (const [k, row] of Object.entries(buckets)) {
    if (weekLabel(k) !== wk) continue;
    productive += row.productive || 0;
    distraction += row.distraction || 0;
    study += row.study || 0;
  }

  const weekSessions = (sessions || []).filter((s) => {
    const t = s.start;
    return weekLabel(keyFromDate(new Date(t))) === wk;
  });
  const completed = weekSessions.filter((s) => s.end);
  const avgMin =
    completed.length === 0
      ? 0
      : Math.round(
          completed.reduce((a, s) => a + ((s.end as number) - s.start) / 60000, 0) / completed.length
        );

  const r =
    productive + distraction >= 120
      ? Math.round((100 * productive) / (productive + distraction))
      : null;

  const notes = completed.filter((s) => s.note).slice(-3);

  container.innerHTML = `
    <div class="stat good"><div class="k">Productive</div><div class="v">${fmtHours(productive)}</div></div>
    <div class="stat bad"><div class="k">Distraction</div><div class="v">${fmtHours(distraction)}</div></div>
    <div class="stat"><div class="k">Study timer</div><div class="v">${fmtHours(study)}</div></div>
    <div class="stat"><div class="k">Focus ratio</div><div class="v">${r == null ? "—" : r + "%"}</div></div>
    <div class="stat"><div class="k">Sessions (week)</div><div class="v">${weekSessions.length}</div></div>
    <div class="stat"><div class="k">Avg session</div><div class="v">${avgMin ? avgMin + " min" : "—"}</div></div>
    <div class="stat note">
      Week <strong>${wk}</strong>. Study timer accrues during active sessions while Chrome is focused; site totals use your rules.
      ${notes.length ? `<br /><br />Recent notes: ${notes.map((s) => `<em>${escapeHtml(s.note || "")}</em>`).join(" · ")}` : ""}
    </div>
  `;
}

function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(buckets: Record<string, DailyRow>): string {
  const keys = Object.keys(buckets).sort();
  const lines = ["date,productive_sec,distraction_sec,neutral_sec,study_sec"];
  for (const k of keys) {
    const r = buckets[k] || {};
    lines.push(
      `${k},${r.productive || 0},${r.distraction || 0},${r.neutral || 0},${r.study || 0}`
    );
  }
  return lines.join("\n");
}

async function render(): Promise<void> {
  const snap = await loadData();
  const buckets = (snap[STORAGE_KEYS.dailyBuckets] as Record<string, DailyRow>) || {};
  const byHost = snap[STORAGE_KEYS.dailyByHost] as Record<string, Record<string, HostDayRow>> | undefined;
  const sessions = (snap[STORAGE_KEYS.sessions] as Session[]) || [];

  renderWow(document.getElementById("wow")!, buckets);
  renderHeatmap(document.getElementById("heatmap")!, buckets);

  const { series, labels } = aggregateRollingWeeks(buckets, 8);
  const weeksForChart = series.map((s) => ({
    productive: s.productive / 3600,
    distraction: s.distraction / 3600,
  }));
  drawStackedWeeks(document.getElementById("bars") as HTMLCanvasElement, weeksForChart, labels);

  const pts = focusSeriesLastDays(buckets, 30);
  drawLineFocus(document.getElementById("line") as HTMLCanvasElement, pts);

  renderTopHosts(document.getElementById("topHosts")!, byHost);
  renderWeekly(document.getElementById("weekly")!, buckets, sessions);

  const exportPayload = async () => {
    const s = await loadData();
    return {
      exportedAt: new Date().toISOString(),
      version: 1,
      ...s,
    };
  };

  document.getElementById("exportJson")!.onclick = async () => {
    const data = await exportPayload();
    downloadText(
      `study-heatmap-${todayKey()}.json`,
      JSON.stringify(data, null, 2),
      "application/json"
    );
  };

  document.getElementById("exportCsv")!.onclick = () => {
    downloadText(`study-heatmap-daily-${todayKey()}.csv`, toCsv(buckets), "text/csv");
  };
}

document.getElementById("reload")!.addEventListener("click", () => void render());
void render();
