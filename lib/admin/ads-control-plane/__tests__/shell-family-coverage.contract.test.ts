/**
 * GAP A — Canonical Shell family coverage contract.
 * Source-level: loaders compose all ops families; projectors exported; shell filters map domains.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as projectors from "@/lib/admin/ads-control-plane/project-family-rows";
import {
  filterShellRowsByProductFamily,
  filterShellRowsByTab,
  toAdsShellListRow,
} from "@/lib/admin/ads-exposure/shell-row";
import type { AdsActionItem } from "@/lib/admin/ads-control-plane/types";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(`${ROOT}/${rel}`, "utf8");
}

function item(partial: Partial<AdsActionItem>): AdsActionItem {
  return {
    id: "x:1",
    domain: "delivery",
    product: "banner",
    entity: "application",
    applicantLabel: "t",
    storeId: null,
    memberId: null,
    creativeHint: null,
    placementHint: null,
    amountLabel: null,
    currency: "CASH",
    status: "승인 대기",
    whyActionable: null,
    paymentLabel: null,
    periodLabel: null,
    remainingLabel: null,
    exposureLabel: null,
    eligibility: null,
    ageHours: null,
    at: "2026-09-07T00:00:00.000Z",
    source: "t",
    href: "/",
    statementHref: null,
    financeHref: null,
    memberHref: null,
    ...partial,
  };
}

describe("shell-family-coverage.contract", () => {
  it("load-ads-control-plane queries/projectors cover all ops families", () => {
    const src = read("lib/admin/ads-control-plane/load-ads-control-plane.ts");

    expect(src).toContain('from("point_promotion_orders")');
    expect(src).not.toMatch(
      /\.eq\(\s*["']order_status["']\s*,\s*["']pending_review["']\s*\)/
    );
    expect(src).toContain('from("feed_ad_requests")');
    // R7 — 페이지 행만 원천별 id 로 읽는다 (원천별 고정 상한 목록 대신)
    expect(src).toContain("listFeedAdCampaignsByIdsForAdmin");
    expect(src).toContain("feed_ad_campaigns");
    expect(src).toContain('from("platform_popup_owner_requests")');
    expect(src).toContain("listPlatformPopupAdminCampaigns");
    expect(src).toContain("platform_popup_campaigns");
    expect(src).toContain("loadAdminDeliveryAdCampaignsByIds");
    expect(src).toContain("admin_ads_workspace_page");
    expect(src).toContain("projectDeliveryCampaignToActionItem");
    expect(src).toContain("projectPromoteOrderToActionItem");
    expect(src).toContain("projectFeedRequestToActionItem");
    expect(src).toContain("projectFeedCampaignToActionItem");
    // 팝업 오너 신청 행: 기존 로더 조회 열(title)이 운영 스키마에 없어 목록에서 항상 빠져 있던 동작을 유지
    // (R7 workspace RPC 도 포함하지 않음 — 범위 밖 결함 보고). 처리 대기 개수(queues.popup)만 센다.
    expect(read("supabase/migrations/20270601100300_r7_admin_ads_workspace_page.sql")).toContain(
      "platform_popup_owner_requests"
    );
    expect(src).toContain("projectPopupCampaignToActionItem");
  });

  it("currentExecution is not solely assigned an empty literal array", () => {
    const src = read("lib/admin/ads-control-plane/load-ads-control-plane.ts");
    expect(src).not.toMatch(
      /const\s+currentExecution\s*:\s*AdsExecutionRow\[\]\s*=\s*\[\s*\]\s*;/
    );
    expect(src).toContain("projectDeliveryCampaignToExecutionRow");
    expect(src).toContain("projectFeedCampaignToExecutionRow");
    expect(src).toContain("projectPopupCampaignToExecutionRow");
    expect(src).toMatch(/const\s+currentExecution\s*:\s*AdsExecutionRow\[\]\s*=\s*\[/);
  });

  it("project-family-rows exports required projectors", () => {
    expect(typeof projectors.projectDeliveryCampaignToActionItem).toBe("function");
    expect(typeof projectors.projectPromoteOrderToActionItem).toBe("function");
    expect(typeof projectors.projectFeedRequestToActionItem).toBe("function");
    expect(typeof projectors.projectFeedCampaignToActionItem).toBe("function");
    expect(typeof projectors.projectPopupRequestToActionItem).toBe("function");
    expect(typeof projectors.projectPopupCampaignToActionItem).toBe("function");
    expect(typeof projectors.projectDeliveryCampaignToExecutionRow).toBe("function");
    expect(typeof projectors.projectFeedCampaignToExecutionRow).toBe("function");
    expect(typeof projectors.projectPopupCampaignToExecutionRow).toBe("function");
  });

  it("shell-row filters can map each domain family", () => {
    const rows = [
      item({
        id: "community_promo:1",
        domain: "community_promote",
        product: "community_promote",
        status: "승인 대기",
      }),
      item({
        id: "trade_promo:1",
        domain: "trade_promote",
        product: "trade_promote",
        status: "노출 중",
        exposureLabel: "노출 중",
      }),
      item({
        id: "feed:1",
        domain: "feed",
        product: "feed_banner",
        status: "예약",
      }),
      item({
        id: "delivery:1",
        domain: "delivery",
        product: "banner",
        status: "일시중지",
      }),
      item({
        id: "delivery_sp:1",
        domain: "delivery",
        product: "store_sponsored",
        status: "종료",
      }),
      item({
        id: "popup:1",
        domain: "popup",
        product: "platform_popup",
        status: "반려",
      }),
    ].map((r) => toAdsShellListRow(r, true));

    expect(filterShellRowsByProductFamily(rows, "promote").length).toBeGreaterThanOrEqual(2);
    expect(filterShellRowsByProductFamily(rows, "banner").length).toBeGreaterThanOrEqual(2);
    expect(filterShellRowsByProductFamily(rows, "popup").length).toBe(1);
    expect(filterShellRowsByProductFamily(rows, "sponsored").length).toBeGreaterThanOrEqual(1);

    expect(filterShellRowsByTab(rows, "pending").some((r) => r.domain === "community_promote")).toBe(
      true
    );
    expect(filterShellRowsByTab(rows, "live").some((r) => r.domain === "trade_promote")).toBe(true);
    expect(filterShellRowsByTab(rows, "scheduled").some((r) => r.domain === "feed")).toBe(true);
    expect(filterShellRowsByTab(rows, "paused").some((r) => r.domain === "delivery")).toBe(true);
    expect(filterShellRowsByTab(rows, "ended").some((r) => r.product === "store_sponsored")).toBe(
      true
    );
    expect(filterShellRowsByTab(rows, "rejected").some((r) => r.domain === "popup")).toBe(true);
  });
});
