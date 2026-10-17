/**
 * ARO-AC-001 — Dashboard / Action Center contracts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ARO_AC_001_SOURCE_MATRIX } from "@/lib/admin/aro-ac-001-dashboard-source-matrix";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";
import {
  ADMIN_ACTION_QUEUE_CARD_CATEGORIES,
  getAdminActionQueueCategoryDef,
} from "@/lib/admin/admin-action-queue-registry";

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
    // Action Required cards render from the Action Queue registry (same payload as the Bell).
    expect(ui).toContain("AdminActionQueueCardGrid");
    expect(ui).toContain("q.queueCategories");
    for (const key of [
      "orders_attention",
      "settlements_actionable",
      "community_reports",
      "meeting_reports",
      "coin_withdrawals",
      "platform_popup_pending",
      "partner_pending",
    ] as const) {
      expect(ADMIN_ACTION_QUEUE_CARD_CATEGORIES).toContain(key);
    }
    expect(getAdminActionQueueCategoryDef("settlements_actionable").listHref).toBe(
      "/admin/store-settlements?unpaid_only=1"
    );
    expect(getAdminActionQueueCategoryDef("community_reports").listHref).toContain("/admin/community/reports");
    expect(getAdminActionQueueCategoryDef("meeting_reports").listHref).toBe("/admin/philife/meeting-reports");
    expect(getAdminActionQueueCategoryDef("coin_withdrawals").listHref).toBe("/admin/finance#coin-withdrawals");
    expect(read("components/admin/action-queue/AdminActionQueueCardGrid.tsx")).toContain(
      "data-admin-queue-category={c.key}"
    );
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
    expect(q).toContain("countOutcome");
    expect(q).toContain("isMissingRelationError");
  });

  it("admin-bell returns unavailable; Finance Point/Coin/Cash stay separate cards", () => {
    expect(read("app/api/admin/admin-bell/route.ts")).toContain("unavailable");
    expect(getAdminActionQueueCategoryDef("user_charges").domainKo).toBe("재무 · Point");
    expect(getAdminActionQueueCategoryDef("cash_charges").domainKo).toBe("재무 · Cash");
    expect(getAdminActionQueueCategoryDef("coin_withdrawals").domainKo).toBe("재무 · Coin");
    for (const key of ["user_charges", "cash_charges", "coin_withdrawals"] as const) {
      expect(ADMIN_ACTION_QUEUE_CARD_CATEGORIES).toContain(key);
    }
  });

  it("Ads and Partner are separate cards; Report ≠ Support", () => {
    for (const key of ["partner_pending", "delivery_ad_ops", "support_actionable", "community_reports"] as const) {
      expect(ADMIN_ACTION_QUEUE_CARD_CATEGORIES).toContain(key);
    }
    expect(getAdminActionQueueCategoryDef("partner_pending").domainKo).toBe("Partner");
    expect(getAdminActionQueueCategoryDef("support_actionable").domainKo).not.toBe(
      getAdminActionQueueCategoryDef("community_reports").domainKo
    );
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
