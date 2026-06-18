import { describe, expect, it } from "vitest";
import { areTimelineVirtualRowOffsetsValid } from "@/lib/community-messenger/room/messenger-timeline-layout-mode";

describe("areTimelineVirtualRowOffsetsValid", () => {
  it("accepts finite non-negative starts with unique indices", () => {
    expect(
      areTimelineVirtualRowOffsetsValid([
        { index: 8, start: 0 },
        { index: 9, start: 72 },
        { index: 10, start: 144 },
      ])
    ).toBe(true);
  });

  it("rejects NaN, negative, duplicate index", () => {
    expect(areTimelineVirtualRowOffsetsValid([{ index: 0, start: Number.NaN }])).toBe(false);
    expect(areTimelineVirtualRowOffsetsValid([{ index: -1, start: 0 }])).toBe(false);
    expect(
      areTimelineVirtualRowOffsetsValid([
        { index: 1, start: 0 },
        { index: 1, start: 40 },
      ])
    ).toBe(false);
  });
});
