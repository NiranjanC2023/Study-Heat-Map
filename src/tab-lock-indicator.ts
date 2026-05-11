/**
 * Content script that displays a visual lock indicator on locked tabs
 */

let isLocked = false;

function createLockIndicator(): void {
  // Remove existing indicator
  const existing = document.getElementById("focus-flow-lock-indicator");
  if (existing) existing.remove();

  const indicator = document.createElement("div");
  indicator.id = "focus-flow-lock-indicator";
  indicator.innerHTML = `
    <div class="lock-badge">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 9c0-2.761 2.239-5 5-5s5 2.239 5 5v2h1.5c0.827 0 1.5 0.673 1.5 1.5v8c0 0.827-0.673 1.5-1.5 1.5h-12c-0.827 0-1.5-0.673-1.5-1.5v-8c0-0.827 0.673-1.5 1.5-1.5h1.5v-2zm1 2h10v-2c0-1.656-1.343-3-3-3s-3 1.343-3 3v2z"/>
      </svg>
      Locked
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #focus-flow-lock-indicator {
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    .lock-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.35);
      animation: slideDown 0.3s ease-out;
    }

    .lock-badge svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;

  if (document.head) {
    document.head.appendChild(style);
  }
  document.body.appendChild(indicator);
}

function removeLockIndicator(): void {
  const indicator = document.getElementById("focus-flow-lock-indicator");
  if (indicator) {
    indicator.remove();
  }
}

async function checkIfLocked(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "CHECK_TAB_LOCKED",
    });
    const wasLocked = isLocked;
    isLocked = response?.locked === true;

    if (isLocked && !wasLocked) {
      createLockIndicator();
    } else if (!isLocked && wasLocked) {
      removeLockIndicator();
    }
  } catch {
    // Extension might not be available
  }
}

// Check status on load and periodically
checkIfLocked().catch(console.error);
const checkInterval = setInterval(() => {
  checkIfLocked().catch(console.error);
}, 2000);

// Cleanup on page unload
window.addEventListener("unload", () => {
  clearInterval(checkInterval);
});

// Listen for messages from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "UPDATE_LOCK_INDICATOR") {
    isLocked = msg.locked === true;
    if (isLocked) {
      createLockIndicator();
    } else {
      removeLockIndicator();
    }
  }
});
