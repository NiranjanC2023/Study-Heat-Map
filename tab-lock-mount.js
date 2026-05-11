// src/tab-lock-mount.ts
var ROOT_ID = "focus-flow-tab-lock-root";
function mount() {
  if (document.getElementById(ROOT_ID)) return;
  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.setAttribute("data-focus-flow-lock", "true");
  root.innerHTML = `
    <style>
      #${ROOT_ID} { all: initial; font-family: system-ui, sans-serif; }
      #${ROOT_ID} .shm-lock-bar {
        position: fixed; top: 0; left: 0; right: 0; z-index: 2147483646;
        display: flex; align-items: center; justify-content: center; gap: 10px;
        padding: 9px 14px;
        background: linear-gradient(90deg, rgba(8,8,8,0.97), rgba(20,20,20,0.96));
        color: #fafafa; font-size: 13px; font-weight: 750;
        border-bottom: 1px solid rgba(255,255,255,0.22);
        box-shadow: 0 0 24px rgba(255,255,255,0.12), 0 8px 32px rgba(0,0,0,0.55);
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      #${ROOT_ID} .shm-lock-icon { font-size: 15px; filter: drop-shadow(0 0 8px rgba(255,255,255,0.45)); }
    </style>
    <div class="shm-lock-bar" role="status" aria-live="polite">
      <span class="shm-lock-icon" aria-hidden="true">\u{1F512}</span>
      <span>Tab locked \u2014 Focus Flow</span>
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
