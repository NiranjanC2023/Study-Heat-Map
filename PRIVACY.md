# Privacy policy — Study Heatmap

Last updated: 2026-05-06.

## Summary

Study Heatmap is a browser extension that helps you understand how you spend time on websites. **It does not send your browsing data to our servers** — we do not operate a backend for this extension. Information is stored **locally** in your browser using Chrome’s `storage` APIs.

## What the extension collects

- **Time spent** on sites you classify as productive, distracting, or neutral (based on the active tab in a focused Chrome window).
- **Host-level aggregates** to power “top sites” style summaries.
- **Study session** start/end times, optional notes, and optional Pomodoro settings.
- **Settings** you configure (site rules, daily & weekly goals, notification preference).

## What the extension does not do

- No accounts or sign-in.
- No analytics SDKs or third-party trackers in this repository.
- No sale of data (there is no central collection to sell).

## Permissions (why they exist)

| Permission            | Purpose |
|-----------------------|---------|
| `storage`             | Save settings and time buckets on-device. |
| `tabs`                | Read the **active tab URL** to classify time; open the dashboard/onboarding. |
| `alarms`              | Heartbeat for accruing time and Pomodoro phase reminders. |
| `idle`                | Stop counting when the system/user is idle. |
| `webNavigation`       | Detect in-page URL changes (SPAs) on the active tab. |
| `notifications`       | **Optional** — Pomodoro phase alerts only if you enable them and grant permission. |
| `host_permissions`    | Access tab URLs for classification (required for URL-based rules in MV3). |

## Data retention

Daily aggregates and host rollups are **pruned** automatically after roughly **800 days** to limit storage growth. You can **export or delete** data by removing the extension or clearing site data for the extension in Chrome.

## Open source

Source code is available in the project repository so you can audit behavior. If you install from the Chrome Web Store, install the build published by the author you trust.

## Contact

For privacy questions, open an issue on the GitHub repository hosting this project.
