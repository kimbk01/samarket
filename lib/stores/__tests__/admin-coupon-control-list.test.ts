import { describe, expect, it } from "vitest";
import {
  adminCouponListPageCount,
  filterAdminCouponListRows,
  paginateAdminCouponListRows,
} from "@/lib/stores/admin-coupon-control-list";

describe("A2 admin coupon list", () => {
  const rows = [
    { store_id: "a", lifecycle_state: "active", funding_mode: "STORE_FUNDED" },
    { store_id: "a", lifecycle_state: "requested", funding_mode: "PLATFORM_FUNDED" },
    { store_id: "b", lifecycle_state: "ended", funding_mode: "SHARED_FUNDED" },
  ];

  it("filters by status, funding, and store without exposing ids in the helper result shape", () => {
    expect(filterAdminCouponListRows(rows, { status: "waiting", funding: "all", storeId: "" })).toHaveLength(1);
    expect(filterAdminCouponListRows(rows, { status: "all", funding: "STORE_FUNDED", storeId: "" })).toHaveLength(1);
    expect(filterAdminCouponListRows(rows, { status: "all", funding: "all", storeId: "b" })).toHaveLength(1);
  });

  it("pages so the document does not need every row at once", () => {
    const many = Array.from({ length: 23 }, (_, i) => ({
      store_id: "a",
      lifecycle_state: "active",
      funding_mode: "STORE_FUNDED",
      n: i,
    }));
    expect(adminCouponListPageCount(many.length)).toBe(3);
    expect(paginateAdminCouponListRows(many, 2)).toHaveLength(10);
    expect(paginateAdminCouponListRows(many, 3)).toHaveLength(3);
  });
});
