import { describe, expect, it } from "vitest";
import {
  adsOpsStatusLabel,
  mapRawToAdsOpsStatus,
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

  it("ends when endAt passed", () => {
    expect(
      projectAdsOpsStatus({
        rawStatus: "ACTIVE",
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: "2026-09-01T00:00:00.000Z",
        nowMs: now,
      })
    ).toBe("ended");
  });
});

describe("adsOpsStatusLabel", () => {
  it("returns Owner/Admin human labels", () => {
    expect(adsOpsStatusLabel("live", true)).toBe("노출 중");
    expect(adsOpsStatusLabel("pending", false)).toBe("Pending approval");
  });
});
