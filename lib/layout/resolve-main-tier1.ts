import { isTradeFloatingMenuSurface } from "@/lib/layout/mobile-top-tier1-rules";
import { normalizeAppPathnameForTier1 } from "@/lib/layout/normalize-app-pathname";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import { canonicalHubHref } from "@/lib/delivery/customer/commerce-hub-nav";
import { GLOBAL_SEARCH_NO_ORIGIN_FALLBACK } from "@/lib/search/global/global-search-navigation-ssot";
import { isCommunityHomeSurfacePath } from "@/lib/layout/resolve-main-surface";
import {
  buildMypageSectionHref,
  findMypageMobileItem,
  findMypageMobileSection,
} from "@/lib/mypage/mypage-mobile-nav-registry";

function starts(p: string, prefix: string): boolean {
  return p === prefix || p.startsWith(`${prefix}/`);
}

export type ResolvedMainTier1Subpage = {
  showBack: boolean;
  /** true면 좌측 뒤로 숨김(주문 허브 등) */
  hideBack?: boolean;
  backHref: string;
  preferHistoryBack: boolean;
  ariaLabel: string;
  titleText: string;
  subtitle?: string;
  subtitleHref?: string;
  /** false면 `MyHubHeaderActions` 대신 `extras.tier1.rightSlot` 기대 */
  showHubQuickActions: boolean;
};

const DEFAULT: ResolvedMainTier1Subpage = {
  showBack: true,
  backHref: "/philife",
  preferHistoryBack: true,
  ariaLabel: "tier1_back",
  titleText: "",
  showHubQuickActions: true,
};

function backMypage(overrides: Partial<ResolvedMainTier1Subpage>): ResolvedMainTier1Subpage {
  return { ...DEFAULT, backHref: "/mypage", ...overrides };
}

function backHome(overrides: Partial<ResolvedMainTier1Subpage>): ResolvedMainTier1Subpage {
  return { ...DEFAULT, backHref: "/philife", ...overrides };
}

type MypageTitleRow = {
  titleText: string;
  subtitle?: string;
  backHref?: string;
  showHubQuickActions?: boolean;
};

/** 고객센터 게시판 라벨 — `BOARD_LABEL`(lib/notices/customer-center-content) 한국어 원문과 동일(`tt` 번역) */
const CS_BOARD_TITLE = { notice: "공지", system: "시스템", marketing: "마케팅" } as const;

/**
 * 내정보(`/mypage/*`) 정확 경로 → 1단 제목 (설계서 §2 제목 · §12 「제목 시점」).
 * 페이지가 `MyScreen`·`MySubpageHeader` 로 등록하는 제목·부제와 **같은 키**를 쓴다 → 첫 프레임부터 최종 제목.
 * `MyScreen` 화면은 부제가 없다(§12 「내정보는 부제 없음」).
 * 계약 테스트: `lib/layout/__tests__/mypage-tier1-title-coverage.test.ts`.
 */
const MYPAGE_EXACT_TITLES: Readonly<Record<string, MypageTitleRow>> = {
  "/mypage/account": { titleText: "account_title" },
  "/mypage/addresses/search": { titleText: "addr_v2_search_title", backHref: "/mypage/addresses" },
  "/mypage/ads": { titleText: "revenue_hub_title", subtitle: "revenue_hub_subtitle" },
  "/mypage/ads/apply": {
    titleText: "mypage_ads_apply_title",
    subtitle: "mypage_ads_apply_subtitle",
    backHref: "/mypage/ads",
  },
  "/mypage/ads/feed-request": {
    titleText: "feed_ad_req_title",
    subtitle: "feed_ad_req_subtitle",
    backHref: "/mypage/ads",
  },
  "/mypage/benefits": { titleText: "route_benefits_title", subtitle: "route_benefits_subtitle" },
  "/mypage/community-activity": {
    titleText: "route_community_activity_title",
    subtitle: "route_community_activity_subtitle",
  },
  "/mypage/community-posts": {
    titleText: "route_community_posts_title",
    subtitle: "route_community_posts_subtitle",
  },
  "/mypage/customer-center": { titleText: "mypage_comp_menu_support_cs_title" },
  "/mypage/customer-center/notice": { titleText: CS_BOARD_TITLE.notice, backHref: "/mypage/customer-center" },
  "/mypage/customer-center/system": { titleText: CS_BOARD_TITLE.system, backHref: "/mypage/customer-center" },
  "/mypage/customer-center/marketing": {
    titleText: CS_BOARD_TITLE.marketing,
    backHref: "/mypage/customer-center",
  },
  "/mypage/inbox": { titleText: "support_legacy_archive_title", subtitle: "support_legacy_archive_hint" },
  "/mypage/inquiries": { titleText: "support_legacy_archive_title", subtitle: "support_legacy_archive_hint" },
  "/mypage/offers": { titleText: "mypage_r5_offer_title" },
  "/mypage/order-notifications": {
    titleText: "order_notifications_title",
    subtitle: "order_notifications_subtitle",
    backHref: "/mypage/notifications",
    showHubQuickActions: false,
  },
  "/mypage/points": { titleText: "common_points", subtitle: "point_fin_home_subtitle" },
  "/mypage/points/charge": {
    titleText: "mypage_points_charge_title",
    subtitle: "mypage_points_charge_subtitle",
    backHref: "/mypage/points",
  },
  "/mypage/points/expiring": {
    titleText: "mypage_points_expiring_title",
    subtitle: "mypage_points_expiring_subtitle",
    backHref: "/mypage/points",
  },
  "/mypage/points/promotions": {
    titleText: "mypage_points_promotions_title",
    subtitle: "mypage_points_promotions_subtitle",
    backHref: "/mypage/products",
  },
  "/mypage/products": {
    titleText: "marketplace_seller_products_title",
    subtitle: "marketplace_seller_products_subtitle",
  },
  "/mypage/recent-viewed": {
    titleText: "route_recent_viewed_title",
    subtitle: "route_recent_viewed_subtitle",
  },
  "/mypage/required/dibay-id": { titleText: "mypage_required_dibay_id" },
  "/mypage/required/phone": { titleText: "mypage_required_phone" },
  "/mypage/store-inquiries": { titleText: "mypage_store_inquiries_title" },
  "/mypage/store-orders": { titleText: "route_store_orders_list_title" },
  "/mypage/support-history": { titleText: "support_history_title", backHref: "/mypage/customer-center" },
  "/mypage/trust": { titleText: "mypage_trust_title" },
};

function mypageRow(row: MypageTitleRow): ResolvedMainTier1Subpage {
  return backMypage({
    titleText: row.titleText,
    ...(row.subtitle ? { subtitle: row.subtitle } : {}),
    ...(row.backHref ? { backHref: row.backHref } : {}),
    showHubQuickActions: row.showHubQuickActions ?? true,
  });
}

/** 내정보 경로 제목 — 매칭 없으면 null (기존 분기로 진행) */
function resolveMypageTier1(p: string): ResolvedMainTier1Subpage | null {
  if (!p.startsWith("/mypage/")) return null;
  const exact = MYPAGE_EXACT_TITLES[p];
  if (exact) return mypageRow(exact);

  const csDetail = /^\/mypage\/customer-center\/(notice|system|marketing)\/[^/]+$/.exec(p);
  if (csDetail) {
    const type = csDetail[1] as keyof typeof CS_BOARD_TITLE;
    return mypageRow({ titleText: CS_BOARD_TITLE[type], backHref: `/mypage/customer-center/${type}` });
  }
  /** 벨·푸시 공지 딥링크 — 게시판 종류는 상세 응답으로 정해지므로 기본 「공지」 */
  if (/^\/mypage\/notices\/[^/]+$/.test(p)) {
    return mypageRow({ titleText: CS_BOARD_TITLE.notice, backHref: "/mypage/customer-center/notice" });
  }
  const noteThread = /^\/mypage\/(inbox|inquiries)\/[^/]+$/.exec(p);
  if (noteThread) {
    /** 스레드 제목(subject)은 로드 후 페이지가 덮는다 — 로딩 중 빈 제목 대신 보관함 제목 */
    return mypageRow({ titleText: "support_legacy_archive_title", backHref: `/mypage/${noteThread[1]}` });
  }
  if (/^\/mypage\/store-orders\/[^/]+$/.test(p)) {
    return mypageRow({
      titleText: "route_store_order_detail_title",
      subtitle: "route_store_order_detail_subtitle",
      backHref: "/mypage/store-orders",
    });
  }
  if (/^\/mypage\/store-orders\/[^/]+\/review$/.test(p)) {
    return mypageRow({
      titleText: "route_store_order_review_title",
      subtitle: "route_store_order_review_subtitle",
      backHref: "/mypage/store-orders",
      showHubQuickActions: false,
    });
  }

  /** `/mypage/section/{section}` · `/mypage/section/{section}/{item}` — 레지스트리 라벨(페이지와 동일) */
  const sectionMatch = /^\/mypage\/section\/([^/]+)(?:\/([^/]+))?$/.exec(p);
  if (sectionMatch) {
    const [, sectionId, itemId] = sectionMatch;
    if (itemId) {
      const item = findMypageMobileItem(sectionId!, itemId);
      if (item) return mypageRow({ titleText: item.labelKey, backHref: buildMypageSectionHref(sectionId!) });
    } else {
      const section = findMypageMobileSection(sectionId!);
      if (section) return mypageRow({ titleText: section.labelKey });
    }
  }
  return null;
}

/**
 * `RegionBar` 기본 서브페이지 1단(뒤로·제목·허브).
 * `null`이면 호출측에서 전용 분기(거래 탐색·커뮤니티 피드·배달 루트·거래 허브 루트 등)를 쓴다.
 * @param search optional `?…` or raw query — CUT 3 uses expand on `/orders`.
 */
export function resolveMainTier1Subpage(
  pathname: string,
  search = ""
): ResolvedMainTier1Subpage | null {
  const raw = (pathname ?? "").split("?")[0]!.trim();
  /** Never brand-fallback — empty path is unavailable, not "dibaY". */
  if (!raw) return { ...DEFAULT, titleText: "common_content_unavailable" };
  const p = normalizeAppPathnameForTier1(pathname);

  if (isTradeFloatingMenuSurface(p)) return null;
  if (isCommunityHomeSurfacePath(p)) return null;
  if (p === "/stores") return null;

  const mypage = resolveMypageTier1(p);
  if (mypage) return mypage;

  if (p === "/stores/browse" || starts(p, "/stores/browse/")) {
    return {
      ...DEFAULT,
      backHref: "/stores",
      titleText: "navigation_delivery",
      showHubQuickActions: false,
    };
  }

  if (p === "/stores/gift-mall") {
    return {
      ...DEFAULT,
      backHref: "/stores",
      preferHistoryBack: true,
      titleText: "gift_u2_mall_title",
      showHubQuickActions: false,
    };
  }

  if (/^\/stores\/gift-mall\/[^/]+$/.test(p)) {
    return {
      ...DEFAULT,
      backHref: "/stores/gift-mall",
      preferHistoryBack: true,
      titleText: "gift_u2_detail_title",
      showHubQuickActions: false,
    };
  }

  if (p === "/mypage/trade") {
    return {
      ...DEFAULT,
      backHref: "/mypage",
      titleText: "tier1_trade_hub_title",
      subtitle: "tier1_trade_hub_subtitle",
      showHubQuickActions: true,
    };
  }

  /** Trade hub children — never fall through to empty title / brand fallback. */
  if (p === "/mypage/trade/purchases" || p.startsWith("/mypage/trade/purchases/")) {
    return backMypage({
      titleText: "nav_trade_hub_chat",
      subtitle: "tier1_trade_hub_subtitle",
      showHubQuickActions: true,
    });
  }
  if (p === "/mypage/trade/sales" || p.startsWith("/mypage/trade/sales/")) {
    return backMypage({
      titleText: "nav_trade_hub_sales",
      subtitle: "tier1_trade_hub_subtitle",
      showHubQuickActions: true,
    });
  }
  if (p === "/mypage/trade/favorites" || p.startsWith("/mypage/trade/favorites/")) {
    return backMypage({
      titleText: "nav_trade_hub_favorites",
      subtitle: "tier1_trade_hub_subtitle",
      showHubQuickActions: true,
    });
  }
  if (p === "/mypage/trade/reviews" || p.startsWith("/mypage/trade/reviews/")) {
    return backMypage({
      titleText: "nav_trade_hub_reviews",
      subtitle: "tier1_trade_hub_subtitle",
      showHubQuickActions: true,
    });
  }
  if (p.startsWith("/mypage/trade/")) {
    return backMypage({
      titleText: "tier1_trade_hub_title",
      subtitle: "tier1_trade_hub_subtitle",
      showHubQuickActions: true,
    });
  }

  /** 주문 허브 내 배달 주문 리뷰 — 전역 1단만 사용(페이지 `DetailHeader` 중복 방지) */
  const ordersHubStoreReviewMatch = /^\/orders\/store\/([^/]+)\/review$/.exec(p);
  if (ordersHubStoreReviewMatch) {
    const orderId = ordersHubStoreReviewMatch[1]!;
    return {
      ...DEFAULT,
      backHref: `/orders?expand=${encodeURIComponent(orderId)}`,
      preferHistoryBack: true,
      ariaLabel: "tier1_back",
      titleText: "tier1_review_write",
      subtitle: "tier1_review_write_subtitle",
      showHubQuickActions: false,
    };
  }

  /** 주문 허브 내 배달 주문 상세 — 제목만 「주문 상세」로, 우측 허브(알림 등)는 유지 */
  if (/^\/orders\/store\/[^/]+$/.test(p)) {
    return {
      ...DEFAULT,
      backHref: "/orders",
      preferHistoryBack: true,
      ariaLabel: "tier1_back",
      titleText: "tier1_order_detail",
      showHubQuickActions: true,
    };
  }

  if (p === "/orders/activity") {
    return {
      ...DEFAULT,
      backHref: "/stores",
      preferHistoryBack: false,
      ariaLabel: "tier1_back",
      titleText: "commerce_hub_title",
      showHubQuickActions: false,
      hideBack: false,
      showBack: true,
    };
  }

  if (p === "/orders") {
    // CUT 3 — expand/detail on hub: show Back → /orders (never cart via blind history)
    const expand = new URLSearchParams(search.replace(/^\?/, "")).get("expand")?.trim();
    if (expand) {
      return {
        ...DEFAULT,
        showBack: true,
        hideBack: false,
        backHref: "/orders",
        preferHistoryBack: false,
        ariaLabel: "tier1_back",
        titleText: "commerce_hub_title",
        showHubQuickActions: false,
      };
    }
    return {
      ...DEFAULT,
      showBack: false,
      hideBack: true,
      backHref: "/orders/activity",
      titleText: "commerce_hub_title",
      showHubQuickActions: false,
    };
  }

  if (p === "/mypage/coupons") {
    return {
      ...DEFAULT,
      backHref: "/stores",
      preferHistoryBack: true,
      titleText: "commerce_hub_title",
      showHubQuickActions: false,
    };
  }

  if (p === "/mypage/gift-certificates") {
    return {
      ...DEFAULT,
      backHref: "/stores",
      preferHistoryBack: true,
      titleText: "commerce_hub_title",
      showHubQuickActions: false,
    };
  }

  if (/^\/mypage\/gift-certificates\/[^/]+$/.test(p)) {
    return {
      ...DEFAULT,
      backHref: canonicalHubHref("gifts"),
      preferHistoryBack: true,
      titleText: "gift_certificate_wallet_title",
      showHubQuickActions: false,
    };
  }

  if (starts(p, "/orders/")) {
    return {
      ...DEFAULT,
      showBack: false,
      hideBack: true,
      backHref: "/orders/activity",
      titleText: "tier1_order",
      showHubQuickActions: false,
    };
  }

  if (p === "/search") {
    return {
      ...DEFAULT,
      backHref: GLOBAL_SEARCH_NO_ORIGIN_FALLBACK,
      preferHistoryBack: false,
      titleText: "global_search_title",
      showHubQuickActions: false,
    };
  }

  if (p === "/market/sell" || starts(p, "/market/sell/")) {
    return {
      ...DEFAULT,
      backHref: "/market",
      preferHistoryBack: true,
      titleText: "marketplace_sell_hub_title",
      subtitle: "marketplace_sell_hub_subtitle",
      showHubQuickActions: true,
    };
  }

  if (starts(p, "/mypage/products/")) {
    return {
      ...DEFAULT,
      backHref: "/market/sell",
      preferHistoryBack: true,
      titleText: "marketplace_seller_products_title",
      subtitle: "marketplace_seller_products_subtitle",
      showHubQuickActions: true,
    };
  }

  if (starts(p, "/mypage/points/promotions/")) {
    return {
      ...DEFAULT,
      backHref: "/mypage/products",
      preferHistoryBack: true,
      titleText: "tier1_point_promotion",
      subtitle: "tier1_point_promotion_subtitle",
      showHubQuickActions: true,
    };
  }

  if (p === "/services" || starts(p, "/services/")) {
    return backHome({ titleText: "tier1_service", showHubQuickActions: true });
  }

  if (p === "/mypage") {
    return backHome({ titleText: "tier1_myinfo", showHubQuickActions: true });
  }

  if (p === "/address/select") {
    return backMypage({ titleText: "tier1_address_setup", showHubQuickActions: false });
  }

  if (p === "/mypage/addresses") {
    return backMypage({
      titleText: "address_manage_title",
      showHubQuickActions: true,
    });
  }

  if (p === "/mypage/addresses/edit") {
    return backMypage({
      titleText: "addr_ui_add_title",
      showHubQuickActions: true,
    });
  }

  if (p === "/mypage/addresses/fine-tune") {
    return backMypage({
      titleText: "addr_ui_fine_tune_title",
      showHubQuickActions: true,
    });
  }

  if (p === "/community-messenger") {
    return backHome({
      titleText: "tier1_messenger",
      subtitle: "tier1_messenger_hub_subtitle",
      showHubQuickActions: true,
    });
  }

  /**
   * 메신저 「거래 채팅」/「배달 채팅」 묶음 전용 서브 라우트.
   * 1단 헤더 제목·뒤로가기는 `useCommunityMessengerHomeShellEffects` 가 클라이언트에서
   * `?from` 을 보존해 덮어쓴다. 여기서는 RegionBar 기본값(인박스로 복귀)만 둔다.
   */
  if (p === "/community-messenger/trade-chats") {
    return {
      ...DEFAULT,
      backHref: "/community-messenger?section=chats",
      preferHistoryBack: false,
      ariaLabel: "tier1_messenger_back",
      titleText: "nav_trade_chat_label",
      showHubQuickActions: false,
    };
  }

  if (p === "/community-messenger/delivery-chats") {
    return {
      ...DEFAULT,
      backHref: "/community-messenger?section=chats",
      preferHistoryBack: false,
      ariaLabel: "tier1_messenger_back",
      titleText: "tier1_delivery_chat",
      showHubQuickActions: false,
    };
  }

  if (/^\/community-messenger\/rooms\/[^/]+$/.test(p)) {
    return {
      ...DEFAULT,
      backHref: "/community-messenger?section=chats",
      /**
       * `RegionBar` 가 `buildMessengerRoomListBackHref`(`cm_list`·`from`)로 `backHref` 를 덮고,
       * 방 화면에서는 **히스토리 백 우선**(`preferHistoryBack: true`)으로 직전 목록 복귀.
       */
      preferHistoryBack: true,
      ariaLabel: "tier1_messenger_back",
      titleText: "tier1_messenger_chat",
      subtitle: "tier1_messenger_chat_subtitle",
      showHubQuickActions: false,
    };
  }

  if (p === "/write" || starts(p, "/write/")) {
    return {
      ...DEFAULT,
      backHref: "/market",
      preferHistoryBack: true,
      titleText: "tier1_write",
      showHubQuickActions: true,
    };
  }

  if (p === "/philife/write" || starts(p, "/philife/write")) {
    return backHome({ titleText: "tier1_community_write", showHubQuickActions: true });
  }

  if (p === "/philife/my") {
    return backHome({ titleText: "tier1_my_community_activity", showHubQuickActions: true });
  }

  if (p === "/mypage/reviews" || starts(p, "/mypage/reviews/")) {
    return backHome({ titleText: "tier1_review_management", showHubQuickActions: true });
  }

  if (p === "/mypage/purchases") {
    return backHome({ titleText: "tier1_trade_management", showHubQuickActions: true });
  }

  if (/^\/mypage\/purchases\/[^/]+$/.test(p)) {
    return backHome({ titleText: "tier1_purchase_detail", showHubQuickActions: true });
  }

  if (p === "/mypage/sales" || starts(p, "/mypage/sales/")) {
    return backHome({ titleText: "tier1_trade_management", showHubQuickActions: true });
  }

  if (p === "/mypage/purchases") {
    return backMypage({ titleText: "tier1_trade_management", subtitle: "tier1_trade_manage_purchases_sub", showHubQuickActions: true });
  }

  if (/^\/mypage\/purchases\/[^/]+$/.test(p)) {
    return backMypage({ titleText: "tier1_purchase_detail", subtitle: "tier1_purchase_detail_trade_sub", showHubQuickActions: true });
  }

  if (p === "/mypage/sales" || starts(p, "/mypage/sales/")) {
    return backMypage({ titleText: "tier1_trade_management", subtitle: "tier1_trade_manage_sales_sub", showHubQuickActions: true });
  }

  if (p === "/mypage/reviews" || starts(p, "/mypage/reviews/")) {
    return backMypage({ titleText: "tier1_review_management", subtitle: "tier1_review_manage_sub", showHubQuickActions: true });
  }

  if (p === "/my/community-posts") {
    return backMypage({
      titleText: "tier1_my_community_posts",
      subtitle: "tier1_my_community_posts_subtitle",
      showHubQuickActions: true,
    });
  }

  if (p === "/my/benefits") {
    return backMypage({ titleText: "tier1_member_benefits", subtitle: "tier1_member_benefits_subtitle", showHubQuickActions: true });
  }

  if (p === "/my/account") {
    return backMypage({ titleText: "tier1_my_account", subtitle: "tier1_my_account_subtitle", showHubQuickActions: true });
  }

  if (p === "/my/account/phone-verification") {
    return backMypage({ titleText: "tier1_phone_verification", subtitle: "tier1_phone_verification_subtitle", showHubQuickActions: true });
  }

  if (p === "/my/ads") {
    return backMypage({ titleText: "tier1_my_ads", subtitle: "tier1_my_ads_subtitle", showHubQuickActions: true });
  }

  if (p === "/my/ads/apply") {
    return { ...DEFAULT, backHref: "/my/ads", titleText: "tier1_ads_apply", subtitle: "tier1_ads_apply_subtitle", showHubQuickActions: true };
  }

  if (p === "/my/store-inquiries") {
    return backMypage({ titleText: "tier1_store_inquiries", subtitle: "tier1_store_inquiries_subtitle", showHubQuickActions: true });
  }

  if (p === "/my/store-orders") {
    return backMypage({ titleText: "tier1_store_orders", showHubQuickActions: true });
  }

  if (/^\/my\/store-orders\/[^/]+$/.test(p)) {
    return backMypage({
      titleText: "tier1_order_detail",
      subtitle: "tier1_store_order_subtitle",
      preferHistoryBack: true,
      ariaLabel: "tier1_back",
      showHubQuickActions: true,
    });
  }

  if (/^\/my\/store-orders\/[^/]+\/review$/.test(p)) {
    return backMypage({ titleText: "tier1_review_write", subtitle: "tier1_review_write_subtitle", showHubQuickActions: false });
  }

  if (p === "/my/points") {
    return backMypage({ titleText: "tier1_points_hub", subtitle: "tier1_points_hub_sub", showHubQuickActions: true });
  }

  if (p === "/my/points/promotions") {
    return { ...DEFAULT, backHref: "/mypage/points", titleText: "tier1_point_promotion", subtitle: "tier1_point_promotion_subtitle", showHubQuickActions: true };
  }

  if (p === "/my/points/expiring") {
    return { ...DEFAULT, backHref: "/mypage/points", titleText: "tier1_points_expiring", subtitle: "tier1_points_expiring_subtitle", showHubQuickActions: true };
  }

  if (p === "/my/points/ledger") {
    return { ...DEFAULT, backHref: "/mypage/points", titleText: "tier1_points_ledger", subtitle: "tier1_points_ledger_subtitle", showHubQuickActions: true };
  }

  if (p === "/my/points/charge") {
    return { ...DEFAULT, backHref: "/mypage/points", titleText: "tier1_points_charge", subtitle: "tier1_points_charge_subtitle", showHubQuickActions: true };
  }

  if (p === "/my/notifications" || p === "/mypage/notifications") {
    return backMypage({ titleText: "tier1_notifications", subtitle: "tier1_notifications_subtitle", showHubQuickActions: false });
  }

  if (p === "/my/trust") {
    return backMypage({ titleText: "tier1_trust", subtitle: "tier1_trust_subtitle", showHubQuickActions: true });
  }

  if (p === "/my/blocked-users") {
    return backMypage({ titleText: "tier1_blocked_users", subtitle: "tier1_blocked_users_subtitle", showHubQuickActions: true });
  }

  if (p === "/my/reviews" || starts(p, "/my/reviews/")) {
    return backMypage({ titleText: "tier1_received_reviews", subtitle: "tier1_received_reviews_subtitle", showHubQuickActions: true });
  }

  if (p === "/my/products" || starts(p, "/my/products/")) {
    return backMypage({ titleText: "tier1_my_products", subtitle: "tier1_my_products_subtitle", showHubQuickActions: true });
  }

  if (p === "/my/edit" || p === "/mypage/edit" || p === "/mypage/section/account/profile/edit") {
    return backMypage({ titleText: "tier1_profile_edit", subtitle: "tier1_profile_edit_subtitle", showHubQuickActions: true });
  }

  if (
    p === "/stores/owner" || /^\/stores\/owner\/.+/.test(p) ||
    p === "/mypage/business" || /^\/mypage\/business\/.+/.test(p)
  ) {
    return backMypage({ titleText: "tier1_store_ops", subtitle: "tier1_store_ops_sub", showHubQuickActions: true });
  }

  if (p === "/stores/owner/apply" || p === "/my/business/apply") {
    return { ...DEFAULT, backHref: "/stores/owner", titleText: "tier1_business_apply", showHubQuickActions: true };
  }

  if (p === "/my/recent-viewed") {
    return backMypage({ titleText: "tier1_recent_viewed", subtitle: "tier1_recent_viewed_subtitle", showHubQuickActions: true });
  }

  if (p === "/terms" || starts(p, "/terms/")) {
    return {
      ...DEFAULT,
      backHref: "/mypage",
      preferHistoryBack: true,
      titleText: "mypage_hub_terms_title",
      showHubQuickActions: false,
    };
  }

  /** 정책 행(내정보 홈) — 본문 h1 대신 1단 제목 (설계서 §15) */
  if (p === "/privacy") {
    return {
      ...DEFAULT,
      backHref: "/mypage",
      preferHistoryBack: true,
      titleText: "ui_finish_privacy_title",
      showHubQuickActions: false,
    };
  }

  if (p === "/business-info") {
    return {
      ...DEFAULT,
      backHref: "/mypage",
      preferHistoryBack: true,
      titleText: "business_info_page_title",
      showHubQuickActions: false,
    };
  }

  /** 1단 제목 누락 9경로 — 첫 프레임부터 제목 표시 (Owner 지시 2026-10-20). 페이지가 등록하는 제목이 있으면 그 값이 우선. */
  if (/^\/write\/[^/]+$/.test(p) || p === "/posts/new") {
    return { ...DEFAULT, backHref: "/write", preferHistoryBack: true, titleText: "tier1_write", showHubQuickActions: false };
  }

  if (/^\/orders\/store\/[^/]+\/chat$/.test(p)) {
    return { ...DEFAULT, backHref: "/orders", preferHistoryBack: true, titleText: "tier1_order_chat", showHubQuickActions: false };
  }

  if (/^\/group-chat\/[^/]+$/.test(p)) {
    return { ...DEFAULT, backHref: "/group-chat", preferHistoryBack: true, titleText: "tier1_group_chat_room", showHubQuickActions: false };
  }

  if (/^\/group\/[^/]+$/.test(p)) {
    return {
      ...DEFAULT,
      backHref: "/community-messenger",
      preferHistoryBack: true,
      titleText: "tier1_group_invite",
      showHubQuickActions: false,
    };
  }

  if (p === "/onboarding/profile") {
    return { ...DEFAULT, backHref: "/", preferHistoryBack: true, titleText: "tier1_onboarding_profile", showHubQuickActions: false };
  }

  if (/^\/u\/[^/]+$/.test(p)) {
    return { ...DEFAULT, backHref: "/", preferHistoryBack: true, titleText: "tier1_public_profile", showHubQuickActions: false };
  }

  if (starts(p, "/my/settings") || starts(p, "/mypage/settings")) {
    return backMypage({ titleText: "tier1_app_settings", showHubQuickActions: true });
  }

  /** `/mypage/section/...` 미등록 항목 — `MainTier1Extras`로 덮어쓰기 전 RegionBar 기본값 */
  if (starts(p, "/mypage/section")) {
    return backMypage({ titleText: "tier1_myinfo", showHubQuickActions: true });
  }

  if (p === "/products/new" || starts(p, "/products/new/")) {
    return backHome({ titleText: "tier1_product_create", showHubQuickActions: true });
  }

  if (/^\/products\/[^/]+\/edit$/.test(p)) {
    return backHome({ titleText: "tier1_product_edit", showHubQuickActions: true });
  }

  if (/^\/products\/[^/]+$/.test(p)) {
    return backHome({ titleText: "tier1_product", showHubQuickActions: false });
  }

  /**
   * `/post/:id` 거래·서비스 글 상세 — id 는 UUID 외 형식도 있을 수 있음.
   * `PostDetailView`·페이지 부트스트랩의 `MainTier1Extras`로 카테고리(피드 주제)명을 덮어씀.
   */
  if (/^\/post\/[^/]+$/.test(p)) {
    return {
      ...DEFAULT,
      backHref: "/philife",
      preferHistoryBack: true,
      ariaLabel: "tier1_back",
      titleText: "tier1_trade",
      showHubQuickActions: true,
    };
  }

  /**
   * `/philife/:postId` 동네 글 상세 (단일 세그먼트·UUID 형태).
   * `MainTier1Extras`로 주제 라벨을 덮어씀 — 여기서는 짧은 기본 제목만.
   */
  if (p.startsWith("/philife/")) {
    const seg = p.slice("/philife/".length);
    if (seg && !seg.includes("/") && isUuidLikeString(seg)) {
      return {
        ...DEFAULT,
        backHref: "/philife",
        preferHistoryBack: true,
        ariaLabel: "tier1_feed_back",
        titleText: "tier1_community",
        showHubQuickActions: true,
      };
    }
  }

  const back = p.startsWith("/my/") || p.startsWith("/mypage") ? "/mypage" : "/philife";
  return { ...DEFAULT, backHref: back, titleText: "", showHubQuickActions: true };
}
