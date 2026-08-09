import { describe, expect, it } from "vitest";
import {
  feedAdOpsStatusLabel,
  projectFeedAdOpsProductStatus,
  projectFeedAdOpsTimeline,
} from "@/lib/ads/feed-ad-ops-presentation";

describe("feed ad ops presentation SSOT", () => {
  it("maps cancelled ≠ ended labels", () => {
    expect(feedAdOpsStatusLabel("cancelled", "ko")).toBe("취소");
    expect(feedAdOpsStatusLabel("ended", "ko")).toBe("종료");
    expect(feedAdOpsStatusLabel("pending_review", "ko")).toBe("심사중");
    expect(feedAdOpsStatusLabel("active", "ko")).toBe("광고중");
    expect(feedAdOpsStatusLabel("rejected", "ko")).toBe("반려");
    expect(feedAdOpsStatusLabel("scheduled", "ko")).toBe("광고 예정");
  });

  it("projects scheduled from window", () => {
    const now = Date.parse("2026-08-10T00:00:00.000Z");
    expect(
      projectFeedAdOpsProductStatus({
        requestStatus: "active",
        startAt: "2026-08-11T00:00:00.000Z",
        endAt: "2026-08-20T00:00:00.000Z",
        nowMs: now,
      })
    ).toBe("scheduled");
  });

  it("builds timeline from existing fields only", () => {
    const events = projectFeedAdOpsTimeline({
      request: {
        createdAt: "2026-08-09T01:00:00.000Z",
        status: "rejected",
        reviewedAt: "2026-08-09T02:00:00.000Z",
        reviewReason: "policy",
      },
      holds: [
        { amount: 10000, status: "held", createdAt: "2026-08-09T01:00:01.000Z" },
        { amount: 10000, status: "released", createdAt: "2026-08-09T02:00:00.000Z" },
      ],
    });
    expect(events.some((e) => e.kind === "submitted")).toBe(true);
    expect(events.some((e) => e.kind === "rejected")).toBe(true);
    expect(events.some((e) => e.kind === "hold")).toBe(true);
  });
});
