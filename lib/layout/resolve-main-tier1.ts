import { isTradeFloatingMenuSurface } from "@/lib/layout/mobile-top-tier1-rules";
import { normalizeAppPathnameForTier1 } from "@/lib/layout/normalize-app-pathname";
import { isUuidLikeString } from "@/lib/shared/uuid-string";

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

/**
 * `RegionBar` 기본 서브페이지 1단(뒤로·제목·허브).
 * `null`이면 호출측에서 전용 분기(거래 탐색·커뮤니티 피드·배달 루트·거래 허브 루트 등)를 쓴다.
 */
export function resolveMainTier1Subpage(pathname: string): ResolvedMainTier1Subpage | null {
  const raw = (pathname ?? "").split("?")[0]!.trim();
  if (!raw) return { ...DEFAULT, titleText: "dibaY" };
  const p = normalizeAppPathnameForTier1(pathname);

  if (isTradeFloatingMenuSurface(p)) return null;
  if (p === "/philife") return null;
  if (p === "/community") return null;
  if (p === "/stores") return null;

  if (p === "/stores/browse" || starts(p, "/stores/browse/")) {
    return {
      ...DEFAULT,
      backHref: "/stores",
      titleText: "navigation_delivery",
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

  /** 주문 허브 내 배달 주문 리뷰 — 전역 1단만 사용(페이지 `DetailHeader` 중복 방지) */
  const ordersHubStoreReviewMatch = /^\/orders\/store\/([^/]+)\/review$/.exec(p);
  if (ordersHubStoreReviewMatch) {
    const orderId = ordersHubStoreReviewMatch[1]!;
    return {
      ...DEFAULT,
      backHref: `/orders/store/${encodeURIComponent(orderId)}`,
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
      backHref: "/orders?tab=store",
      preferHistoryBack: true,
      ariaLabel: "tier1_back",
      titleText: "tier1_order_detail",
      showHubQuickActions: true,
    };
  }

  if (p === "/orders" || starts(p, "/orders/")) {
    return {
      ...DEFAULT,
      showBack: false,
      hideBack: true,
      backHref: "/philife",
      titleText: "tier1_order",
      showHubQuickActions: false,
    };
  }

  if (p === "/search") {
    return backHome({ titleText: "tier1_search", showHubQuickActions: true });
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
    return backHome({ titleText: "tier1_write", showHubQuickActions: true });
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

  if (p === "/my/account" || p === "/mypage/account") {
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

  if (p === "/my/store-orders" || p === "/mypage/store-orders") {
    return backMypage({ titleText: "tier1_store_orders", showHubQuickActions: true });
  }

  if (/^\/my\/store-orders\/[^/]+$/.test(p) || /^\/mypage\/store-orders\/[^/]+$/.test(p)) {
    return backMypage({
      titleText: "tier1_order_detail",
      subtitle: "tier1_store_order_subtitle",
      preferHistoryBack: true,
      ariaLabel: "tier1_back",
      showHubQuickActions: true,
    });
  }

  if (/^\/my\/store-orders\/[^/]+\/review$/.test(p) || /^\/mypage\/store-orders\/[^/]+\/review$/.test(p)) {
    return backMypage({ titleText: "tier1_review_write", subtitle: "tier1_review_write_subtitle", showHubQuickActions: false });
  }

  if (p === "/my/points" || p === "/mypage/points") {
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

  if (p === "/mypage/order-notifications") {
    return backMypage({ titleText: "tier1_order_notifications", subtitle: "tier1_order_notifications_sub", showHubQuickActions: false });
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

  if (starts(p, "/my/settings") || starts(p, "/mypage/settings")) {
    return backMypage({ titleText: "tier1_app_settings", showHubQuickActions: true });
  }

  /** `/mypage/section/...` — `MainTier1Extras`로 섹션 제목 덮어쓰기 전 RegionBar 기본값 */
  if (starts(p, "/mypage/section/")) {
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
