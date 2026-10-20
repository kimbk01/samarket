import type {
  MypageHomeLinkMenuItem,
  MypageHomeMenuItemConfig,
} from "@/lib/mypage/mypage-home-menu-types";
import {
  MYPAGE_HOME_ACCOUNT_HREF,
  MYPAGE_HOME_COMMUNITY_ACTIVITY_HREF,
  MYPAGE_HOME_COMMUNITY_POSTS_HREF,
  MYPAGE_HOME_ACCOUNT_LEAVE_HREF,
  MYPAGE_HOME_RECENT_VIEWED_HREF,
  MYPAGE_HOME_STORE_ORDERS_HREF,
  MYPAGE_HOME_TRADE_FAVORITES_HREF,
  MYPAGE_HOME_TRADE_OFFERS_HREF,
  MYPAGE_HOME_TRADE_REVIEWS_HREF,
  MYPAGE_HOME_MY_PRODUCTS_HREF,
} from "@/lib/mypage/mypage-home-hub-links";
import { TRADE_CHAT_MESSENGER_LIST_HREF } from "@/lib/chats/surfaces/trade-chat-surface";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";

export type {
  MypageHomeLinkMenuItem,
  MypageHomeAddressMenuItem,
  MypageHomeLanguageMenuItem,
  MypageHomeMenuIconId,
  MypageHomeMenuItemConfig,
} from "@/lib/mypage/mypage-home-menu-types";

export { MYPAGE_HOME_QUICK_ITEMS } from "@/lib/mypage/mypage-home-quick-config";

/**
 * 「활동」 그룹 — 거래 행(최종 설계 H0 #2). Slice 3 IA 거래 활동 MERGE.
 * 구매 내역 행 없음(마켓 UI-6 HARD LOCK — buyer purchase list 재도입 금지).
 * 진행중 거래 = `/mypage/products` 직행(`MYPAGE_HOME_TRADE_SALES_HREF` 리다이렉트 왕복 제거, §2.1).
 */
export const MYPAGE_HOME_TRADE_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: MYPAGE_HOME_MY_PRODUCTS_HREF,
    titleKey: "mypage_comp_menu_trade_active_title",
    icon: "package",
    valueSource: { kind: "summary-count", field: "salesActiveCount", format: "selling" },
  },
  {
    href: TRADE_CHAT_MESSENGER_LIST_HREF,
    titleKey: "mypage_home_menu_trade_chat",
    icon: "messages-square",
    valueSource: { kind: "trade-chat-unread" },
  },
  {
    href: MYPAGE_HOME_TRADE_FAVORITES_HREF,
    titleKey: "mypage_comp_menu_trade_favorites_title",
    icon: "heart",
    valueSource: { kind: "summary-count", field: "favoritesCount", format: "count" },
  },
  {
    href: MYPAGE_HOME_TRADE_OFFERS_HREF,
    titleKey: "mypage_home_menu_offers",
    icon: "receipt-text",
    valueSource: { kind: "summary-count", field: "offersReceivedPending", format: "pending" },
    hrefSource: "offers-tab",
  },
  {
    href: MYPAGE_HOME_RECENT_VIEWED_HREF,
    titleKey: "mypage_hub_recent_viewed",
    icon: "history",
  },
  {
    href: MYPAGE_HOME_TRADE_REVIEWS_HREF,
    titleKey: "mypage_comp_nav_sec_trade_reviews_label",
    icon: "star",
  },
];

/**
 * 「활동」 그룹 안 커뮤니티 행 — 거래 행 바로 다음, **같은 그룹**(v2.1 §0.1, 최종 설계 H0 #2).
 */
export const MYPAGE_HOME_COMMUNITY_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: MYPAGE_HOME_COMMUNITY_POSTS_HREF,
    titleKey: "mypage_comp_menu_community_posts_title",
    icon: "book-open",
    valueSource: { kind: "summary-count", field: "communityPostsCount", format: "count" },
  },
  {
    href: MYPAGE_HOME_COMMUNITY_ACTIVITY_HREF,
    titleKey: "mypage_home_menu_community_activity",
    icon: "message-circle",
  },
];

/** Store section rows after the owner-entry row (orders / rider) — unchanged by gate. */
export const MYPAGE_HOME_STORE_TAIL_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: MYPAGE_HOME_STORE_ORDERS_HREF,
    titleKey: "mypage_comp_menu_store_order_history_title",
    icon: "shopping-bag",
    valueSource: { kind: "summary-count", field: "storeOrdersActiveCount", format: "active" },
  },
  {
    href: "/mypage/section/store/rider",
    titleKey: "mypage_comp_menu_store_rider_title",
    icon: "truck",
  },
  /** D19 — 진입 경로가 없던 매장 문의 내역 */
  {
    href: "/mypage/store-inquiries",
    titleKey: "mypage_store_inquiries_title",
    icon: "message-question",
  },
];

/**
 * 자산 그룹 (최종 설계 H0 #4) — 포인트 → 쿠폰 → 상품권 → 내 홍보/광고 → 충전 신청 → 회원 혜택.
 * 값은 `GET /api/me/mypage-summary` (포인트 잔액은 금액이라 0·음수 그대로, 모름 = "—").
 */
export const MYPAGE_HOME_ASSET_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: "/mypage/points",
    titleKey: "mypage_comp_stat_points",
    icon: "coins",
    valueSource: { kind: "summary-points" },
  },
  {
    href: "/mypage/coupons",
    titleKey: "store_coupon_wallet_title",
    icon: "ticket",
    valueSource: { kind: "summary-count", field: "couponsAvailableCount", format: "sheets" },
  },
  {
    href: "/mypage/gift-certificates",
    titleKey: "commerce_hub_tab_gifts",
    icon: "gift",
    valueSource: { kind: "summary-count", field: "giftCertificatesOwned", format: "sheets" },
  },
  {
    href: "/mypage/ads",
    titleKey: "mypage_comp_business_ads",
    icon: "megaphone",
    /** S46 진행중 탭 구현 전 서버가 `hidden` → 값 슬롯 없음 */
    valueSource: { kind: "summary-count", field: "adsActiveCount", format: "active" },
    testId: "mypage-revenue-hub-entry",
  },
  {
    href: "/mypage/points/charge",
    titleKey: "points_charge",
    icon: "wallet",
  },
  {
    href: "/mypage/benefits",
    titleKey: "route_benefits_title",
    icon: "badge-percent",
  },
];

/**
 * Presentation only — does NOT re-implement `getOwnerStoreGateState`.
 * `null` gate (unknown / guest) → apply entry (same as empty).
 */
export type MypageHomeStoreOwnerEntry = MypageHomeLinkMenuItem & {
  /** pending 계열만 — `formatStoreApprovalStatusI18n` 에 넘길 DB status */
  approvalStatusForBadge?: string | null;
};

export function resolveMypageHomeStoreOwnerEntry(
  gate: OwnerStoreGateState | null,
  firstStoreId?: string | null,
): MypageHomeStoreOwnerEntry {
  if (!gate || gate.kind === "empty") {
    return {
      href: OwnerRoutes.apply(),
      titleKey: "mypage_hub_store_apply",
      icon: "store",
    };
  }
  if (gate.kind === "approved") {
    return {
      href: OwnerRoutes.hub(firstStoreId),
      titleKey: "mypage_comp_menu_store_enter_title",
      icon: "store",
    };
  }
  return {
    href: OwnerRoutes.hub(),
    titleKey: "mypage_comp_menu_store_approval_progress_title",
    icon: "store",
    approvalStatusForBadge: gate.approval_status || null,
  };
}

/** @deprecated Prefer `resolveMypageHomeStoreOwnerEntry` + `MYPAGE_HOME_STORE_TAIL_ITEMS`. */
export const MYPAGE_HOME_STORE_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: OwnerRoutes.apply(),
    titleKey: "mypage_hub_store_apply",
    icon: "store",
  },
  ...MYPAGE_HOME_STORE_TAIL_ITEMS,
];

/**
 * Account — security / address / payment / notifications (no leave/logout).
 * Leave + logout live in the danger flow group (see DANGER items export below).
 */
export const MYPAGE_HOME_ACCOUNT_ITEMS: MypageHomeMenuItemConfig[] = [
  {
    href: MYPAGE_HOME_ACCOUNT_HREF,
    titleKey: "mypage_settings_account",
    icon: "user-round",
  },
  {
    kind: "addresses",
    titleKey: "mypage_comp_menu_account_address_title",
    icon: "address-pin",
    valueSource: { kind: "address-public-label" },
  },
  {
    href: "/mypage/section/store/payment",
    titleKey: "mypage_comp_menu_account_payment_title",
    icon: "credit-card",
  },
  {
    href: "/mypage/section/settings/device-permissions",
    titleKey: "mypage_comp_menu_account_security_title",
    icon: "shield",
  },
  {
    href: "/mypage/section/settings/notifications",
    titleKey: "mypage_comp_menu_account_notifications_title",
    icon: "bell",
  },
  { kind: "language-toggle", icon: "languages" },
  // C-4: 국가 설정은 저장값을 읽는 기능이 없어 홈 행만 숨김 — 경로·데이터 유지 (LEGACY-IA-FEATURE-PRESERVATION)
];

/** Danger — leave (logout is LogoutActionTrigger in UI, not a link row). */
export const MYPAGE_HOME_DANGER_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: MYPAGE_HOME_ACCOUNT_LEAVE_HREF,
    titleKey: "settings_leave",
    icon: "hand",
    tone: "danger",
  },
];

export const MYPAGE_HOME_SERVICE_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: "/mypage/section/account/favorite-users",
    titleKey: "settings_following_users",
    icon: "users",
  },
  {
    href: "/mypage/section/account/blocked-users",
    titleKey: "settings_blocked_users",
    icon: "user-block",
  },
  {
    href: "/mypage/section/account/hidden-users",
    titleKey: "settings_hidden_users",
    icon: "eye-off",
  },
  {
    href: "/mypage/section/settings/region",
    titleKey: "settings_bulk_region_change",
    icon: "map-pin",
  },
  {
    href: "/mypage/section/settings/chat-settings",
    titleKey: "settings_chat",
    icon: "message-square",
  },
  // C-4: 동영상 자동재생·개인화 설정은 저장값을 읽는 기능이 없어 홈 행만 숨김 — 경로·데이터 유지
  {
    href: "/mypage/section/settings/cache",
    titleKey: "settings_cache_clear",
    icon: "trash-2",
  },
  {
    href: "/mypage/section/settings/version",
    titleKey: "settings_version",
    icon: "info",
    valueSource: { kind: "installed-version" },
  },
];

/**
 * Support — Customer Center hub only (boards + shortcuts live inside hub).
 * Legacy notices / inquiries / inbox flat rows removed after CS cutover.
 */
export const MYPAGE_HOME_SUPPORT_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: "/mypage/customer-center",
    titleKey: "mypage_comp_menu_support_cs_title",
    icon: "help-circle",
  },
];

/**
 * Policy — terms → privacy → business (scroll foot after support).
 */
export const MYPAGE_HOME_POLICY_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: "/mypage/section/settings/terms",
    titleKey: "mypage_comp_menu_support_terms_title",
    icon: "file-text",
  },
  {
    href: "/privacy",
    titleKey: "mypage_comp_settings_privacy_link",
    icon: "lock",
  },
  {
    href: "/business-info",
    titleKey: "mypage_comp_menu_support_business_title",
    icon: "building",
  },
];

/** Flow group ids — menu config / dashboard composer SSOT. */
export type MyPageFlowGroup =
  | "identity"
  | "activity"
  | "store_order"
  | "assets"
  | "account"
  | "service"
  | "support"
  | "policy"
  | "danger";

/**
 * 로그인 회원 홈 그룹 순서(IA 계약 9그룹) + 관리자 행은 **맨 끝**(K5/X5 — 위험 그룹 다음).
 * `MyPageHomeDashboard` JSX 순서가 이 배열과 같아야 한다(단위 테스트로 고정).
 */
export const MYPAGE_HOME_MEMBER_GROUP_ORDER: readonly (MyPageFlowGroup | "admin")[] = [
  "identity",
  "activity",
  "store_order",
  "assets",
  "account",
  "service",
  "support",
  "policy",
  "danger",
  "admin",
] as const;

/** 비로그인 홈 — 로그인과 같은 1열 흐름, 활동·자산·위험·관리자 없음(로그인 유도 행만) */
export const MYPAGE_HOME_GUEST_GROUP_ORDER: readonly (MyPageFlowGroup | "guest_stats" | "guest_quick")[] = [
  "identity",
  "guest_stats",
  "guest_quick",
  "store_order",
  "account",
  "service",
  "support",
  "policy",
] as const;

export type MypageHomeViewerRole = "guest" | "member" | "owner" | "admin";

export type MypageHomeMenuOrderGroup = {
  group: MyPageFlowGroup | "admin" | "guest_stats" | "guest_quick";
  rows: string[];
};

/**
 * 역할별 홈 메뉴 순서(그룹 → 행 라벨 키) — 순서 스냅샷 테스트용 단일 정의.
 * owner = 승인 매장 보유(첫 매장 행 = 매장 진입). admin = 관리자 행 맨 끝.
 */
export function buildMypageHomeMenuOrder(role: MypageHomeViewerRole): MypageHomeMenuOrderGroup[] {
  const keysOf = (items: MypageHomeMenuItemConfig[]) =>
    items.map((it) => ("titleKey" in it ? String(it.titleKey) : `kind:${it.kind}`));
  const ownerEntry =
    role === "owner"
      ? resolveMypageHomeStoreOwnerEntry({ kind: "approved" }, "store-1")
      : resolveMypageHomeStoreOwnerEntry(null);
  const storeRows = keysOf([ownerEntry, ...MYPAGE_HOME_STORE_TAIL_ITEMS]);
  const account = keysOf(MYPAGE_HOME_ACCOUNT_ITEMS);
  const service = keysOf(MYPAGE_HOME_SERVICE_ITEMS);
  const support = keysOf(MYPAGE_HOME_SUPPORT_ITEMS);
  const policy = keysOf(MYPAGE_HOME_POLICY_ITEMS);

  if (role === "guest") {
    return [
      { group: "identity", rows: ["guest_profile_card"] },
      { group: "guest_stats", rows: ["guest_stat_grid"] },
      { group: "guest_quick", rows: ["guest_quick_access"] },
      { group: "store_order", rows: storeRows },
      { group: "account", rows: account },
      { group: "service", rows: service },
      { group: "support", rows: support },
      { group: "policy", rows: policy },
    ];
  }

  const groups: MypageHomeMenuOrderGroup[] = [
    { group: "identity", rows: ["profile", "manner", "required_info(incomplete only)", "banner"] },
    { group: "activity", rows: keysOf([...MYPAGE_HOME_TRADE_ITEMS, ...MYPAGE_HOME_COMMUNITY_ITEMS]) },
    { group: "store_order", rows: storeRows },
    { group: "assets", rows: keysOf(MYPAGE_HOME_ASSET_ITEMS) },
    { group: "account", rows: account },
    { group: "service", rows: service },
    { group: "support", rows: support },
    { group: "policy", rows: policy },
    { group: "danger", rows: [...keysOf(MYPAGE_HOME_DANGER_ITEMS), "logout(menu_row)"] },
  ];
  if (role === "admin") groups.push({ group: "admin", rows: ["admin_console"] });
  return groups;
}
