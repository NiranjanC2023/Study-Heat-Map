export type SiteKind = "productive" | "distraction" | "neutral";

export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

export function hostnameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return normalizeHost(u.hostname);
  } catch {
    return "";
  }
}

export function parseRule(line: string): { host: string; pathPrefix: string | null } {
  const s = line.trim().toLowerCase().replace(/^www\./, "");
  if (!s) return { host: "", pathPrefix: null };
  const slash = s.indexOf("/");
  if (slash === -1) return { host: s, pathPrefix: null };
  return { host: s.slice(0, slash), pathPrefix: s.slice(slash) };
}

function hostMatchesRuleHost(h: string, ruleHost: string): boolean {
  if (!ruleHost) return false;
  return h === ruleHost || h.endsWith("." + ruleHost);
}

export function ruleMatchesUrl(url: string, ruleLine: string): boolean {
  try {
    const u = new URL(url);
    const h = normalizeHost(u.hostname);
    const { host, pathPrefix } = parseRule(ruleLine);
    if (!host) return false;
    if (!hostMatchesRuleHost(h, host)) return false;
    if (pathPrefix == null) return true;
    return u.pathname.startsWith(pathPrefix);
  } catch {
    return false;
  }
}

export function classifyUrl(
  url: string,
  productiveRules: string[],
  distractionRules: string[]
): SiteKind {
  if (!url || url.startsWith("chrome://") || url.startsWith("edge://")) return "neutral";
  try {
    new URL(url);
  } catch {
    return "neutral";
  }
  for (const r of productiveRules) {
    if (ruleMatchesUrl(url, r)) return "productive";
  }
  for (const r of distractionRules) {
    if (ruleMatchesUrl(url, r)) return "distraction";
  }
  return "neutral";
}
