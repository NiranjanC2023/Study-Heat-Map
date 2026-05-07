import { describe, it, expect } from "vitest";
import { classifyUrl, ruleMatchesUrl, parseRule } from "../src/lib/classify";

describe("parseRule", () => {
  it("parses host-only and host+path", () => {
    expect(parseRule("GitHub.com")).toEqual({ host: "github.com", pathPrefix: null });
    expect(parseRule("youtube.com/watch")).toEqual({ host: "youtube.com", pathPrefix: "/watch" });
  });
});

describe("ruleMatchesUrl", () => {
  it("matches subdomains and path prefixes", () => {
    expect(ruleMatchesUrl("https://docs.google.com/document/u", "google.com")).toBe(true);
    expect(ruleMatchesUrl("https://youtube.com/watch?v=1", "youtube.com/watch")).toBe(true);
    expect(ruleMatchesUrl("https://youtube.com/feed", "youtube.com/watch")).toBe(false);
  });
});

describe("classifyUrl", () => {
  it("prefers productive rules over distraction", () => {
    const url = "https://youtube.com/watch?v=1";
    expect(classifyUrl(url, ["youtube.com/watch"], ["youtube.com"])).toBe("productive");
    expect(classifyUrl(url, [], ["youtube.com"])).toBe("distraction");
  });

  it("returns neutral for internal browser URLs", () => {
    expect(classifyUrl("chrome://version", ["version"], [])).toBe("neutral");
  });

  it("treats file and blob URLs as neutral", () => {
    expect(classifyUrl("file:///Users/me/paper.pdf", ["me"], [])).toBe("neutral");
    expect(classifyUrl("blob:https://example.com/uuid", ["example.com"], [])).toBe("neutral");
  });
});
