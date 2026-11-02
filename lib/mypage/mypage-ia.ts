/**
 * 내정보 분류(IA) 단일 기준 — Owner 승인 2026-11-02 (`docs/audit/mypage-subpage-unified-design-2026-11-02.md`).
 *
 * 단계: L0 홈 `/mypage` → L1 분류 `/mypage/section/{분류}` → L2 기능 화면 → L3 상세·입력.
 * - 홈 분류 카드 · 분류 화면 행 · 하위 화면 제목 · 뒤로 목적지 · 하단 탭 표시를 모두 이 파일에서 정한다.
 * - 하위 화면 제목 = 분류 화면 행 이름 그대로 (메뉴 이름 ≠ 화면 제목 금지).
 * - 하단 탭은 L0·L1 에서만 보인다 (L2 이하 숨김 — 하단 버튼 바와 겹쳐 쌓이지 않게).
 * - 구매 내역 행 없음(마켓 UI-6 HARD LOCK). 주소는 항상 `/mypage/addresses`(주소 HARD LOCK).
 */
import type { MessageKey } from "@/lib/i18n/messages";
import type {
  MypageHomeLinkMenuItem,
  MypageHomeMenuIconId,
  MypageHomeMenuItemConfig,
} from "@/lib/mypage/mypage-home-menu-types";
import {
  MYPAGE_HOME_ACCOUNT_HREF,
  MYPAGE_HOME_ACCOUNT_LEAVE_HREF,
  MYPAGE_HOME_COMMUNITY_ACTIVITY_HREF,
  MYPAGE_HOME_COMMUNITY_POSTS_HREF,
  MYPAGE_HOME_MY_PRODUCTS_HREF,
  MYPAGE_HOME_RECENT_VIEWED_HREF,
  MYPAGE_HOME_STORE_ORDERS_HREF,
  MYPAGE_HOME_TRADE_FAVORITES_HREF,
  MYPAGE_HOME_TRADE_OFFERS_HREF,
} from "@/lib/mypage/mypage-home-hub-links";
import { TRADE_CHAT_MESSENGER_LIST_HREF } from "@/lib/chats/surfaces/trade-chat-surface";

export const MYPAGE_IA_CATEGORY_IDS = ["trade", "community", "store", "asset", "account", "settings"] as const;
export type MypageIaCategoryId = (typeof MYPAGE_IA_CATEGORY_IDS)[number];

/** 분류 화면 행 — 링크 행(`MypageHomeMenuItemConfig`) 또는 화면별 특수 행 */
export type MypageIaRow =
  | MypageHomeMenuItemConfig
  | { kind: "store-owner-entry" }
  | { kind: "customer-center" }
  | { kind: "logout" }
  | { kind: "admin" };

export type MypageIaGroup = { titleKey: MessageKey | null; rows: MypageIaRow[] };

export type MypageIaCategory = {
  id: MypageIaCategoryId;
  titleKey: MessageKey;
  descKey: MessageKey;
  icon: MypageHomeMenuIconId;
  /** 분류 화면 맨 위에 필수 정보 카드 (계정·보안) */
  showRequiredInfo?: boolean;
  groups: MypageIaGroup[];
};

export const MYPAGE_IA_CATEGORY_HREF_PREFIX = "/mypage/section/";

export function buildMypageIaCategoryHref(id: MypageIaCategoryId): string {
  return `${MYPAGE_IA_CATEGORY_HREF_PREFIX}${id}`;
}

const link = (
  href: string,
  titleKey: MessageKey,
  icon: MypageHomeMenuIconId,
  extra: Partial<MypageHomeLinkMenuItem> = {},
): MypageHomeLinkMenuItem => ({ href, titleKey, icon, ...extra });

export const MYPAGE_DEVICE_PERMISSIONS_HREF = "/mypage/section/settings/device-permissions";
export const MYPAGE_BULK_REGION_HREF = "/mypage/section/settings/region";
export const MYPAGE_CUSTOMER_CENTER_HREF = "/mypage/customer-center";

export const MYPAGE_IA_CATEGORIES: readonly MypageIaCategory[] = [
  {
    id: "trade",
    titleKey: "mypage_ia_cat_trade",
    descKey: "mypage_ia_cat_trade_desc",
    icon: "messages-square",
    groups: [
      {
        titleKey: "mypage_ia_grp_my_trades",
        rows: [
          link(MYPAGE_HOME_MY_PRODUCTS_HREF, "mypage_comp_menu_trade_active_title", "package", {
            valueSource: { kind: "summary-count", field: "salesActiveCount", format: "selling" },
          }),
          link(TRADE_CHAT_MESSENGER_LIST_HREF, "mypage_home_menu_trade_chat", "messages-square", {
            valueSource: { kind: "trade-chat-unread" },
          }),
          link(MYPAGE_HOME_TRADE_OFFERS_HREF, "mypage_home_menu_offers", "receipt-text", {
            valueSource: { kind: "summary-count", field: "offersReceivedPending", format: "pending" },
            hrefSource: "offers-tab",
          }),
        ],
      },
      {
        titleKey: "mypage_ia_grp_saved",
        rows: [
          link(MYPAGE_HOME_TRADE_FAVORITES_HREF, "mypage_comp_menu_trade_favorites_title", "heart", {
            valueSource: { kind: "summary-count", field: "favoritesCount", format: "count" },
          }),
          link(MYPAGE_HOME_RECENT_VIEWED_HREF, "mypage_hub_recent_viewed", "history"),
        ],
      },
      {
        titleKey: "mypage_ia_grp_manage",
        rows: [link(MYPAGE_BULK_REGION_HREF, "settings_bulk_region_change", "map-pin")],
      },
    ],
  },
  {
    id: "community",
    titleKey: "mypage_ia_cat_community",
    descKey: "mypage_ia_cat_community_desc",
    icon: "users",
    groups: [
      {
        titleKey: "mypage_ia_grp_my_activity",
        rows: [
          link(MYPAGE_HOME_COMMUNITY_POSTS_HREF, "mypage_comp_menu_community_posts_title", "book-open", {
            valueSource: { kind: "summary-count", field: "communityPostsCount", format: "count" },
          }),
          link(MYPAGE_HOME_COMMUNITY_ACTIVITY_HREF, "mypage_home_menu_community_activity", "message-circle"),
        ],
      },
      {
        titleKey: "mypage_ia_grp_collections",
        rows: [
          link("/mypage/section/community/liked-posts", "mypage_mnav_community_liked_posts", "heart"),
          link("/mypage/section/community/favorite-posts", "mypage_mnav_community_favorite_posts", "star"),
          link("/mypage/section/community/community-friends", "mypage_mnav_community_community_friends", "users"),
        ],
      },
    ],
  },
  {
    id: "store",
    titleKey: "mypage_ia_cat_store",
    descKey: "mypage_ia_cat_store_desc",
    icon: "shopping-bag",
    groups: [
      {
        titleKey: "mypage_ia_grp_orders",
        rows: [
          link(MYPAGE_HOME_STORE_ORDERS_HREF, "mypage_comp_menu_store_order_history_title", "shopping-bag", {
            valueSource: { kind: "summary-count", field: "storeOrdersActiveCount", format: "active" },
          }),
          link("/mypage/store-inquiries", "mypage_store_inquiries_title", "message-question"),
        ],
      },
      {
        titleKey: "mypage_ia_grp_store_delivery",
        rows: [
          { kind: "store-owner-entry" },
          link("/mypage/section/store/rider", "mypage_comp_menu_store_rider_title", "truck"),
        ],
      },
    ],
  },
  {
    id: "asset",
    titleKey: "mypage_ia_cat_asset",
    descKey: "mypage_ia_cat_asset_desc",
    icon: "wallet",
    groups: [
      {
        titleKey: "mypage_ia_grp_points",
        rows: [
          link("/mypage/points", "mypage_comp_stat_points", "coins", { valueSource: { kind: "summary-points" } }),
          link("/mypage/points/charge", "points_charge", "wallet"),
        ],
      },
      {
        titleKey: "mypage_ia_grp_benefits",
        rows: [
          link("/mypage/coupons", "store_coupon_wallet_title", "ticket", {
            valueSource: { kind: "summary-count", field: "couponsAvailableCount", format: "sheets" },
          }),
          link("/mypage/gift-certificates", "commerce_hub_tab_gifts", "gift", {
            valueSource: { kind: "summary-count", field: "giftCertificatesOwned", format: "sheets" },
          }),
          link("/mypage/ads", "mypage_comp_business_ads", "megaphone", {
            valueSource: { kind: "summary-count", field: "adsActiveCount", format: "active" },
            testId: "mypage-revenue-hub-entry",
          }),
          link("/mypage/benefits", "route_benefits_title", "badge-percent"),
        ],
      },
    ],
  },
  {
    id: "account",
    titleKey: "mypage_ia_cat_account",
    descKey: "mypage_ia_cat_account_desc",
    icon: "shield",
    showRequiredInfo: true,
    groups: [
      {
        titleKey: "mypage_ia_grp_account",
        rows: [
          link(MYPAGE_HOME_ACCOUNT_HREF, "mypage_settings_account", "user-round"),
          { kind: "addresses", titleKey: "mypage_comp_menu_account_address_title", icon: "address-pin" },
          link("/mypage/section/store/payment", "mypage_comp_menu_account_payment_title", "credit-card"),
        ],
      },
      {
        titleKey: "mypage_ia_grp_security_people",
        rows: [
          link(MYPAGE_DEVICE_PERMISSIONS_HREF, "mypage_ia_device_permissions", "shield"),
          link("/mypage/section/account/favorite-users", "settings_following_users", "users"),
          link("/mypage/section/account/blocked-users", "settings_blocked_users", "user-block"),
          link("/mypage/section/account/hidden-users", "settings_hidden_users", "eye-off"),
          link("/mypage/trust", "mypage_trust_title", "star"),
        ],
      },
    ],
  },
  {
    id: "settings",
    titleKey: "mypage_ia_cat_settings",
    descKey: "mypage_ia_cat_settings_desc",
    icon: "settings",
    groups: [
      {
        titleKey: "mypage_ia_grp_app",
        rows: [
          link("/mypage/section/settings/notifications", "mypage_comp_menu_account_notifications_title", "bell"),
          link("/mypage/section/settings/chat-settings", "settings_chat", "message-square"),
          { kind: "language-toggle", icon: "languages" },
          link("/mypage/section/settings/cache", "settings_cache_clear", "trash-2"),
          link("/mypage/section/settings/version", "settings_version", "info", {
            valueSource: { kind: "installed-version" },
          }),
        ],
      },
      {
        titleKey: "mypage_ia_grp_help_policy",
        rows: [
          { kind: "customer-center" },
          link("/mypage/section/settings/terms", "mypage_comp_menu_support_terms_title", "file-text"),
          link("/privacy", "mypage_comp_settings_privacy_link", "lock"),
          link("/business-info", "mypage_comp_menu_support_business_title", "building"),
        ],
      },
      {
        titleKey: null,
        rows: [
          { kind: "logout" },
          link(MYPAGE_HOME_ACCOUNT_LEAVE_HREF, "settings_leave", "hand", { tone: "danger" }),
          { kind: "admin" },
        ],
      },
    ],
  },
];

const CATEGORY_MAP = new Map(MYPAGE_IA_CATEGORIES.map((c) => [c.id, c]));

export function findMypageIaCategory(raw: string | null | undefined): MypageIaCategory | undefined {
  if (!raw) return undefined;
  return CATEGORY_MAP.get(raw as MypageIaCategoryId);
}

/** 비로그인 — 로그인 없이 바로 열리는 행 (분류 화면이 아니라 로그인 화면 아래 목록) */
export const MYPAGE_IA_GUEST_PUBLIC_ROWS: readonly MypageHomeLinkMenuItem[] = [
  link(MYPAGE_CUSTOMER_CENTER_HREF, "mypage_comp_menu_support_cs_title", "help-circle"),
  link("/mypage/section/settings/terms", "mypage_comp_menu_support_terms_title", "file-text"),
  link("/privacy", "mypage_comp_settings_privacy_link", "lock"),
  link("/business-info", "mypage_comp_menu_support_business_title", "building"),
  link("/mypage/section/settings/version", "settings_version", "info", { valueSource: { kind: "installed-version" } }),
];

/**
 * 비로그인이 그대로 볼 수 있는 내정보 경로 — 홈(로그인 화면) · 고객센터 · 약관·버전·언어.
 * 그 외 `/mypage/**` 는 비로그인 진입 시 `/mypage?next=` 로그인 화면으로 (S3).
 */
export function isMypageGuestPublicPath(pathname: string): boolean {
  const p = stripPath(pathname);
  if (p === "/mypage" || p === "/my") return true;
  if (p === MYPAGE_CUSTOMER_CENTER_HREF || p.startsWith(`${MYPAGE_CUSTOMER_CENTER_HREF}/`)) return true;
  if (p.startsWith("/mypage/notices/")) return true;
  const item = /^\/mypage\/section\/([^/]+)\/([^/]+)$/.exec(p);
  return item ? isMypageGuestPublicItem(item[1]!, item[2]!) : false;
}

/** 비로그인 회원 화면 진입 → 내정보 로그인 화면 + 로그인 후 원래 주소 */
export function buildMypageGuestLoginHref(pathWithSearch: string): string {
  return `/mypage?next=${encodeURIComponent(pathWithSearch)}`;
}

/** 비로그인에게 열어 주는 `/mypage/section/{s}/{i}` 항목 (정적 화면만) */
export function isMypageGuestPublicItem(section: string, item: string): boolean {
  return section === "settings" && (item === "terms" || item === "version" || item === "language");
}

// ─── 화면 단계 · 제목 · 뒤로 ───────────────────────────────────────────────

function stripPath(pathname: string): string {
  const p = (pathname.split(/[?#]/)[0] ?? "").replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

/** L0 홈 또는 L1 분류 화면 — 하단 탭을 보여 주는 내정보 경로 */
export function isMypageTopLevelPath(pathname: string): boolean {
  const p = stripPath(pathname);
  if (p === "/mypage" || p === "/my") return true;
  if (!p.startsWith(MYPAGE_IA_CATEGORY_HREF_PREFIX)) return false;
  const rest = p.slice(MYPAGE_IA_CATEGORY_HREF_PREFIX.length);
  return !rest.includes("/") && CATEGORY_MAP.has(rest as MypageIaCategoryId);
}

/** 내정보 L2 이하 — 하단 탭 숨김 대상 */
export function isMypageDeepPath(pathname: string): boolean {
  const p = stripPath(pathname);
  return p.startsWith("/mypage/") && !isMypageTopLevelPath(p);
}

type MypageIaRouteMeta = { titleKey: MessageKey | null; parentHref: string };

/** 분류 행에서 바로 들어가는 L2 화면 — 제목 = 행 이름, 뒤로 = 그 분류 */
const L2_ROUTE_META: Map<string, MypageIaRouteMeta> = (() => {
  const m = new Map<string, MypageIaRouteMeta>();
  for (const cat of MYPAGE_IA_CATEGORIES) {
    for (const g of cat.groups) {
      for (const row of g.rows) {
        if (!("href" in row) || !row.href.startsWith("/mypage")) continue;
        const path = stripPath(row.href);
        if (!m.has(path)) m.set(path, { titleKey: row.titleKey, parentHref: buildMypageIaCategoryHref(cat.id) });
      }
    }
  }
  m.set("/mypage/addresses", {
    titleKey: "mypage_comp_menu_account_address_title",
    parentHref: buildMypageIaCategoryHref("account"),
  });
  m.set(MYPAGE_CUSTOMER_CENTER_HREF, {
    titleKey: "mypage_comp_menu_support_cs_title",
    parentHref: buildMypageIaCategoryHref("settings"),
  });
  m.set("/mypage/required/dibay-id", { titleKey: null, parentHref: "/mypage" });
  m.set("/mypage/required/phone", { titleKey: null, parentHref: "/mypage" });
  return m;
})();

/** L3 — 제목은 화면 자체 제목 유지, 뒤로 = 부모 L2 (직접 진입 시) */
const L3_PARENTS: ReadonlyArray<[RegExp, string]> = [
  [/^\/mypage\/points\/(expiring|promotions)$/, "/mypage/points"],
  [/^\/mypage\/ads\/(apply|feed-request)$/, "/mypage/ads"],
  [/^\/mypage\/gift-certificates\/[^/]+$/, "/mypage/gift-certificates"],
  [/^\/mypage\/store-orders\/[^/]+$/, MYPAGE_HOME_STORE_ORDERS_HREF],
  [/^\/mypage\/store-orders\/([^/]+)\/review$/, MYPAGE_HOME_STORE_ORDERS_HREF],
  [/^\/mypage\/addresses\/(edit|search)$/, "/mypage/addresses"],
  [/^\/mypage\/customer-center\/(notice|system|marketing|update)(\/[^/]+)?$/, MYPAGE_CUSTOMER_CENTER_HREF],
  [/^\/mypage\/(support-history|inbox|inquiries|reports)(\/.+)?$/, MYPAGE_CUSTOMER_CENTER_HREF],
  [/^\/mypage\/app-updates$/, "/mypage/section/settings/version"],
  [/^\/mypage\/order-notifications$/, "/mypage/section/settings/notifications"],
];

/** 하위 화면 제목 — L2 는 분류 행 이름, 그 외 null(화면 자체 제목) */
export function resolveMypageIaTitleKey(pathname: string): MessageKey | null {
  return L2_ROUTE_META.get(stripPath(pathname))?.titleKey ?? null;
}

/** 뒤로 목적지(직접 진입·히스토리 없음) — 분류 화면은 홈, L2 는 분류, L3 는 부모. 모르면 null */
export function resolveMypageIaParentHref(pathname: string): string | null {
  const p = stripPath(pathname);
  if (isMypageTopLevelPath(p)) return p === "/mypage" || p === "/my" ? null : "/mypage";
  const l2 = L2_ROUTE_META.get(p);
  if (l2) return l2.parentHref;
  for (const [re, parent] of L3_PARENTS) {
    if (re.test(p)) return parent;
  }
  const sectionItem = /^\/mypage\/section\/([^/]+)\/[^/]+$/.exec(p);
  if (sectionItem) {
    const cat = findMypageIaCategory(sectionItem[1]);
    return cat ? buildMypageIaCategoryHref(cat.id) : "/mypage";
  }
  return null;
}
