import { describe, expect, it } from "vitest";
import { isoToZonedLocalInput, zonedLocalInputToIso } from "@/lib/platform-popup/zoned-local-time";

/** 광고 감사 G-10 — 어드민 PC 시간대와 무관하게 캠페인 시간대 벽시계로 변환 */
describe("zoned local time (campaign timezone)", () => {
  it("Asia/Manila (UTC+8) round trip", () => {
    expect(zonedLocalInputToIso("2026-11-03T09:00", "Asia/Manila")).toBe("2026-11-03T01:00:00.000Z");
    expect(isoToZonedLocalInput("2026-11-03T01:00:00.000Z", "Asia/Manila")).toBe("2026-11-03T09:00");
  });
  it("other zone and DST (America/New_York)", () => {
    expect(zonedLocalInputToIso("2026-07-01T09:00", "America/New_York")).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedLocalInputToIso("2026-12-01T09:00", "America/New_York")).toBe("2026-12-01T14:00:00.000Z");
    expect(isoToZonedLocalInput("2026-12-01T14:00:00.000Z", "America/New_York")).toBe("2026-12-01T09:00");
  });
  it("invalid zone falls back to Asia/Manila; empty/invalid input → empty/null", () => {
    expect(zonedLocalInputToIso("2026-11-03T09:00", "Not/AZone")).toBe("2026-11-03T01:00:00.000Z");
    expect(zonedLocalInputToIso("", "Asia/Manila")).toBeNull();
    expect(isoToZonedLocalInput(null, "Asia/Manila")).toBe("");
  });
});
