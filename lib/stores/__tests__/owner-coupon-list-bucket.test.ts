import { describe, expect, it } from "vitest";
import {
  ownerCouponDetailActions,
  ownerCouponListStatus,
  ownerCouponListTab,
} from "@/lib/stores/owner-coupon-list-bucket";

const NOW = Date.parse("2026-08-25T12:00:00.000Z");

describe("CUT UI-1 Owner coupon list buckets", () => {
  it("maps active window to 진행중", () => {
    expect(
      ownerCouponListTab(
        {
          lifecycle_state: "active",
          start_at: "2026-08-01T00:00:00.000Z",
          end_at: "2026-09-01T00:00:00.000Z",
        },
        NOW
      )
    ).toBe("active");
  });

  it("maps paused into 진행중 tab with paused status", () => {
    const row = {
      lifecycle_state: "paused",
      start_at: "2026-08-01T00:00:00.000Z",
      end_at: "2026-09-01T00:00:00.000Z",
    };
    expect(ownerCouponListTab(row, NOW)).toBe("active");
    expect(ownerCouponListStatus(row, NOW)).toBe("paused");
  });

  it("maps future start to 예정", () => {
    expect(
      ownerCouponListTab(
        {
          lifecycle_state: "active",
          start_at: "2026-09-01T00:00:00.000Z",
          end_at: "2026-10-01T00:00:00.000Z",
        },
        NOW
      )
    ).toBe("upcoming");
  });

  it("maps ended/revoked and past end_at to 종료", () => {
    expect(ownerCouponListTab({ lifecycle_state: "ended" }, NOW)).toBe("ended");
    expect(ownerCouponListTab({ lifecycle_state: "revoked" }, NOW)).toBe("ended");
    expect(
      ownerCouponListTab(
        {
          lifecycle_state: "active",
          start_at: "2026-07-01T00:00:00.000Z",
          end_at: "2026-08-01T00:00:00.000Z",
        },
        NOW
      )
    ).toBe("ended");
  });

  it("maps requested to 예정 / 승인 대기", () => {
    const row = { lifecycle_state: "requested", start_at: "2026-08-01T00:00:00.000Z", end_at: "2026-09-01T00:00:00.000Z" };
    expect(ownerCouponListTab(row, NOW)).toBe("upcoming");
    expect(ownerCouponListStatus(row, NOW)).toBe("requested");
  });
});

describe("B3 owner coupon detail actions", () => {
  it("active: pause / end / reissue", () => {
    expect(ownerCouponDetailActions("active")).toEqual(["pause", "end", "reissue"]);
  });
  it("paused: resume / end / reissue", () => {
    expect(ownerCouponDetailActions("paused")).toEqual(["resume", "end", "reissue"]);
  });
  it("ended: reissue only", () => {
    expect(ownerCouponDetailActions("ended")).toEqual(["reissue"]);
  });
  it("requested: no owner ops CTAs", () => {
    expect(ownerCouponDetailActions("requested")).toEqual([]);
  });
});
