import { describe, expect, it } from "vitest";
import { loadBusinessCcKpiSummary } from "@/lib/admin-business/load-business-cc-kpi";

describe("loadBusinessCcKpiSummary", () => {
  it("returns empty shape for blank store id without querying", async () => {
    const kpi = await loadBusinessCcKpiSummary({ from: () => {
      throw new Error("should not query");
    } } as never, "  ", {
      productCount: 2,
      reviewCount: 1,
    });
    expect(kpi.productCount).toBe(2);
    expect(kpi.reviewCount).toBe(1);
    expect(kpi.recentOrders).toEqual([]);
    expect(kpi.soldOutProductCount).toBe(0);
    expect(kpi.openReportCount).toBe(0);
  });
});
