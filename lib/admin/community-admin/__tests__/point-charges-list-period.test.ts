import { describe, expect, it } from "vitest";
import { pointChargesListPeriodDates } from "@/lib/admin/community-admin/point-charges-list-period";

// 2026-11-04 10:00 PHT
const now = new Date("2026-11-04T02:00:00.000Z");

describe("pointChargesListPeriodDates", () => {
  it("날짜를 고르면 그대로 (종료일만 비면 오늘 PHT)", () => {
    expect(pointChargesListPeriodDates({ from: "2026-10-01", to: "2026-10-31" }, now)).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(pointChargesListPeriodDates({ from: "2026-11-01" }, now)).toEqual({ from: "2026-11-01", to: "2026-11-04" });
  });

  it("옛 프리셋 딥링크는 날짜로 바꾼다", () => {
    expect(pointChargesListPeriodDates({ legacyPeriod: "today" }, now)).toEqual({ from: "2026-11-04", to: "2026-11-04" });
    expect(pointChargesListPeriodDates({ legacyPeriod: "7d" }, now)).toEqual({ from: "2026-10-29", to: "2026-11-04" });
  });

  it("날짜도 프리셋도 없으면 전체 기간", () => {
    expect(pointChargesListPeriodDates({}, now)).toEqual({ from: null, to: null });
    expect(pointChargesListPeriodDates({ legacyPeriod: "bogus" }, now)).toEqual({ from: null, to: null });
  });

  it("날짜가 프리셋보다 우선", () => {
    expect(pointChargesListPeriodDates({ legacyPeriod: "7d", from: "2026-09-01", to: "2026-09-30" }, now)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });
});
