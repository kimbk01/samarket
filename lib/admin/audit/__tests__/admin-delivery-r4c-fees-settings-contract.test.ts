/**
 * 배달 Admin R4 영역 C (수수료·혜택·화면 구성·설정) 계약 테스트.
 * B-2 super_admin · D-1 원자 RPC · DEF-2/40/45 처리 이력 · C-9 레거시 정산 중단 · DEF-42 권위 · DEF-44 순서 1회 처리.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_CONFIG_AUDIT_SCOPES,
  adminConfigAuditActionKey,
  extractAdminAuditReason,
  parseAdminConfigAuditScope,
} from "@/lib/admin/audit/admin-config-audit-scopes";
import { adminDeliveryR4CMessages } from "@/lib/i18n/catalog/admin-delivery-r4-fees-settings";
import { isDeliveryBottomNavBuiltinOwnerStoreItem } from "@/lib/delivery/delivery-bottom-nav-builtin";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("R4-C i18n catalog", () => {
  it("ko and en have identical keys", () => {
    expect(Object.keys(adminDeliveryR4CMessages.ko).sort()).toEqual(Object.keys(adminDeliveryR4CMessages.en).sort());
  });
  it("every audit action label key exists", () => {
    const ko = adminDeliveryR4CMessages.ko as Record<string, string>;
    for (const action of [
      "store_fee_policy.create",
      "store_fee_policy.update",
      "store_fee_policy.supersede",
      "store_fee_policy.archive",
      "stores_category_policy.update",
      "stores_home_shelves.update",
      "delivery_bottom_nav.reorder",
      "store_taxonomy.update",
      "store_discovery_campaign.create",
      "commerce_settings.update",
      "unknown.create",
      "unknown.delete",
      "unknown.other",
    ]) {
      expect(ko[adminConfigAuditActionKey(action)]).toBeTruthy();
    }
  });
});

describe("config audit scopes (DEF-2 · DEF-40 · DEF-45)", () => {
  it("only allow-listed scopes parse", () => {
    expect(parseAdminConfigAuditScope("fee_policy")).toBe("fee_policy");
    expect(parseAdminConfigAuditScope("browse_policy")).toBe("browse_policy");
    expect(parseAdminConfigAuditScope("audit_logs")).toBeNull();
    expect(parseAdminConfigAuditScope("__proto__")).toBeNull();
    expect(parseAdminConfigAuditScope(null)).toBeNull();
  });

  it("scope target types match what the write routes record", () => {
    const pairs: Array<[keyof typeof ADMIN_CONFIG_AUDIT_SCOPES, string]> = [
      ["fee_policy", "lib/stores/commission/admin-fee-policy-guards.ts"],
      ["browse_policy", "app/api/admin/stores-category-policy/route.ts"],
      ["home_shelves", "app/api/admin/stores-home-shelves/route.ts"],
      ["bottom_nav", "app/api/admin/stores/bottom-nav/route.ts"],
      ["discovery", "app/api/admin/store-discovery/campaigns/route.ts"],
      ["commerce_settings", "app/api/admin/commerce-settings/route.ts"],
    ];
    for (const [scope, file] of pairs) {
      const src = read(file);
      const hit = ADMIN_CONFIG_AUDIT_SCOPES[scope].some((tt) => src.includes(`"${tt}"`));
      expect(hit, `${scope} ↔ ${file}`).toBe(true);
    }
  });

  it("extracts reason from after/before json", () => {
    expect(extractAdminAuditReason({ reason: " 계약 변경 " })).toBe("계약 변경");
    expect(extractAdminAuditReason({}, { archive_reason: "중복" })).toBe("중복");
    expect(extractAdminAuditReason(null)).toBeNull();
  });

  it("history route is read-only and allow-list based", () => {
    const src = read("app/api/admin/delivery-config-audit/route.ts");
    expect(src).toContain("parseAdminConfigAuditScope");
    expect(src).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
  });
});

describe("B-2 super_admin for fee policy change / commission adjustment", () => {
  for (const file of [
    "app/api/admin/store-fee-policies/route.ts",
    "app/api/admin/store-fee-policies/[id]/route.ts",
    "app/api/admin/store-commission-ledger/adjustments/route.ts",
  ]) {
    it(file, () => {
      const src = read(file);
      expect(src).toContain("requireSuperAdmin()");
      expect(src).not.toContain('requireAdminPermission("business")');
    });
  }
  it("overview and ledger expose the viewer flag the UI locks CTAs with", () => {
    expect(read("app/api/admin/store-fee-policies/overview/route.ts")).toContain("can_edit_fee_policy");
    expect(read("app/api/admin/store-commission-ledger/route.ts")).toContain("can_decide_adjustment");
    expect(read("components/admin/stores/AdminStoreFeePoliciesPage.tsx")).toContain("busy || !canEdit");
    expect(read("components/admin/stores/AdminStoreCommissionLedgerPage.tsx")).toContain("busy || !canDecide");
  });
});

describe("D-1 / DEF-3 / DEF-62", () => {
  it("schedule change goes through the atomic RPC only (no 2-step fallback)", () => {
    const route = read("app/api/admin/store-fee-policies/route.ts");
    expect(route).toContain("supersedeFeePolicyAtomic");
    expect(route).not.toContain("revertSupersede");
    const mig = read("supabase/migrations/20270515120000_admin_supersede_store_fee_policy_atomic.sql");
    expect(mig).toContain("FOR UPDATE");
    expect(mig).toContain("admin_supersede_store_fee_policy");
    expect(mig).toContain("TO service_role");
  });
  it("PATCH supports CAS and the UI ends policies with L3 confirm", () => {
    expect(read("app/api/admin/store-fee-policies/[id]/route.ts")).toContain("stale_policy");
    const page = read("components/admin/stores/AdminStoreFeePoliciesPage.tsx");
    expect(page).toMatch(/level: "L3"[\s\S]*retypeValue: label/);
    expect(page).toContain('scope="fee_policy"');
  });
});

describe("C-9 / DEF-4 / DUP-4", () => {
  it("legacy settlement writer is stopped", async () => {
    const mod = await import("@/lib/stores/ensure-store-settlement");
    expect(mod.LEGACY_STORE_SETTLEMENT_WRITER_ENABLED).toBe(false);
  });
  it("commerce settings refuses retired values and hides the fields", () => {
    expect(read("app/api/admin/commerce-settings/route.ts")).toContain("legacy_setting_retired");
    const page = read("components/admin/stores/AdminCommerceSettingsPage.tsx");
    expect(page).not.toContain("setFeeBp");
    expect(page).not.toContain("setDelayDays");
    expect(page).toContain('level: "L2"');
  });
  it("auto_hold_settlement cannot be newly assigned", () => {
    expect(read("app/api/admin/delivery-operation-alerts/rules/[ruleId]/route.ts")).toContain("auto_action_type_retired");
  });
});

describe("DEF-42 auto-action switch authority", () => {
  it("runtime health shows a link instead of a second switch", () => {
    const src = read("components/admin/system/AdminRuntimeHealthPage.tsx");
    expect(src).toContain('r.key === "enable_auto_actions"');
    expect(src).toContain("/admin/delivery-auto-actions");
  });
});

describe("DEF-44 bottom nav reorder is one request", () => {
  it("client calls a single swap PATCH", () => {
    const page = read("components/admin/delivery/AdminDeliveryBottomNavPage.tsx");
    expect(page).toContain("swap_order");
    expect(page).not.toContain("const second = await apiUpdate");
    expect(read("app/api/admin/stores/bottom-nav/route.ts")).toContain("delivery_bottom_nav.reorder");
  });
  it("builtin owner-store predicate is client-safe and unchanged", () => {
    expect(isDeliveryBottomNavBuiltinOwnerStoreItem({ icon_key: "store", href: "/stores/owner" })).toBe(true);
    expect(isDeliveryBottomNavBuiltinOwnerStoreItem({ icon_key: "store", href: "/my/business/x" })).toBe(true);
    expect(isDeliveryBottomNavBuiltinOwnerStoreItem({ icon_key: "home", href: "/stores/owner" })).toBe(false);
  });
});

describe("client components never import server-only modules", () => {
  const FORBIDDEN = [
    /from "next\/server"/,
    /append-user-notification/,
    /web-push/,
    /try-supabase-stores/,
    /supabase-server/,
    /from "@\/lib\/audit\//,
    /-server"/,
    /require-admin-permission/,
  ];
  for (const file of [
    "components/admin/delivery/AdminConfigAuditHistoryPanel.tsx",
    "components/admin/delivery/AdminDeliveryBottomNavPage.tsx",
    "components/admin/delivery/AdminDeliveryDistanceSettingsPage.tsx",
    "components/admin/stores/AdminStoreFeePoliciesPage.tsx",
    "components/admin/stores/AdminStoreCommissionLedgerPage.tsx",
    "components/admin/stores/AdminCommerceSettingsPage.tsx",
    "components/admin/stores/AdminStoreDiscoveryControlPage.tsx",
    "components/admin/stores/AdminStoresCategoryPolicyPage.tsx",
    "components/admin/stores/AdminStoresHomeShelvesPage.tsx",
    "components/admin/stores/AdminStoreApplicationSettingsPage.tsx",
    "components/admin/stores/AdminStoreCouponControlPage.tsx",
    "lib/admin/audit/admin-config-audit-scopes.ts",
    "lib/delivery/delivery-bottom-nav-builtin.ts",
  ]) {
    it(file, () => {
      const src = read(file);
      for (const re of FORBIDDEN) expect(src, `${file} ${re}`).not.toMatch(re);
    });
  }
});
