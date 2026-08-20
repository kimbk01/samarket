import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Slice 6 — COMMON / SYSTEM ownership presentation only.
 * No new permission / audit / report / membership models.
 */
describe("Admin COMMON/SYSTEM ownership presentation contract", () => {
  it("maps Global Reports / Feed Growth / Trade audit / legacy paid to ownership titleKeys", () => {
    const menu = read("components/admin/admin-menu.ts");
    expect(menu).toContain('"global-reports": "admin_menu_reports_observation"');
    expect(menu).toContain('"ads-feed-applications": "admin_menu_ads_feed_applications"');
    expect(menu).toContain('"ads-applications": "admin_menu_ads_applications"');
    expect(menu).toContain('"ads-paid": "admin_menu_ads_paid_legacy"');
    expect(menu).toContain('"trade-audit": "admin_menu_trade_audit"');
    expect(menu).toContain('"audit-logs": "admin_menu_dev_audit"');
  });

  it("Staff tab surfaces SYSTEM privilege copy (not COMMON member identity)", () => {
    const page = read("components/admin/users/AdminUserListPage.tsx");
    expect(page).toContain("admin_users_staff_page_title");
    expect(page).toContain("admin_users_staff_privilege_banner");
    expect(page).toContain('tab === "admin"');
  });

  it("Global audit page states audit_logs is not every Domain ledger", () => {
    const audit = read("components/admin/AdminAuditLogsPage.tsx");
    expect(audit).toContain("admin_audit_ownership_banner");
    expect(audit).toContain('data-testid="admin-audit-ownership-banner"');
  });

  it("Growth dashboard cards use Feed / observation titleKeys (not Trade promo)", () => {
    const dash = read("components/admin/customer-platform/CustomerPlatformDashboardPage.tsx");
    expect(dash).toContain('titleKey: "admin_menu_ads_feed_applications"');
    expect(dash).toContain('titleKey: "admin_menu_reports_observation"');
    expect(dash).not.toMatch(/titleKey:\s*"admin_menu_ads_applications"/);
  });

  it("ko/en catalogs define Slice 6 ownership keys", () => {
    const catalog = read("lib/i18n/catalog/admin.ts");
    for (const key of [
      "admin_menu_reports_observation",
      "admin_menu_ads_feed_applications",
      "admin_menu_ads_paid_legacy",
      "admin_menu_trade_audit",
      "admin_users_staff_page_title",
      "admin_users_staff_privilege_banner",
      "admin_users_col_staff_person",
      "admin_users_col_staff_user_id",
      "admin_audit_ownership_banner",
    ]) {
      const re = new RegExp(`${key}:`, "g");
      const matches = catalog.match(re) ?? [];
      expect(matches.length, key).toBeGreaterThanOrEqual(2);
    }
  });
});
