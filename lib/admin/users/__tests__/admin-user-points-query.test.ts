import { describe, expect, it } from "vitest";
import {
  ADMIN_USER_POINTS_PAGE_SIZE,
  adminUserPointsOffset,
  adminUserPointsPeriodRangeLabel,
  buildAdminUserPointsQuery,
} from "@/lib/admin/users/admin-user-points-query";

const thisMonth = { period: "this_month" as const, fromDay: "", toDay: "" };

describe("adminUserPointsOffset", () => {
  it("쪽 번호(1부터) → offset, 잘못된 값은 1쪽", () => {
    expect(adminUserPointsOffset(1)).toBe(0);
    expect(adminUserPointsOffset(3)).toBe(2 * ADMIN_USER_POINTS_PAGE_SIZE);
    expect(adminUserPointsOffset(0)).toBe(0);
    expect(adminUserPointsOffset(undefined)).toBe(0);
    expect(adminUserPointsOffset(2, 50)).toBe(50);
  });
});

describe("buildAdminUserPointsQuery", () => {
  it("전체 조회: 기간·필터·내역 1쪽·충전 신청 1쪽", () => {
    const qs = buildAdminUserPointsQuery({ section: "all", filter: "credit", periodQ: thisMonth });
    expect(qs.get("section")).toBeNull();
    expect(qs.get("period")).toBe("this_month");
    expect(qs.get("from")).toBeNull();
    expect(qs.get("filter")).toBe("credit");
    expect(qs.get("histOffset")).toBe("0");
    expect(qs.get("histLimit")).toBe("20");
    expect(qs.get("chargeOffset")).toBe("0");
    expect(qs.get("chargeLimit")).toBe("20");
  });

  it("내역 쪽 이동: section=history · 해당 offset · 충전 키 없음", () => {
    const qs = buildAdminUserPointsQuery({
      section: "history",
      filter: "all",
      periodQ: { period: "custom", fromDay: "2026-10-01", toDay: "2026-10-31" },
      historyPage: 4,
    });
    expect(qs.get("section")).toBe("history");
    expect(qs.get("period")).toBe("custom");
    expect(qs.get("from")).toBe("2026-10-01");
    expect(qs.get("to")).toBe("2026-10-31");
    expect(qs.get("histOffset")).toBe("60");
    expect(qs.get("chargeOffset")).toBeNull();
  });

  it("충전 신청 쪽 이동: section=charges · 내역 키 없음", () => {
    const qs = buildAdminUserPointsQuery({ section: "charges", filter: "debit", periodQ: thisMonth, chargePage: 2 });
    expect(qs.get("section")).toBe("charges");
    expect(qs.get("chargeOffset")).toBe("20");
    expect(qs.get("histOffset")).toBeNull();
    expect(qs.get("filter")).toBeNull();
  });
});

describe("adminUserPointsPeriodRangeLabel", () => {
  it("UTC [from, to) → PHT 포함 날짜", () => {
    // 2026-11-01 00:00 PHT = 2026-10-31T16:00Z · 끝 2026-11-05 00:00 PHT (미포함)
    expect(
      adminUserPointsPeriodRangeLabel({ fromIso: "2026-10-31T16:00:00.000Z", toIso: "2026-11-04T16:00:00.000Z" }, true)
    ).toBe("2026-11-01 ~ 2026-11-04 (PHT)");
  });
  it("경계 없음 = 전체 기간", () => {
    expect(adminUserPointsPeriodRangeLabel({ fromIso: null, toIso: null }, true)).toBe("전체 기간");
    expect(adminUserPointsPeriodRangeLabel({ fromIso: null, toIso: null }, false)).toBe("All time");
    expect(adminUserPointsPeriodRangeLabel(null, true)).toBeNull();
  });
});
