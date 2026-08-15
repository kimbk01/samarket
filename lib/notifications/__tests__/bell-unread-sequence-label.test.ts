import { describe, expect, it } from "vitest";
import { resolveBellUnreadSequenceLabel } from "@/lib/notifications/bell-unread-sequence-label";

describe("resolveBellUnreadSequenceLabel", () => {
  it("labels unread N as N…1 (never 1…N ascending)", () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => resolveBellUnreadSequenceLabel(i, 6))).toEqual([
      "06",
      "05",
      "04",
      "03",
      "02",
      "01",
    ]);
  });

  it("after opening one unread, remaining re-labels from new length (not stuck at old N)", () => {
    // Was 6,5,4,3,2,1 — user opened label "03" → 5 remain → 5,4,3,2,1
    expect([0, 1, 2, 3, 4].map((i) => resolveBellUnreadSequenceLabel(i, 5))).toEqual([
      "05",
      "04",
      "03",
      "02",
      "01",
    ]);
  });

  it("returns empty outside range", () => {
    expect(resolveBellUnreadSequenceLabel(0, 0)).toBe("");
    expect(resolveBellUnreadSequenceLabel(3, 3)).toBe("");
    expect(resolveBellUnreadSequenceLabel(-1, 2)).toBe("02");
  });
});
