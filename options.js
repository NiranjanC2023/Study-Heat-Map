import { STORAGE_KEYS } from "./shared.js";

function parseList(text) {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim().toLowerCase().replace(/^www\./, ""))
    .filter(Boolean);
}

async function load() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.productiveHosts,
    STORAGE_KEYS.distractionHosts,
  ]);
  const p = data[STORAGE_KEYS.productiveHosts] || [];
  const d = data[STORAGE_KEYS.distractionHosts] || [];
  document.getElementById("productive").value = p.join("\n");
  document.getElementById("distraction").value = d.join("\n");
}

document.getElementById("save").addEventListener("click", async () => {
  const productive = parseList(document.getElementById("productive").value);
  const distraction = parseList(document.getElementById("distraction").value);
  await chrome.storage.local.set({
    [STORAGE_KEYS.productiveHosts]: productive,
    [STORAGE_KEYS.distractionHosts]: distraction,
  });
  const st = document.getElementById("status");
  st.textContent = "Saved. New tabs will use these lists on the next focus tick.";
  st.className = "status ok";
  setTimeout(() => {
    st.textContent = "";
    st.className = "status";
  }, 3200);
});

load();
