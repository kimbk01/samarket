import { describe, expect, it } from "vitest";
import { communityPostPublicDisplayClock } from "@/lib/community/community-publication-time";

describe("communityPostPublicDisplayClock", () => {
  it("imported prefers trustworthy display_date", () => {
    expect(
      communityPostPublicDisplayClock({
        origin_kind: "imported",
        display_date: "2024-01-15T08:00:00.000Z",
        published_at: "2025-06-01T00:00:00.000Z",
        created_at: "2025-06-01T00:00:00.000Z",
      })
    ).toBe("2024-01-15T08:00:00.000Z");
  });

  it("native uses published_at / created_at", () => {
    expect(
      communityPostPublicDisplayClock({
        origin_kind: "member",
        display_date: "2024-01-15T08:00:00.000Z",
        published_at: "2025-06-01T00:00:00.000Z",
        created_at: "2025-05-01T00:00:00.000Z",
      })
    ).toBe("2025-06-01T00:00:00.000Z");
  });
});
