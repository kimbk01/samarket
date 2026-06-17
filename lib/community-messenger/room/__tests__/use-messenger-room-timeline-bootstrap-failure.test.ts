import { describe, expect, it } from "vitest";
import { shouldMarkTimelineLoadFailed } from "@/lib/community-messenger/room/use-messenger-room-timeline-bootstrap-failure";

describe("shouldMarkTimelineLoadFailed", () => {
  it("blocking bootstrap error with lastMessage hint → failed", () => {
    expect(
      shouldMarkTimelineLoadFailed({
        payload: {
          ok: false,
          httpStatus: 500,
          shouldBlock: true,
          silent: false,
          snapshotMessageCount: 0,
        },
        hasPaint: false,
        hasHint: true,
      })
    ).toBe(true);
  });

  it("blocking bootstrap success with messages → not failed", () => {
    expect(
      shouldMarkTimelineLoadFailed({
        payload: {
          ok: true,
          httpStatus: 200,
          shouldBlock: true,
          silent: false,
          snapshotMessageCount: 12,
        },
        hasPaint: true,
        hasHint: true,
      })
    ).toBe(false);
  });

  it("retry still empty with hint → failed", () => {
    expect(
      shouldMarkTimelineLoadFailed({
        payload: {
          ok: true,
          httpStatus: 200,
          shouldBlock: true,
          silent: false,
          triggerReason: "timeline_bootstrap_retry",
          snapshotMessageCount: 0,
        },
        hasPaint: false,
        hasHint: true,
      })
    ).toBe(true);
  });

  it("no hint → never failed", () => {
    expect(
      shouldMarkTimelineLoadFailed({
        payload: {
          ok: false,
          httpStatus: 500,
          shouldBlock: true,
          silent: false,
          snapshotMessageCount: 0,
        },
        hasPaint: false,
        hasHint: false,
      })
    ).toBe(false);
  });
});
