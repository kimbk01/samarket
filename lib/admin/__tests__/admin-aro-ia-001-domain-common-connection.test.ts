/**
 * ARO-IA-001 — Domain ↔ Common connection contract (Community starting evidence).
 * Navigation/labels/cross-links only — owners must stay unchanged.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminMenu, collectAdminMenuPathEntries } from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import { resolveActiveWorkspace } from "@/lib/admin/admin-workspace-routing";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";
import {
  ARO_IA_001_ADS_HUB_PATH,
  ARO_IA_001_COMMUNITY_POINT_POLICIES_PATH,
  ARO_IA_001_COMMUNITY_PROMOTIONS_PATH,
  ARO_IA_001_COMMUNITY_REPORTS_PATH,
  ARO_IA_001_COMMUNITY_SECTION_KEYS,
  ARO_IA_001_FINANCE_POINT_POLICIES_PATH,
  ARO_IA_001_MEETING_REPORTS_PATH,
  ARO_IA_001_OWNERS,
  ARO_IA_001_SUPPORT_PATH,
} from "@/lib/admin/aro-ia-001-community-common-links";
import { adminMessages } from "@/lib/i18n/catalog/admin";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("ARO-IA-001 Community Domain ↔ Common connection", () => {
  it("T1 — Community sidebar section grouping present", () => {
    const community = findAdminMenuByKey(adminMenu, "community");
    expect(community?.children?.map((c) => c.key)).toEqual([...ARO_IA_001_COMMUNITY_SECTION_KEYS]);
    for (const key of ARO_IA_001_COMMUNITY_SECTION_KEYS) {
      const section = findAdminMenuByKey(adminMenu, key);
      expect(section?.path, key).toBeUndefined();
      expect((section?.children?.length ?? 0) > 0, key).toBe(true);
    }
  });

  it("T2/T4 — Community promotion owner stays point_promotion_orders; Ads hub is not writer", () => {
    // Owner Policy LOCK: PUBLIC community promotions → 상위노출 관리; queue component KEEP
    const promoPage = read("app/admin/community/promotions/page.tsx");
    expect(promoPage).toContain("redirect");
    expect(promoPage).toContain("/admin/advertising/boosts");
    const apps = read("components/admin/ads/AdminAdApplicationsPage.tsx");
    expect(apps).toContain('data-admin-domain="community"');
    expect(apps).toContain("AdminCommunityPromotionQueue");
    expect(ARO_IA_001_OWNERS.promotion).toBe("point_promotion_orders");
    const queue = read("components/admin/ads/AdminCommunityPromotionQueue.tsx");
    expect(queue).toContain("point_promotion_orders");
    const adsHub = read("components/admin/stores/AdminDeliveryAdsControlPlane.tsx");
    expect(adsHub).toContain("ads-hub-to-community-promo");
    expect(adsHub).not.toContain(`data-admin-writer="${ARO_IA_001_OWNERS.promotion}"`);
  });

  it("T3 — Community Promotion → Ads contextual link", () => {
    const apps = read("components/admin/ads/AdminAdApplicationsPage.tsx");
    expect(apps).toContain("community-promo-to-ads");
    expect(apps).toContain("ARO_IA_001_ADS_HUB_PATH");
  });

  it("T5/T7 — Community Point policy uses board_point_policies; no parallel writer", () => {
    const page = read("components/admin/community/AdminCommunityPointPoliciesPage.tsx");
    expect(page).toContain("/api/admin/point-policies/board");
    expect(page).toContain("community-point-to-finance");
    expect(page).toContain("ARO_IA_001_FINANCE_POINT_POLICIES_PATH");
    expect(page).not.toContain("createCommunityPointPolicyTable");
  });

  it("T6 — Finance → Community Point contextual link (not primary nav)", () => {
    const finance = read("components/admin/point-policies/AdminPointPolicyPage.tsx");
    expect(finance).toContain("finance-point-to-community");
    expect(finance).toContain("ARO_IA_001_COMMUNITY_POINT_POLICIES_PATH");
    const adsWorkspace = findAdminMenuByKey(adminMenu, "ads");
    const adsLeafKeys: string[] = [];
    const walk = (nodes: { key: string; children?: { key: string; children?: unknown[] }[] }[]) => {
      for (const n of nodes) {
        adsLeafKeys.push(n.key);
        if (n.children?.length) walk(n.children as typeof nodes);
      }
    };
    walk(adsWorkspace?.children ?? []);
    expect(adsLeafKeys).not.toContain("community-promotions");
    expect(adsLeafKeys).not.toContain("community-point-policies");
  });

  it("T8/T9/T10 — Report owners distinct; Support not merged", () => {
    const reportsLib = read("lib/community-feed/admin-community-reports.ts");
    const meetingLib = read("lib/neighborhood/admin-meeting-reports.ts");
    const reportsUi = read("components/admin/community/AdminCommunityReportsPage.tsx");
    expect(reportsLib).toContain(ARO_IA_001_OWNERS.report);
    expect(meetingLib).toContain(ARO_IA_001_OWNERS.meetingReport);
    expect(reportsUi).toContain("community-report-to-support");
    expect(reportsUi).toContain("ARO_IA_001_SUPPORT_PATH");
    expect(reportsUi).not.toContain("autoCreateSupportCase");
  });

  it("T11 — no duplicate primary path leaves; Community paths stay Community workspace", () => {
    const entries = collectAdminMenuPathEntries(adminMenu);
    const counts = new Map<string, string[]>();
    for (const e of entries) {
      const list = counts.get(e.path) ?? [];
      list.push(e.key);
      counts.set(e.path, list);
    }
    expect([...counts.entries()].filter(([, keys]) => keys.length > 1)).toEqual([]);

    for (const route of [
      ARO_IA_001_COMMUNITY_PROMOTIONS_PATH,
      ARO_IA_001_COMMUNITY_POINT_POLICIES_PATH,
      ARO_IA_001_COMMUNITY_REPORTS_PATH,
      ARO_IA_001_MEETING_REPORTS_PATH,
    ]) {
      expect(resolveActiveWorkspace(route, "master").id).toBe("community");
    }
  });

  it("T12 — returnTo helper preserves Community context", () => {
    const href = withAdminReturnTo(ARO_IA_001_ADS_HUB_PATH, ARO_IA_001_COMMUNITY_PROMOTIONS_PATH);
    expect(href).toContain("returnTo=%2Fadmin%2Fcommunity%2Fpromotions");
    expect(href.startsWith(ARO_IA_001_ADS_HUB_PATH)).toBe(true);
  });

  it("T13 — labels clarify scope without Feed Ads wording", () => {
    expect(adminMessages.ko.admin_menu_community_reports).toBe("일반 신고");
    expect(adminMessages.ko.admin_menu_community_point_policies).toContain("커뮤니티");
    expect(adminMessages.ko.admin_menu_meeting_reports).toBe("모임 신고");
    expect(adminMessages.en.admin_menu_community_reports.toLowerCase()).toContain("general");
    expect(adminMessages.ko.admin_menu_community_section_promo_point).toContain("홍보");
    const promoPage = read("components/admin/ads/AdminAdApplicationsPage.tsx");
    expect(promoPage).toMatch(/포인트 홍보/);
  });

  it("menu still exposes primary Community leaves (KEEP)", () => {
    expect(findAdminMenuByKey(adminMenu, "community-promotions")?.path).toBe(
      ARO_IA_001_COMMUNITY_PROMOTIONS_PATH
    );
    expect(findAdminMenuByKey(adminMenu, "community-point-policies")?.path).toBe(
      ARO_IA_001_COMMUNITY_POINT_POLICIES_PATH
    );
    expect(findAdminMenuByKey(adminMenu, "community-feed-reports")?.path).toBe(
      ARO_IA_001_COMMUNITY_REPORTS_PATH
    );
    expect(findAdminMenuByKey(adminMenu, "philife-meeting-reports")?.path).toBe(
      ARO_IA_001_MEETING_REPORTS_PATH
    );
  });
});
