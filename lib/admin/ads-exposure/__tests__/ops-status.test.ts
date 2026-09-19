import { describe, expect, it } from "vitest";
import {
  adsOpsStatusLabel,
  mapRawToAdsOpsStatus,
  projectAdsEffectiveLifecycle,
  projectAdsOpsStatus,
} from "@/lib/admin/ads-exposure/ops-status";

describe("mapRawToAdsOpsStatus", () => {
  it("maps pending / review / 대기", () => {
    expect(mapRawToAdsOpsStatus("PENDING_REVIEW")).toBe("pending");
    expect(mapRawToAdsOpsStatus("승인 대기")).toBe("pending");
    expect(mapRawToAdsOpsStatus("in_review")).toBe("pending");
  });

  it("maps approved without active → scheduled; active → live", () => {
    expect(mapRawToAdsOpsStatus("APPROVED")).toBe("scheduled");
    expect(mapRawToAdsOpsStatus("approved_active")).toBe("live");
  });

  it("maps pause / reject / end", () => {
    expect(mapRawToAdsOpsStatus("PAUSED_OWNER")).toBe("paused");
    expect(mapRawToAdsOpsStatus("REJECTED")).toBe("rejected");
    expect(mapRawToAdsOpsStatus("ENDED")).toBe("ended");
  });
});

describe("projectAdsOpsStatus", () => {
  const now = Date.parse("2026-09-07T00:00:00.000Z");

  it("keeps pending / rejected fixed", () => {
    expect(
      projectAdsOpsStatus({
        rawStatus: "PENDING_REVIEW",
        startAt: "2026-09-01T00:00:00.000Z",
        endAt: "2026-09-20T00:00:00.000Z",
        nowMs: now,
      })
    ).toBe("pending");
    expect(
      projectAdsOpsStatus({
        rawStatus: "REJECTED",
        startAt: "2026-09-01T00:00:00.000Z",
        endAt: "2026-09-20T00:00:00.000Z",
        nowMs: now,
      })
    ).toBe("rejected");
  });

  it("projects scheduled → live when window started", () => {
    expect(
      projectAdsOpsStatus({
        rawStatus: "APPROVED",
        startAt: "2026-09-01T00:00:00.000Z",
        endAt: "2026-09-20T00:00:00.000Z",
        nowMs: now,
      })
    ).toBe("live");
  });

  it("projects live → scheduled when start is in the future", () => {
    expect(
      projectAdsOpsStatus({
        rawStatus: "ACTIVE",
        startAt: "2026-09-10T00:00:00.000Z",
        endAt: "2026-09-20T00:00:00.000Z",
        nowMs: now,
      })
    ).toBe("scheduled");
  });

  it("ends when endAt passed (exclusive — Feed parity)", () => {
    expect(
      projectAdsOpsStatus({
        rawStatus: "ACTIVE",
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: "2026-09-01T00:00:00.000Z",
        nowMs: now,
      })
    ).toBe("ended");
  });

  it("A Feed: active + past start + future end → live", () => {
    expect(
      projectAdsOpsStatus({
        rawStatus: "active",
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: "2026-09-20T00:00:00.000Z",
        nowMs: now,
        endBoundary: "exclusive",
      })
    ).toBe("live");
  });

  it("B Feed: active + future start → scheduled", () => {
    expect(
      projectAdsOpsStatus({
        rawStatus: "active",
        startAt: "2026-09-10T00:00:00.000Z",
        endAt: "2026-09-20T00:00:00.000Z",
        nowMs: now,
        endBoundary: "exclusive",
      })
    ).toBe("scheduled");
  });

  it("C Feed: active + past end → ended", () => {
    expect(
      projectAdsOpsStatus({
        rawStatus: "active",
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: "2026-09-01T00:00:00.000Z",
        nowMs: now,
        endBoundary: "exclusive",
      })
    ).toBe("ended");
  });

  it("D Feed: paused in-window → paused", () => {
    expect(
      projectAdsOpsStatus({
        rawStatus: "paused",
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: "2026-09-20T00:00:00.000Z",
        nowMs: now,
      })
    ).toBe("paused");
  });

  it("E Boost: active in-window → live (inclusive)", () => {
    expect(
      projectAdsOpsStatus({
        rawStatus: "active",
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: "2026-09-20T00:00:00.000Z",
        nowMs: now,
        endBoundary: "inclusive",
      })
    ).toBe("live");
  });

  it("F Boost: active expired → ended (inclusive)", () => {
    expect(
      projectAdsOpsStatus({
        rawStatus: "active",
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: "2026-09-01T00:00:00.000Z",
        nowMs: now,
        endBoundary: "inclusive",
      })
    ).toBe("ended");
  });

  it("G Boost: active future → scheduled", () => {
    expect(
      projectAdsOpsStatus({
        rawStatus: "active",
        startAt: "2026-09-10T00:00:00.000Z",
        endAt: "2026-09-20T00:00:00.000Z",
        nowMs: now,
        endBoundary: "inclusive",
      })
    ).toBe("scheduled");
  });

  it("H Boost: ended → ended", () => {
    expect(
      projectAdsOpsStatus({
        rawStatus: "ended",
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: "2026-09-20T00:00:00.000Z",
        nowMs: now,
        endBoundary: "inclusive",
      })
    ).toBe("ended");
  });

  it("Boost inclusive keeps live at exact endAt (= customer end>=now)", () => {
    const end = "2026-09-07T00:00:00.000Z";
    expect(
      projectAdsOpsStatus({
        rawStatus: "active",
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: end,
        nowMs: Date.parse(end),
        endBoundary: "inclusive",
      })
    ).toBe("live");
    expect(
      projectAdsOpsStatus({
        rawStatus: "active",
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: end,
        nowMs: Date.parse(end),
        endBoundary: "exclusive",
      })
    ).toBe("ended");
  });
});

describe("projectAdsEffectiveLifecycle (CUT B)", () => {
  const now = Date.parse("2026-09-19T13:36:00.000Z");

  it("separates stored active from effective ended + eligibleNow false", () => {
    const r = projectAdsEffectiveLifecycle({
      rawStatus: "active",
      startAt: "2026-08-07T14:18:30.803Z",
      endAt: "2026-08-14T14:18:30.803Z",
      nowMs: now,
      endBoundary: "inclusive",
    });
    expect(r.storedStatus).toBe("active");
    expect(r.effectiveStatus).toBe("ended");
    expect(r.customerEligibleNow).toBe(false);
    expect(r.reason).toBe("expired");
  });

  it("Feed expired active: eligibleNow false (AdminFeedAdsListPage contract)", () => {
    const r = projectAdsEffectiveLifecycle({
      rawStatus: "active",
      startAt: "2026-09-05T03:19:00.054Z",
      endAt: "2026-09-08T03:19:00.054Z",
      nowMs: now,
      endBoundary: "exclusive",
    });
    expect(r.storedStatus).toBe("active");
    expect(r.effectiveStatus).toBe("ended");
    expect(r.customerEligibleNow).toBe(false);
  });

  it("in-window active → live + eligibleNow true", () => {
    const r = projectAdsEffectiveLifecycle({
      rawStatus: "active",
      startAt: "2026-09-01T00:00:00.000Z",
      endAt: "2026-09-26T00:00:00.000Z",
      nowMs: now,
    });
    expect(r.effectiveStatus).toBe("live");
    expect(r.customerEligibleNow).toBe(true);
    expect(r.reason).toBeNull();
  });
});

describe("adsOpsStatusLabel", () => {
  it("returns Owner/Admin human labels", () => {
    expect(adsOpsStatusLabel("live", true)).toBe("노출 중");
    expect(adsOpsStatusLabel("pending", false)).toBe("Pending approval");
  });
});
