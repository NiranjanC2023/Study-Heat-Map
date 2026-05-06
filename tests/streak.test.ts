import { describe, it, expect } from "vitest";
import { computeStreak } from "../src/lib/streak";

describe("computeStreak", () => {
  it("counts consecutive goal days ending before today if today not met", () => {
    const buckets: Record<string, { productive?: number }> = {
      "2026-05-04": { productive: 8000 },
      "2026-05-05": { productive: 8000 },
      "2026-05-06": { productive: 10 },
    };
    const today = new Date(2026, 4, 6);
    expect(computeStreak(buckets, 120, today)).toBe(2);
  });

  it("includes today when goal met", () => {
    const buckets: Record<string, { productive?: number }> = {
      "2026-05-05": { productive: 8000 },
      "2026-05-06": { productive: 8000 },
    };
    const today = new Date(2026, 4, 6);
    expect(computeStreak(buckets, 120, today)).toBe(2);
  });
});
