import {
  ADMIN_ACTION_QUEUE_TOTAL_CATEGORIES,
  getAdminActionQueueCategoryDef,
} from "@/lib/admin/admin-action-queue-registry";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_BELL_CASH_SEMANTIC,
  ADMIN_REAL_OPERATION_CUT_E_LOCKED,
  CONTROL_PLANE_DEFINITION,
  CUT_A_D_PRODUCTION_CARRY,
  assertAdminRealOperationCutEControlPlaneHardLock,
} from "@/lib/admin/admin-real-operation-cut-e-control-plane-hard-lock";
import {
  adminActionCenterHref,
  sanitizeAdminReturnTo,
  withAdminReturnTo,
} from "@/lib/admin/admin-operation-return-context";
import {
  businessCcDeliveryAdsHref,
  businessCcFinanceHref,
  businessCcSupportHref,
} from "@/lib/admin-business/business-control-center-links";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("CUT E Control Plane", () => {
  it("locks anchors + carry", () => {
    expect(ADMIN_REAL_OPERATION_CUT_E_LOCKED).toBe(true);
    expect(assertAdminRealOperationCutEControlPlaneHardLock()).toBe(true);
    expect(CONTROL_PLANE_DEFINITION.entry).toBe("/admin");
    expect(CONTROL_PLANE_DEFINITION.newDbForbidden).toBe(true);
    expect(ADMIN_BELL_CASH_SEMANTIC.cashCategoryKey).toBe("cash_charges");
    expect(CUT_A_D_PRODUCTION_CARRY.financeProductionE2E).toBe("NOT_PROVEN");
    expect(CUT_A_D_PRODUCTION_CARRY.tabletControlPlane).toBe("NOT_PROVEN");
  });

  it("E17 — Cash queue count excludes AST-002 store_charges from actionable charges", () => {
    const queue = read("lib/admin/admin-action-queue.ts");
    expect(queue).toContain("charges: cash_charges + user_charges");
    expect(queue).toContain("business_cash_charge_requests");
    // AST-002 store_charges is a legacy archive category → never in the Bell total.
    expect(ADMIN_ACTION_QUEUE_TOTAL_CATEGORIES).not.toContain("store_charges");
    expect(ADMIN_ACTION_QUEUE_TOTAL_CATEGORIES).toContain("cash_charges");
    expect(read("components/admin/dashboard/DashboardUrgentBlock.tsx")).toContain(
      "cashChargePendingCount"
    );
    expect(read("app/api/admin/customer-platform/overview/route.ts")).toContain(
      "cash_charge_pending: counts.cash_charges"
    );
  });

  it("E1/E13/E14 — Action Center deep-links domain hubs", () => {
    // Action Required deep-links come from the Action Queue registry.
    expect(getAdminActionQueueCategoryDef("delivery_ad_ops").listHref).toContain("view=actionable");
    // Feed queue UI lives on ad-applications (AdminFeedAdRequestQueue). There is no
    // /admin/feed-ad-requests list page — only /admin/feed-ad-requests/[id] detail.
    expect(getAdminActionQueueCategoryDef("feed_ad_requests").listHref).toBe("/admin/ad-applications?domain=feed");
    expect(getAdminActionQueueCategoryDef("platform_popup_pending").listHref).toBe("/admin/platform-popup");
    // ARO-OPS-UX-002-B6 — actionable = OPEN|WAITING_ADMIN control-plane filter
    expect(getAdminActionQueueCategoryDef("support_actionable").listHref).toBe(
      "/admin/support?filter=ACTIONABLE#action-required"
    );
    expect(adminActionCenterHref()).toBe("/admin#action-center");
  });

  it("E7–E10 — Store hub cross-links", () => {
    expect(businessCcFinanceHref("s1")).toContain("/admin/finance?storeId=s1");
    expect(businessCcDeliveryAdsHref("s1")).toContain("view=actionable");
    expect(businessCcSupportHref("s1")).toContain("search=s1");
    expect(read("components/admin/business/AdminBusinessOpsOverview.tsx")).toContain(
      "data-admin-store-ops-hub-links"
    );
  });

  it("E16 — returnTo / view / tab navigation memory helpers", () => {
    expect(sanitizeAdminReturnTo("/admin?x=1")).toBe("/admin?x=1");
    expect(sanitizeAdminReturnTo("https://evil.test")).toBeNull();
    expect(withAdminReturnTo("/admin/delivery-ads", "/admin")).toContain("returnTo=%2Fadmin");
    // R7 목록 표준: `?view=` 는 useAdminListQuery 추가 키로 주소에 보존 (읽기·쓰기 모두).
    expect(read("components/admin/stores/AdminDeliveryAdsControlPlane.tsx")).toContain(
      'extras: ["view", "product"]'
    );
    expect(read("components/admin/business/AdminBusinessDetailPage.tsx")).toContain(
      'searchParams.get("tab")'
    );
  });

  it("E19/E20 — no new unified shell/db", () => {
    expect(CONTROL_PLANE_DEFINITION.newShellRoutesForbidden).toContain(
      "/admin/control-plane-v2"
    );
    expect(read("components/admin/dashboard/AdminActionCenter.tsx")).not.toContain(
      "admin_delivery_ad_transition"
    );
  });
});
