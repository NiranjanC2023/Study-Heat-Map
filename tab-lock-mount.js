// src/tab-lock-mount.ts
var ROOT_ID = "study-heatmap-tab-lock-root";
function mount() {
  if (document.getElementById(ROOT_ID)) return;
  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.setAttribute("data-study-heatmap-lock", "true");
  root.innerHTML = `
    <style>
      #${ROOT_ID} { all: initial; font-family: system-ui, sans-serif; }
      #${ROOT_ID} .shm-lock-bar {
        position: fixed; top: 0; left: 0; right: 0; z-index: 2147483646;
        display: flex; align-items: center; justify-content: center; gap: 8px;
        padding: 8px 12px;
        background: linear-gradient(90deg, rgba(234,88,12,0.95), rgba(194,65,12,0.95));
        color: #fff; font-size: 13px; font-weight: 650;
        box-shadow: 0 2px 12px rgba(0,0,0,0.25);
        letter-spacing: 0.02em;
      }
      #${ROOT_ID} .shm-lock-icon { font-size: 15px; }
    </style>
    <div class="shm-lock-bar" role="status" aria-live="polite">
      <span class="shm-lock-icon" aria-hidden="true">\u{1F512}</span>
      <span>Tab locked \u2014 Study Heatmap</span>
    </div>
  `;
  document.documentElement.appendChild(root);
  window.addEventListener(
    "beforeunload",
    (e) => {
      e.preventDefault();
      e.returnValue = "";
    },
    { capture: true }
  );
}
mount();
