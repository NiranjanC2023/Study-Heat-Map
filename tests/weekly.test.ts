import { describe, it, expect } from "vitest";
import { productiveSecondsThisIsoWeek, weeklyGoalProgressPercent } from "../src/lib/weekly";

describe("weekly aggregates", () => {
  it("sums productive seconds for ISO week starting Monday", () => {
    const monday = new Date(2026, 4, 4);
    const buckets = {
      "2026-05-04": { productive: 3600, distraction: 0, neutral: 0, study: 0 },
      "2026-05-05": { productive: 1800, distraction: 0, neutral: 0, study: 0 },
    };
    expect(productiveSecondsThisIsoWeek(buckets, monday)).toBe(5400);
  });

  it("caps weekly goal percent at 100", () => {
    expect(weeklyGoalProgressPercent(600 * 60, 10)).toBe(100);
    expect(weeklyGoalProgressPercent(300 * 60, 600)).toBe(50);
  });
});
