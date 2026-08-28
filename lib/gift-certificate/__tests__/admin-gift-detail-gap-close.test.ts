import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("admin gift detail gap close static", () => {
  it("date field has no native datetime-local", () => {
    const field = source("components/gift-certificate/GiftSalesDateTimeField.tsx");
    expect(field).not.toContain("datetime-local");
    expect(field).toContain('type="date"');
    expect(field).toContain("gift_ops_datetime_apply");
  });

  it("gift product detail uses gift-owned upload not app-notices", () => {
    const detail = source("components/admin/gift/panels/AdminGiftProductDetailConsole.tsx");
    expect(detail).toContain("/api/admin/gift-certificates/upload-image");
    expect(detail).not.toContain("/api/admin/app-notices/upload-image");
    expect(detail).toContain('data-admin-gift-product-activate="1"');
    expect(detail).toContain('data-admin-gift-product-unarchive="1"');
    expect(detail).toContain("discountFundingParty");
    expect(detail).toContain("gift_ops_expiry_edit_blocked");
  });

  it("tracking API falls back when validity columns are absent", () => {
    const route = source("app/api/admin/gift-certificates/tracking/route.ts");
    expect(route).toContain("INSTANCE_SELECT_CORE");
    expect(route).toContain("INSTANCE_SELECT_WITH_VALIDITY");
    expect(route).toContain("isMissingValidityColumnError");
  });

  it("legacy trace UI symbols stay removed from instance surfaces", () => {
    const panel = source("components/admin/gift/panels/AdminGiftInstancesPanel.tsx");
    const detail = source("components/admin/gift/panels/AdminGiftProductDetailConsole.tsx");
    expect(panel).not.toContain("openInstanceTrace");
    expect(panel).not.toContain("추적");
    expect(detail).not.toContain("전체 추적");
    expect(detail).not.toContain("initialEditOpen");
  });
});
