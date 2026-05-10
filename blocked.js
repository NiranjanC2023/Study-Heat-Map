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

// src/blocked.ts
function params() {
  return new URLSearchParams(window.location.search);
}
function targetUrl() {
  const t = params().get("target");
  return t ? decodeURIComponent(t) : "";
}
async function refreshUi() {
  const target = targetUrl();
  const host = hostnameFromUrl(target);
  document.getElementById("targetHost").textContent = host ? `Blocked: ${host}` : "";
  let snap;
  try {
    snap = await chrome.runtime.sendMessage({ type: "GET_FOCUS_BLOCK_UI" });
  } catch {
    return;
  }
  const deep = snap.deepFocus === true;
  const deepHint = document.getElementById("deepHint");
  const btnOverride = document.getElementById("btnOverride");
  const hint = document.getElementById("overrideHint");
  deepHint.hidden = !deep;
  if (deep) {
    btnOverride.hidden = true;
    hint.hidden = true;
    return;
  }
  const cool = snap.cooldownRemainingMs ?? 0;
  btnOverride.hidden = false;
  if (cool > 0) {
    btnOverride.disabled = true;
    hint.hidden = false;
    const sec = Math.ceil(cool / 1e3);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    hint.textContent = m > 0 ? `Override on cooldown \u2014 try again in ${m}m ${s}s.` : `Override on cooldown \u2014 try again in ${s}s.`;
  } else {
    btnOverride.disabled = false;
    hint.hidden = false;
    hint.textContent = `Allows this site for ${snap.durationMin ?? 10} minutes. Next override needs a ${snap.cooldownMin ?? 30} minute cooldown.`;
  }
}
document.getElementById("btnBack").addEventListener("click", () => {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  chrome.tabs.getCurrent((tab) => {
    if (tab?.id != null) chrome.tabs.remove(tab.id);
  });
});
document.getElementById("btnOverride").addEventListener("click", async () => {
  const target = targetUrl();
  if (!target) return;
  try {
    await chrome.runtime.sendMessage({
      type: "FOCUS_OVERRIDE_AND_GO",
      target
    });
  } catch {
  }
});
void refreshUi();
setInterval(() => void refreshUi(), 1e3);
