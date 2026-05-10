import { classifyUrl } from "./classify";

export function isDistractionUrl(
  url: string,
  productiveRules: string[],
  distractionRules: string[]
): boolean {
  return classifyUrl(url, productiveRules, distractionRules) === "distraction";
}

export function isAllowlistedNavigationUrl(url: string, extensionOrigin: string): boolean {
  if (!url) return true;
  if (url.startsWith("chrome-extension:") && url.includes("/blocked.html")) return true;
  if (url.startsWith(extensionOrigin)) return true;
  if (
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("devtools:")
  ) {
    return true;
  }
  return false;
}
