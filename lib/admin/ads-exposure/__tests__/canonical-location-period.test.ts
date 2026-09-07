import { describe, expect, it } from "vitest";
import {
  formatActualPlacement,
  formatAdsPeriodRange,
  formatAdsRemaining,
  formatPreApprovalRuntimeStatus,
  formatRequestedPlacement,
  parseAdsInstant,
  resolveBoostStoredPeriodBounds,
} from "@/lib/admin/ads-exposure/canonical-location-period";

describe("canonical-location-period", () => {
  it("rejects epoch and pre-2000 timestamps", () => {
    expect(parseAdsInstant("1970-01-01T00:00:00.000Z")).toBeNull();
    expect(parseAdsInstant(0)).toBeNull();
    expect(parseAdsInstant("1999-12-31T00:00:00.000Z")).toBeNull();
    expect(parseAdsInstant("2026-09-07T00:00:00.000Z")).not.toBeNull();
  });

  it("formats period range without inventing 1970", () => {
    expect(formatAdsPeriodRange(null, null, true).label).toBe("—");
    expect(formatAdsPeriodRange("1970-01-01", "2026-09-20", true).error).toBe(true);
    const ok = formatAdsPeriodRange("2026-09-07T09:00:00.000Z", "2026-09-20T23:59:00.000Z", true);
    expect(ok.valid).toBe(true);
    expect(ok.label).not.toMatch(/1970/);
  });

  it("remaining branches", () => {
    const start = "2026-09-10T00:00:00.000Z";
    const end = "2026-09-20T00:00:00.000Z";
    expect(formatAdsRemaining(start, end, Date.parse("2026-09-08T00:00:00.000Z"), true).kind).toBe(
      "until_start"
    );
    expect(formatAdsRemaining(start, end, Date.parse("2026-09-15T00:00:00.000Z"), true).label).toMatch(
      /종료까지/
    );
    expect(formatAdsRemaining(start, end, Date.parse("2026-09-21T00:00:00.000Z"), true).kind).toBe(
      "ended"
    );
    expect(formatAdsRemaining(null, null, Date.now(), true).kind).toBe("missing");
  });

  it("requested placement never invents Slot", () => {
    const req = formatRequestedPlacement({
      kind: "delivery_banner",
      ko: true,
      inventoryKey: "STORES_HOME_HERO",
    });
    expect(req).toContain("상단 배너");
    expect(req).not.toMatch(/Slot/i);
  });

  it("actual placement may append Slot", () => {
    const act = formatActualPlacement({
      kind: "delivery_banner",
      ko: true,
      inventoryKey: "STORES_HOME_HERO",
      slotIndex: 1,
    });
    expect(act).toMatch(/Slot 1/);
  });

  it("boost and popup hierarchies", () => {
    expect(formatRequestedPlacement({ kind: "community_boost", ko: true })).toBe(
      "Community > 게시물 상위노출"
    );
    expect(formatRequestedPlacement({ kind: "trade_boost", ko: true })).toBe(
      "거래 > 게시물 상위노출"
    );
    expect(
      formatRequestedPlacement({ kind: "popup", ko: true, popupSurface: "GLOBAL" })
    ).toBe("전체 서비스 > Popup");
  });

  it("pre-approval runtime is not live/waiting", () => {
    expect(formatPreApprovalRuntimeStatus(true)).toBe("승인 전");
    expect(formatPreApprovalRuntimeStatus(true)).not.toMatch(/노출/);
  });

  it("Boost recovers end from stored duration_days when end_at is epoch", () => {
    const bounds = resolveBoostStoredPeriodBounds({
      startAt: "2026-08-10T13:40:34.73051+00:00",
      endAt: "1970-01-01T00:00:00+00:00",
      durationDays: 3,
    });
    expect(bounds.recoveredEndFromDuration).toBe(true);
    expect(bounds.startAt).toMatch(/^2026-08-10T13:40:34\.730/);
    expect(bounds.endAt).toMatch(/^2026-08-13T13:40:34\.730/);
    const period = formatAdsPeriodRange(bounds.startAt, bounds.endAt, true);
    expect(period.valid).toBe(true);
    expect(period.label).not.toMatch(/기간 정보 오류|1970/);
    const rem = formatAdsRemaining(
      bounds.startAt,
      bounds.endAt,
      Date.parse("2026-09-07T00:00:00.000Z"),
      true
    );
    expect(rem.kind).toBe("ended");
    expect(rem.label).toBe("종료됨");
  });
});
