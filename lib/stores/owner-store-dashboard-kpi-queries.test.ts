import { describe, expect, it } from "vitest";
import { OWNER_STORE_SETTLEMENT_STATUS_LABEL } from "@/lib/business/owner-store-settlement-labels";

/** 쿼리 모듈은 Supabase mock 없이 export·라벨 계약만 검증 */
describe("owner-store-dashboard-kpi-queries", () => {
  it("settlement labels unrelated — dashboard uses order-counts API", () => {
    expect(OWNER_STORE_SETTLEMENT_STATUS_LABEL.scheduled).toBe("지급 예정");
  });
});
