import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("ARO-OPS-UX-002 repair — DEF-004 Cash permission", () => {
  it("gates canonical Cash on business permission (no new cash key)", () => {
    const route = read("app/api/admin/business-cash-charges/route.ts");
    expect(route).toContain('requireAdminPermission("business")');
    expect(route).not.toContain('requireAdminPermission("cash")');
    const staff = read("lib/types/admin-staff.ts");
    expect(staff).not.toMatch(/\|\s*"cash"/);
  });
});

describe("ARO-OPS-UX-002 repair — DEF-001 Order Admin Store", () => {
  it("uses businessCcBackToStoreHref for Admin store link", () => {
    const src = read("components/admin/delivery-orders/DeliveryOrderDetailClient.tsx");
    expect(src).toContain("businessCcBackToStoreHref");
    expect(src).not.toMatch(/href=\{`\/stores\/\$\{encodeURIComponent\(order\.storeSlug\)\}`\}/);
  });
});

describe("ARO-OPS-UX-002 repair — DEF-002 Messenger count", () => {
  it("Action Center domain-chat uses messengerActionableCount", () => {
    const src = read("components/admin/dashboard/AdminActionCenter.tsx");
    expect(src).toContain("messengerActionableCount");
    expect(src).not.toMatch(/id:\s*"domain-chat"[\s\S]*?count:\s*0/);
  });
});

describe("ARO-OPS-UX-002 repair — DEF-003 error ≠ zero", () => {
  it("marks real queue errors unavailable instead of silent zero-only path for cash", () => {
    const src = read("lib/admin/admin-action-queue.ts");
    expect(src).toContain('markUnavailable(\n    "cash_charges"');
    expect(src).toContain("messenger_actionable");
  });
});

describe("ARO-OPS-UX-002 repair — DEF-006/007 Support deep links", () => {
  it("Cash and Partner hrefs carry exact identifiers", () => {
    const href = read("lib/support/support-reference-admin-href.ts");
    expect(href).toContain("requestId=");
    expect(href).toContain("membershipId=");
    const cash = read("components/admin/stores/AdminDeliveryAdCashChargeQueuePage.tsx");
    expect(cash).toContain('searchParams.get("requestId")');
    const partner = read("components/admin/stores/AdminDeliveryAdPartnerMembershipsView.tsx");
    expect(partner).toContain('searchParams.get("membershipId")');
  });
});

describe("ARO-OPS-UX-002 repair — DEF-008 store actionable", () => {
  it("stores API and page support status=actionable", () => {
    const api = read("app/api/admin/stores/route.ts");
    expect(api).toContain('status === "actionable"');
    const page = read("components/admin/stores/AdminStoresPage.tsx");
    expect(page).toContain("searchParams.get(\"status\")");
  });
});

describe("ARO-OPS-UX-002 repair — DEF-009/010 chat authority", () => {
  it("documents chat hide as session filter and seed policy owners", () => {
    const seed = read("lib/admin/management/policies/seed-policies.ts");
    expect(seed).toContain("CHAT_ROOM_ENTITY_ACTION_POLICY");
    expect(seed).toContain("listHiddenIds");
    expect(seed).toContain("Prelaunch Reset");
    const catalog = read("lib/i18n/catalog/admin.ts");
    expect(catalog).toMatch(/방 상태·DB는 변경되지 않습니다/);
  });
});
