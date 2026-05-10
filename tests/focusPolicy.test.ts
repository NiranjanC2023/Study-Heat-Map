import { describe, it, expect } from "vitest";
import { isDistractionUrl } from "../src/lib/focusPolicy";

describe("focusPolicy", () => {
  it("detects distraction using productive-first rules", () => {
    const prod = ["youtube.com/playlist"];
    const dist = ["youtube.com"];
    expect(isDistractionUrl("https://youtube.com/watch?v=1", prod, dist)).toBe(true);
    expect(isDistractionUrl("https://youtube.com/playlist/foo", prod, dist)).toBe(false);
  });
});
