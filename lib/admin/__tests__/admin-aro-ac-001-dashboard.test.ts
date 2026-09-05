/**
 * ARO-AC-001 — Dashboard / Action Center contracts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ARO_AC_001_SOURCE_MATRIX } from "@/lib/admin/aro-ac-001-dashboard-source-matrix";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("ARO-AC-001 Dashboard Action Center", () => {
  it("source matrix covers required operational items with deeplinks", () => {
    const items = ARO_AC_001_SOURCE_MATRIX.map((r) => r.item);
    for (const need of [
      "ORDERS",
      "SETTLEMENT",
      "COMMUNITY REPORTS",
      "MEETING REPORTS",
      "POINT",
      "COIN",
      "CASH",
      "DELIVERY ADS",
      "FEED ADS",
      "POPUP",
      "PARTNER",
      "SUPPORT",
    ]) {
      expect(items).toContain(need);
    }
    for (const row of ARO_AC_001_SOURCE_MATRIX) {
      expect(row.deeplink.startsWith("/admin")).toBe(true);
      expect(row.actionable).toBe(true);
    }
  });

  it("Action Center wires Orders / Settlement / Community / Meeting / Coin / Popup / Partner", () => {
    const ui = read("components/admin/dashboard/AdminActionCenter.tsx");
    expect(ui).toContain('data-aro-ac-001="1"');
    expect(ui).toContain('id: "orders"');
    expect(ui).toContain('id: "settlement"');
    expect(ui).toContain('id: "community-reports"');
    expect(ui).toContain('id: "meeting-reports"');
    expect(ui).toContain('id: "coin-withdraw"');
    expect(ui).toContain('id: "popup"');
    expect(ui).toContain('id: "partner"');
    expect(ui).toContain("/admin/store-settlements?settlement_status=scheduled");
    expect(ui).toContain("/admin/community/reports");
    expect(ui).toContain("/admin/philife/meeting-reports");
    expect(ui).toContain("/admin/finance#coin-withdrawals");
    expect(ui).toContain("platformPopupPendingCount");
    expect(ui).toContain("partnerPendingCount");
    expect(ui).toContain("data-admin-action-center-card={card.id}");
  });

  it("queue loader counts new ARO-AC-001 sources; exposes unavailable", () => {
    const q = read("lib/admin/admin-action-queue.ts");
    expect(q).toContain("meeting_reports");
    expect(q).toContain("orders_attention");
    expect(q).toContain("settlements_actionable");
    expect(q).toContain("coin_withdrawal_requests");
    expect(q).toContain("platform_popup_owner_requests");
    expect(q).toContain("PENDING_REVIEW");
    expect(q).toContain("unavailable");
    expect(q).toContain("markUnavailable");
  });

  it("admin-bell returns unavailable; Finance Point/Coin/Cash stay separate cards", () => {
    expect(read("app/api/admin/admin-bell/route.ts")).toContain("unavailable");
    const ui = read("components/admin/dashboard/AdminActionCenter.tsx");
    expect(ui).toContain('id: "point"');
    expect(ui).toContain('id: "cash"');
    expect(ui).toContain('id: "coin-withdraw"');
    expect(ui).toContain("재무 · Point");
    expect(ui).toContain("재무 · Cash");
    expect(ui).toContain("재무 · Coin");
  });

  it("Ads and Partner are separate cards; Report ≠ Support", () => {
    const ui = read("components/admin/dashboard/AdminActionCenter.tsx");
    expect(ui).toContain('id: "partner"');
    expect(ui).toContain('id: "ads-review"');
    expect(ui).toContain('id: "support"');
    expect(ui).toContain('id: "community-reports"');
    expect(ui).not.toContain("Partner memberships\",\n      domainKo: \"광고");
  });

  it("return context helper preserved for Action Center links", () => {
    const href = withAdminReturnTo("/admin/store-settlements?settlement_status=scheduled", "/admin");
    expect(href).toContain("returnTo=%2Fadmin");
    expect(href.startsWith("/admin/store-settlements")).toBe(true);
    expect(read("components/admin/dashboard/AdminActionCenter.tsx")).toContain("withAdminReturnTo");
  });

  it("no new aggregate DB / mutation authority in Action Center", () => {
    const ui = read("components/admin/dashboard/AdminActionCenter.tsx");
    expect(ui).not.toContain(".insert(");
    expect(ui).not.toContain(".update(");
    expect(ui).not.toContain(".delete(");
    expect(ui).toContain("useAdminStorePointPendingCount");
  });

  it("layers A–D markers present; tablet-friendly grid classes", () => {
    const ui = read("components/admin/dashboard/AdminActionCenter.tsx");
    expect(ui).toContain("data-aro-ac-top-summary");
    expect(ui).toContain("data-aro-ac-action-required");
    expect(ui).toContain("data-aro-ac-domain-health");
    expect(ui).toContain("data-aro-ac-common-ops");
    expect(ui).toContain("sm:grid-cols-2 xl:grid-cols-3");
  });
});
