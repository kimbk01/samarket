/**
 * D-15 (2026-11-07) — 정본 용어 「상위노출」. 한국어 카탈로그·어드민 화면에 남은 「홍보」는 허용 목록만.
 * 허용 = 정상 용어(배달 상품명 「매장 홍보」·동네 카테고리 「홍보」·게시판 「프로모션 / 홍보 글」·쿠폰 「신메뉴 홍보」 등)
 *       + 이번 D-15 목록 밖이라 보고만 한 키(아래 OUT_OF_SCOPE · 새로 넣지 말 것).
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 검사한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { readFileSync } from "node:fs";
import { withCatalogCopy } from "@/lib/i18n/__tests__/support/source-with-catalog-copy";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/lib/i18n/messages";

/** 정상 용어 — 바꾸지 않는다 */
const NORMAL_TERM_KEYS = new Set([
  // B4 어드민 광고 안내 — 상품 이름 「매장 홍보」(정상 용어)
  "admin_ads_boost_delivery_sponsored_cannot_registered",
  "admin_ads_human_approval_banner_store_promotion",
  // 배달 상품명 「매장 홍보」(정상 용어) — R1 원장 종류 이름
  "ads_ledger_kind_delivery_sponsored",
  "neighborhood_promo",
  "neighborhood_category_promo",
  "store_coupon_purpose_new_menu",
  "store_coupon_admin_promo_cta",
  "community_board_promo_badge",
  // B4 광고 상품 종류 「[배달] 매장 상위홍보」(배달 매장 홍보 상품명 — 정상 용어, 원래 화면 문구 그대로)
  "admin_ads_exposure_delivery_store_promotion",
  // B4 외부 글 수집 일괄 변경 규칙 설명 — 「홍보 문구 제거」(스팸성 홍보 문구, 상위노출 아님)
  "admin_community_import_rules_desc",
  "owner_ads_workspace_store_sponsored_title",
  "owner_ads_create_store_sponsored_cta",
  "owner_ads_pick_placement_first_store",
  "owner_ads_where_to_promote",
  "owner_ads_product_store_sponsored",
  "delivery_ads_preview_store_sponsored_explain",
  "admin_menu_store_insertions_control",
  "admin_store_insertions_title",
  "admin_store_insertions_desc",
  "admin_store_insertions_refresh_paid_ads",
  "admin_store_insertions_paid_ads_title",
  "admin_store_insertions_paid_ads_fail",
  "admin_store_insertions_paid_ads_loading",
  "admin_store_insertions_paid_ads_empty",
  "admin_store_insertions_paid_ads_create_title",
  "admin_store_insertions_paid_ads_edit_title",
  "admin_menu_store_ads_control",
  "admin_store_banner_ads_desc",
  "admin_delivery_ads_subtitle",
  "admin_delivery_ads_product_store_sponsored",
  "admin_delivery_ads_home_banner_slot_hint",
  "admin_delivery_ads_first_party_store_promo_blocked",
  "admin_menu_domain_store_promo_requests",
  "admin_ad_kind_delivery_sponsored",
  /** 언어 SSOT S6: 어드민 광고 상품 이름 「매장 홍보」 — 코드 안 언어 삼항에서 카탈로그로 옮겨 검사에 보이게 됨(화면 문구 변화 없음) */
  "stores_store_promotion",
  /** S6 2단계: 어드민 인라인 표에서 옮긴 「매장 홍보」 상품 이름(같은 정상 용어) */
  "admin_store_promotion",
  "admin_allow_native_store_promotion",
]);

/** D-15 목록 밖(보고만) — 상위노출 주문과 다른 뜻일 수 있어 Owner 확인 전 유지 */
const OUT_OF_SCOPE_KEYS = new Set([
  "admin_menu_business_posts",
  "admin_products_drill_promo",
  "admin_menu_ads_section_push",
  /** L14(2026-11-08 Owner 「권장대로 승인」): admin_advertising·admin_promotion·admin_delivery_store_list_promote 는 「상위노출」로 바꿔 목록에서 뺐다 */
]);

/** 언어 SSOT S6: 문구가 카탈로그로 옮겨져도 화면 문구로 판정(부정 단언이 빈 확인이 되지 않게) */
const read = (p: string) => withCatalogCopy(readFileSync(path.join(process.cwd(), p), "utf8"));

describe("D-15 「홍보」 허용 목록", () => {
  it("한국어 카탈로그(병합 결과)의 「홍보」는 허용 목록 키뿐", () => {
    const ko = (MESSAGES as unknown as Record<string, Record<string, unknown>>).ko;
    const hits = Object.entries(ko)
      .filter(([, v]) => typeof v === "string" && v.includes("홍보"))
      .map(([k]) => k)
      .filter((k) => !NORMAL_TERM_KEYS.has(k) && !OUT_OF_SCOPE_KEYS.has(k));
    expect(hits).toEqual([]);
  });

  it("D-15 목록 키는 「상위노출」로 보인다", () => {
    const ko = (MESSAGES as unknown as Record<string, Record<string, string>>).ko;
    expect(ko.admin_menu_ads_promote_group).toBe("게시물 상위노출 신청");
    expect(ko.admin_menu_ads_community_promote).toBe("정보 공유 게시물 상위노출");
    expect(ko.admin_comm_promo_title).toBe("게시물 상위노출 신청");
    expect(ko.apple_iap_point_use_note).toContain("광고·상위노출에만");
    expect(ko.gift_u2_detail_apple_only_note).toContain("광고·상위노출에만");
    expect(ko.gift_u2_err_apple_restricted).toContain("광고·상위노출에만");
    expect(ko.admin_trade_kpi_promo).toBe("상위노출 중");
  });

  it("D-18 영어 잔여 없음", () => {
    const ko = (MESSAGES as unknown as Record<string, Record<string, string>>).ko;
    expect(ko.admin_delivery_ads_related_support_title).not.toMatch(/Support/);
    expect(ko.admin_delivery_ads_related_support_note).not.toMatch(/Ads lifecycle/);
  });

  it.each([
    "components/admin/community/posts/community-post-admin-shared.ts",
    "components/admin/community/AdminCommunityPostDetailPage.tsx",
    "components/admin/community/audit/community-audit-labels.ts",
    "components/admin/community/promotions/AdminCommunityPromotionsPage.tsx",
    "components/admin/trade-console/trade-console-ui.tsx",
    "lib/admin/metrics/trade-domain-metrics.ts",
    "lib/admin/metrics/community-metrics.ts",
    "components/admin/community/stats/AdminCommunityStatsPage.tsx",
    "components/admin/community/points/community-point-labels.ts",
    "components/admin/community/points/AdminCommunityPointsPage.tsx",
    "components/admin/community/support/AdminCommunitySupportPage.tsx",
    "components/admin/community/members/AdminCommunityMemberDetailPage.tsx",
    "lib/admin/community-admin/community-admin-permissions.ts",
    "lib/admin-posts/trade-post-hard-delete-eligibility.ts",
    "app/admin/community/posts/AdminPostsPageContent.tsx",
    "components/admin/stores/AdminDeliveryAdsControlPlane.tsx",
    "components/gift-certificate/BuyerGiftDetailView.tsx",
    "lib/gift-certificate/map-gift-purchase-error.ts",
  ])("%s — 「홍보」 0", (f) => {
    /** 정상 용어 허용 키(「매장 홍보」 등)의 카탈로그 문구는 빼고 판정 — S6 전에는 대체 문구에 가려 보이지 않던 허용 용어 */
    const text = read(f)
      .split("\n")
      .filter((l) => !/^\/\* i18n ([a-z0-9_.]+):/.test(l) || !NORMAL_TERM_KEYS.has(l.match(/^\/\* i18n ([a-z0-9_.]+):/)![1]))
      .join("\n");
    expect(text).not.toContain("홍보");
  });

  it("operator-labels: 상위노출 주문 · 배달 「매장 홍보」는 유지", () => {
    const src = read("lib/admin/operator-ux/operator-labels.ts");
    /** 언어 SSOT S6: 표 값은 카탈로그 키 — 키 + 카탈로그 값으로 확인 */
    expect(src).toContain('promotion_order: catalogPair("admin_post_promotion_order")');
    expect(MESSAGES.ko.admin_post_promotion_order).toBe("게시물 상위노출 주문");
    expect(src.match(/홍보/g)?.length).toBe(1);
    expect(src).toContain("매장 홍보");
  });

  it("terminology: 커뮤니티 PROMOTION 이름 = 상위노출", () => {
    const src = read("lib/admin/management/terminology.ts");
    /** 언어 SSOT B4: 대체 문구를 지우고 카탈로그 키로 — 키 + 카탈로그 값으로 확인 */
    expect(src).toContain('i18nKey: "admin_management_term_promotion"');
    expect(MESSAGES.ko.admin_management_term_promotion).toBe("상위노출");
  });
});
