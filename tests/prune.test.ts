import { describe, it, expect } from "vitest";
import { filterOldDateKeys, cutoffDateKey } from "../src/lib/prune";

describe("prune", () => {
  it("keeps keys on or after cutoff", () => {
    const keys = ["2024-01-01", "2025-06-01", "2026-01-01"];
    expect(filterOldDateKeys(keys, "2025-01-01")).toEqual(["2025-06-01", "2026-01-01"]);
  });

  it("cutoffDateKey moves anchor back by N days", () => {
    const anchor = new Date(2026, 4, 6);
    expect(cutoffDateKey(anchor, 3)).toBe("2026-05-03");
  });
});
