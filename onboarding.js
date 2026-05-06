// src/onboarding.ts
document.getElementById("done").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "COMPLETE_ONBOARDING" });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await chrome.tabs.remove(tab.id);
});
document.getElementById("openSettings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
