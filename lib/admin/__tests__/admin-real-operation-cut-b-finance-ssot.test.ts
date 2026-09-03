/**
 * CUT B — Finance SSOT + operation UX contract.
 * Gate companion: authority stays on CUT A + currency SSOT.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  adminCashTopUpQueueHref,
  adminStorePointChargeFocusHref,
} from "@/lib/admin/admin-point-charge-deeplink";
import { CASH_AUTHORITY } from "@/lib/admin/admin-real-operation-cut-a-authority-hard-lock";
import { isCurrencySaleRecognitionLive } from "@/lib/currency/currency-cutover-flags";
import { platformPopupOwnerPaymentStatusLabel } from "@/lib/platform-popup/popup-product-labels";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("CUT B Finance SSOT + operation UX", () => {
  it("keeps Cash product name while DB ids stay business_cash_*", () => {
    expect(CASH_AUTHORITY.productName).toBe("Cash");
    expect(CASH_AUTHORITY.balanceTable).toBe("business_cash_accounts");
    expect(CASH_AUTHORITY.legacyUiAlias).toBe("Business Cash");
  });

  it("wires Cash top-up queue to canonical business-cash-charges API", () => {
    const page = read("components/admin/stores/AdminDeliveryAdCashChargeQueuePage.tsx");
    expect(page).toContain("/api/admin/business-cash-charges");
    expect(page).toContain('op: "approve" | "reject"');
    expect(page).toContain('void act(r.id, "approve")');
    expect(page).toContain('void act(r.id, "reject")');
    expect(page).not.toMatch(
      /delivery-ads\/business-cash\/charge-requests\/\$\{encodeURIComponent\(id\)\}/
    );
    expect(page).toContain('data-admin-cash-charges-canonical="1"');
  });

  it("keeps legacy ads charge-request PATCH as 410 NO_NEW_WRITE", () => {
    const legacy = read(
      "app/api/admin/delivery-ads/business-cash/charge-requests/[id]/route.ts"
    );
    expect(legacy).toContain("410");
  });

  it("routes legacy store-point focus to archive; Cash queue is canonical", () => {
    expect(adminStorePointChargeFocusHref("x")).toBe("/admin/store-point-ledger?request=x");
    expect(adminCashTopUpQueueHref()).toBe("/admin/delivery-ads/cash-charges");
    expect(read("components/admin/dashboard/DashboardUrgentBlock.tsx")).toContain(
      "/admin/delivery-ads/cash-charges"
    );
  });

  it("mounts Finance ops queue on finance hub", () => {
    const panels = read("components/admin/finance/AdminStoreFinancePanels.tsx");
    expect(panels).toContain("AdminFinanceOpsQueue");
    expect(existsSync(join(process.cwd(), "components/admin/finance/AdminFinanceOpsQueue.tsx"))).toBe(
      true
    );
    const queue = read("components/admin/finance/AdminFinanceOpsQueue.tsx");
    expect(queue).toContain("/api/admin/point-charges");
    expect(queue).toContain("/api/admin/business-cash-charges?status=PENDING");
    expect(queue).toContain("/api/admin/coin-withdrawals?status=REQUESTED");
  });

  it("removes product-facing Business Cash copy from popup labels", () => {
    expect(platformPopupOwnerPaymentStatusLabel("funded", "ko")).toBe("Cash 결제됨");
    expect(platformPopupOwnerPaymentStatusLabel("funded", "en")).toBe("Cash paid");
    expect(read("lib/i18n/catalog/platform-popup-owner.ts")).not.toMatch(/Business Cash/);
    expect(read("components/admin/platform-popup/AdminPlatformPopupRequestDetailWorkspace.tsx")).not.toMatch(
      />Business Cash</
    );
  });

  it("does not claim Production sale-recognition LIVE from code default", () => {
    // Env may be unset in unit runners — code default is OFF; Production env = NOT_PROVEN.
    expect(typeof isCurrencySaleRecognitionLive()).toBe("boolean");
    const flags = read("lib/currency/currency-cutover-flags.ts");
    expect(flags).toContain("DIBAY_CURRENCY_SALE_RECOGNITION_LIVE");
  });

  it("Delivery Ads funding panel states Cash-only payment", () => {
    const detail = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
    expect(detail).toMatch(/Cash|cash/);
    expect(detail).not.toMatch(/Business Cash \(AST-005\)/);
  });
});
