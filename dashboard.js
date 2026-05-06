import { STORAGE_KEYS, todayKey, weekLabel } from "./shared.js";

const HEATMAP_WEEKS = 18;

function pad(n) {
  return String(n).padStart(2, "0");
}

/** @returns {string} YYYY-MM-DD */
function keyFromDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function fmtHours(sec) {
  const h = sec / 3600;
  if (h >= 10) return `${h.toFixed(1)}h`;
  if (h >= 1) return `${h.toFixed(1)}h`;
  return `${Math.round(sec / 60)}m`;
}

function levelForProductive(sec, maxSec) {
  if (!maxSec || sec <= 0) return 0;
  const r = sec / maxSec;
  if (r < 0.15) return 1;
  if (r < 0.35) return 2;
  if (r < 0.6) return 3;
  return 4;
}

function drawStackedWeeks(canvas, weeks, labels) {
  const ctx = canvas.getContext("2d");
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

function drawLineFocus(canvas, points) {
  const ctx = canvas.getContext("2d");
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
      "Not enough data yet — browse a bit on classified sites, then refresh.",
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

async function loadData() {
  return chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" });
}

function renderHeatmap(root, buckets) {
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
      if (row && row.productive) maxP = Math.max(maxP, row.productive);
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

function aggregateRollingWeeks(buckets, numWeeks) {
  const today = new Date();
  const startMonday = mondayOf(today);
  const out = [];
  const labels = [];
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

function focusSeriesLastDays(buckets, days) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pts = [];
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

function renderWeekly(container, buckets, sessions) {
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

  const now = Date.now();
  const weekSessions = (sessions || []).filter((s) => {
    const t = s.start;
    return weekLabel(keyFromDate(new Date(t))) === wk;
  });
  const completed = weekSessions.filter((s) => s.end);
  const avgMin =
    completed.length === 0
      ? 0
      : Math.round(
          completed.reduce((a, s) => a + (s.end - s.start) / 60000, 0) / completed.length
        );

  const ratio = productive + distraction >= 120 ? Math.round((100 * productive) / (productive + distraction)) : null;

  container.innerHTML = `
    <div class="stat good"><div class="k">Productive</div><div class="v">${fmtHours(productive)}</div></div>
    <div class="stat bad"><div class="k">Distraction</div><div class="v">${fmtHours(distraction)}</div></div>
    <div class="stat"><div class="k">Study timer</div><div class="v">${fmtHours(study)}</div></div>
    <div class="stat"><div class="k">Focus ratio</div><div class="v">${ratio == null ? "—" : ratio + "%"}</div></div>
    <div class="stat"><div class="k">Sessions (week)</div><div class="v">${weekSessions.length}</div></div>
    <div class="stat"><div class="k">Avg session</div><div class="v">${avgMin ? avgMin + " min" : "—"}</div></div>
    <div class="stat note">
      Week label <strong>${wk}</strong>. Study timer counts wall time while a session is active and Chrome is in the foreground;
      site totals still follow your productive / distraction lists.
    </div>
  `;
}

async function render() {
  const snap = await loadData();
  const buckets = snap[STORAGE_KEYS.dailyBuckets] || {};
  const sessions = snap[STORAGE_KEYS.sessions] || [];

  renderHeatmap(document.getElementById("heatmap"), buckets);

  const { series, labels } = aggregateRollingWeeks(buckets, 8);
  const weeksForChart = series.map((s) => ({
    productive: s.productive / 3600,
    distraction: s.distraction / 3600,
  }));
  drawStackedWeeks(document.getElementById("bars"), weeksForChart, labels);

  const pts = focusSeriesLastDays(buckets, 30);
  drawLineFocus(document.getElementById("line"), pts);

  renderWeekly(document.getElementById("weekly"), buckets, sessions);
}

document.getElementById("reload").addEventListener("click", render);
render();
