import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 메뉴(admin-menu)가 어드민 문구를 조회한다
import { describe, expect, it } from "vitest";
import {
  ADMIN_ACTION_QUEUE_REGISTRY,
  getAdminActionQueueCategoryDef,
  menuKeysHaveUnavailableAdminQueue,
  sumAdminQueueCountsForMenuKeys,
  type AdminActionQueueCategory,
  type AdminActionQueueCategoryResult,
} from "@/lib/admin/admin-action-queue-registry";
import { buildAdminActionQueueCountsRpcParams } from "@/lib/admin/admin-action-queue";
import { POINT_CHARGE_OPEN_STATUSES } from "@/lib/points/admin-point-charge-list-query";
import { adminMenu, filterMenuForPublicSidebar, type AdminMenuItem } from "@/components/admin/admin-menu";

/**
 * 감사 2026-11-24 (docs/audit/admin-notification-full-audit-2026-11-24.md):
 * 카드 숫자 = 카드가 여는 목록의 기본 보기. 레지스트리 계약 「listHref — Admin list that shows exactly the rows counted」.
 * 링크·상태값·권한·배지 메뉴를 한 표로 고정한다 — 바꾸면 이 표와 목록 화면을 함께 바꾼다.
 */
const EXPECTED_LIST_HREF: Partial<Record<AdminActionQueueCategory, string>> = {
  delivery_alerts: "/admin/delivery-alerts",
  orders_attention: "/admin/store-orders?queue=admin_attention&period=last_7_days",
  settlements_actionable: "/admin/store-settlements?state=review_required",
  cash_charges: "/admin/delivery-ads/cash-charges",
  user_charges: "/admin/point-charges?status=open",
  coin_withdrawals: "/admin/finance/withdrawals?status=REQUESTED",
  reports: "/admin/reports?domain=trade",
  community_reports: "/admin/community/reports?status=pending",
  store_reports: "/admin/store-reports?status=open",
  messenger_actionable: "/admin/chats/reported?type=messenger",
  delivery_ad_ops: "/admin/delivery-ads/manage?view=actionable",
  feed_ad_requests: "/admin/advertising/applications?kind=feed_member&status=pending",
  trade_promo_pending: "/admin/advertising/boosts?domain=trade&status=pending",
  platform_popup_pending: "/admin/advertising?family=popup&status=pending",
  partner_pending: "/admin/delivery-ads/partner?status=PENDING_REVIEW",
  support_actionable: "/admin/support?filter=ACTIONABLE#action-required",
  store_applications: "/admin/stores?status=actionable",
  store_inquiry_open: "/admin/store-inquiries?status=open",
};

/** 목록 API 가 실제로 요구하는 권한 (requireAdminPermission / 도메인 가드). */
const EXPECTED_PERMISSION: Partial<Record<AdminActionQueueCategory, string | null>> = {
  orders_attention: "business", // app/api/admin/store-orders/ops
  settlements_actionable: "business",
  cash_charges: "business",
  user_charges: "point",
  coin_withdrawals: "business",
  reports: "reports",
  store_reports: "reports", // app/api/admin/store-reports
  messenger_actionable: "chats", // requireChatAdmin
  support_actionable: "support", // app/api/admin/support/cases
};

function hrefStatus(href: string): string | null {
  return new URL(href, "https://admin.local").searchParams.get("status");
}

function publicMenuKeys(): Set<string> {
  const out = new Set<string>();
  const walk = (items: AdminMenuItem[]) => {
    for (const it of items) {
      out.add(it.key);
      if (it.children?.length) walk(it.children);
    }
  };
  walk(filterMenuForPublicSidebar(adminMenu));
  return out;
}

describe("Admin Action Queue — count = CTA list (감사 2026-11-24)", () => {
  it("every active category opens the pinned list view", () => {
    for (const d of ADMIN_ACTION_QUEUE_REGISTRY) {
      if (d.lifecycle !== "active") continue;
      expect(d.listHref, d.key).toBe(EXPECTED_LIST_HREF[d.key]);
    }
  });

  it("the status the CTA opens equals the status the count uses", () => {
    const p = buildAdminActionQueueCountsRpcParams(new Date("2026-11-24T00:00:00Z"));
    expect(hrefStatus(getAdminActionQueueCategoryDef("user_charges").listHref!)).toBe("open");
    expect([...POINT_CHARGE_OPEN_STATUSES].sort()).toEqual([...(p.user_charge_statuses as string[])].sort());
    expect(hrefStatus(getAdminActionQueueCategoryDef("coin_withdrawals").listHref!)).toBe(p.coin_withdrawal_status);
    expect(hrefStatus(getAdminActionQueueCategoryDef("partner_pending").listHref!)).toBe(p.partner_status);
    expect(hrefStatus(getAdminActionQueueCategoryDef("store_reports").listHref!)).toBe(p.store_report_status);
    expect(hrefStatus(getAdminActionQueueCategoryDef("store_inquiry_open").listHref!)).toBe(p.store_inquiry_status);
  });

  it("requiredPermission mirrors the list API permission", () => {
    for (const [key, perm] of Object.entries(EXPECTED_PERMISSION)) {
      expect(getAdminActionQueueCategoryDef(key as AdminActionQueueCategory).requiredPermission, key).toBe(perm);
    }
  });

  it("sidebar badge keys are visible menu items (never a hidden section)", () => {
    const visible = publicMenuKeys();
    for (const d of ADMIN_ACTION_QUEUE_REGISTRY) {
      for (const k of d.sidebarMenuKeys) {
        expect(visible.has(k), `${d.key} → ${k}`).toBe(true);
      }
    }
  });

  it("collapsed group badge counts a category once even when two children map it", () => {
    const cats: AdminActionQueueCategoryResult[] = [
      { key: "user_charges", count: 3, status: "ok", inTotal: true, nextActor: "admin", listHref: "/a" },
      { key: "cash_charges", count: 2, status: "ok", inTotal: true, nextActor: "admin", listHref: "/b" },
      { key: "reports", count: null, status: "unavailable", inTotal: true, nextActor: "admin", listHref: "/c" },
    ];
    // user_charges → store-finance-admin + points-charge; cash_charges → store-finance-admin + delivery-ads-cash-queue
    expect(sumAdminQueueCountsForMenuKeys(["store-finance-admin", "points-charge"], cats)).toBe(5);
    expect(sumAdminQueueCountsForMenuKeys(["points-charge"], cats)).toBe(3);
    expect(sumAdminQueueCountsForMenuKeys([], cats)).toBe(0);
    expect(menuKeysHaveUnavailableAdminQueue(["reports-posts"], cats)).toBe(true);
    expect(menuKeysHaveUnavailableAdminQueue(["points-charge"], cats)).toBe(false);
  });
});
