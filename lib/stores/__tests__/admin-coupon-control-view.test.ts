import { describe, expect, it } from "vitest";
import {
  adminCouponAuditActionMessageKey,
  adminCouponFundingMessageKey,
  adminCouponLifecycleMessageKey,
  formatAdminCouponDay,
  humanAdminOrderNo,
  humanAdminStoreName,
  looksLikeRawOperatorToken,
} from "@/lib/stores/admin-coupon-control-view";

describe("CUT UI-5 admin coupon control presentation", () => {
  it("formats dates without ISO T", () => {
    const day = formatAdminCouponDay("2026-08-25T16:14:00+00:00");
    expect(day).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
    expect(day).not.toContain("T");
    expect(day).not.toContain("-");
  });

  it("maps enums to catalog keys, not raw tokens", () => {
    expect(adminCouponLifecycleMessageKey("active")).toBe("store_coupon_owner_status_active");
    expect(adminCouponLifecycleMessageKey("requested")).toBe("store_coupon_owner_status_requested");
    expect(adminCouponFundingMessageKey("STORE_FUNDED")).toBe("store_coupon_funding_store");
    expect(adminCouponFundingMessageKey("PLATFORM_FUNDED")).toBe("store_coupon_funding_platform");
    expect(adminCouponAuditActionMessageKey("revoke")).toBe("store_coupon_admin_revoke");
  });

  it("does not treat UUID as store or order label", () => {
    expect(humanAdminStoreName("19085860-52d2-4183-b033-e71fcb58bcec")).toBeNull();
    expect(humanAdminStoreName("나의 오른손딸방")).toBe("나의 오른손딸방");
    expect(humanAdminOrderNo(null, "ff15dfa6-36d2-4577-a60e-a6f5312ddb9c")).toBeNull();
    expect(humanAdminOrderNo("SO1787662467219f980", "ff15dfa6-36d2-4577-a60e-a6f5312ddb9c")).toBe(
      "SO1787662467219f980"
    );
  });

  it("does not treat snake_case or ISO as operator copy", () => {
    expect(looksLikeRawOperatorToken("STORE_FUNDED")).toBe(true);
    expect(looksLikeRawOperatorToken("completed")).toBe(false);
    expect(looksLikeRawOperatorToken("2026-08-25T16:14:00+00:00")).toBe(true);
  });
});
