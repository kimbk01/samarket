/**
 * Owner Admin navigation registry — SINGLE authority for:
 * - bottom primary tabs
 * - drawer / desktop sidebar sections (12그룹 IA · 문서 G §4-2)
 * - header title (`titleKey` — 라벨 = 제목 단일 키)
 * - active highlight (`activePrefixes` / `activeQuery`) · bottom tab (`bottomTab`)
 * - back parent (`parentId`)
 * - visibility (`access` — 1-B 게이트 `ownerNavAccessAllows`, `StoreBusinessGuard` 와 동일)
 * - customer hub entries · legacy my-business nav groups (derived)
 *
 * DO NOT duplicate nav arrays, titles, active rules or back parents in components.
 * URL 은 바꾸지 않는다 — `OwnerRoutes` 가 URL 단일 정의.
 *
 * STORE OS: Drawer is a COMPLETE management map. BottomNav is fast daily entry.
 * Do NOT omit BottomNav primaries from Drawer (multi-entry is intentional).
 */

import type { MessageKey } from "@/lib/i18n/messages";
import { OWNER_ROUTES_BASE, OwnerRoutes } from "@/lib/business/owner-routes";
import type { MyBusinessNavContext } from "@/lib/business/my-business-nav-types";
import type { BusinessAdminNavItemId } from "@/lib/business/business-admin-nav-ids";
import { OWNER_STORE_PREVIEW_HREF } from "@/lib/business/owner-store-preview-bridge";
import { ownerNavAccessAllows, type OwnerNavAccess } from "@/lib/business/owner-nav-access";

export type { OwnerNavAccess };

export type OwnerNavSurface = "bottom" | "drawer" | "customer_hub" | "manage_hub";

export type OwnerBottomNavTabId = "home" | "orders" | "products" | "customers" | "manage";

/** 12그룹 IA (문서 G §4-2) — 드로어·PC 사이드바 섹션 순서 */
export type OwnerNavGroupId =
  | "home"
  | "orders"
  | "products"
  | "store"
  | "delivery"
  | "settlement"
  | "coin_cash"
  | "ads"
  | "gift"
  | "customers"
  | "notifications"
  | "support";

/** `activePrefixes` 보다 구체적인 「경로 + 쿼리 값」 활성 규칙 (예: `/finance?section=transactions`). */
export type OwnerNavActiveQuery = {
  /** `/stores/owner` 기준 상대 경로 */
  path: string;
  key: string;
  values: readonly string[];
};

export type OwnerNavEntryDef = {
  id: BusinessAdminNavItemId;
  group: OwnerNavGroupId;
  /** 뒤로가기 부모 (null = 최상위) */
  parentId: BusinessAdminNavItemId | null;
  /** 헤더 제목 = 드로어 라벨 (단일 키) */
  titleKey: MessageKey;
  descriptionKey?: MessageKey;
  href: (storeId: string, slug?: string | null) => string;
  /**
   * `/stores/owner` 기준 상대 경로 접두(세그먼트 단위). `*` = 임의 1세그먼트.
   * `""` 는 허브 정확 일치만. 가장 긴 일치가 활성 항목.
   */
  activePrefixes: readonly string[];
  activeQuery?: OwnerNavActiveQuery;
  bottomTab: OwnerBottomNavTabId | null;
  access: OwnerNavAccess;
  /** When true, require approved + visible + slug for the public store preview. */
  requirePublicSlug?: boolean;
  surfaces: OwnerNavSurface[];
  badgeFrom?: "order_alerts";
};

function ownerAdsEventPromotionsHref(storeId: string): string {
  const sid = storeId.trim();
  const path = `${OWNER_ROUTES_BASE}/ads/event-promotions`;
  return sid ? `${path}?storeId=${encodeURIComponent(sid)}` : path;
}

export type OwnerBottomNavItemDef = {
  id: OwnerBottomNavTabId;
  labelKey: MessageKey;
  href: (storeId: string) => string;
};

/** Primary bottom nav — 홈 · 주문 · 상품 · 고객 · 관리 */
export const OWNER_BOTTOM_NAV_PRIMARY: readonly OwnerBottomNavItemDef[] = [
  {
    id: "home",
    labelKey: "store_owner_bottom_nav_home",
    href: (id) => OwnerRoutes.hub(id),
  },
  {
    id: "orders",
    labelKey: "store_owner_bottom_nav_orders",
    href: (id) => OwnerRoutes.orders(id),
  },
  {
    id: "products",
    labelKey: "store_owner_bottom_nav_products",
    href: (id) => OwnerRoutes.products(id),
  },
  {
    id: "customers",
    labelKey: "store_owner_bottom_nav_customers",
    href: (id) => OwnerRoutes.customerCare(id),
  },
  {
    id: "manage",
    labelKey: "store_owner_bottom_nav_manage",
    href: (id) => OwnerRoutes.settings(id),
  },
] as const;

/**
 * Left · Home(center) · Right layout for delivery-style orbit home.
 * LEFT: 주문 · 상품 · CENTER: 홈 · RIGHT: 고객 · 관리
 */
export const OWNER_BOTTOM_NAV_SIDE_LEFT_IDS: readonly OwnerBottomNavTabId[] = [
  "orders",
  "products",
] as const;

export const OWNER_BOTTOM_NAV_SIDE_RIGHT_IDS: readonly OwnerBottomNavTabId[] = [
  "customers",
  "manage",
] as const;

export function getOwnerBottomNavItemDef(id: OwnerBottomNavTabId): OwnerBottomNavItemDef {
  const found = OWNER_BOTTOM_NAV_PRIMARY.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown owner bottom nav tab: ${id}`);
  return found;
}


/**
 * 12그룹 레지스트리 — 문서 G §4-2 표가 이 데이터의 설계값이다. 순서 = 드로어 표시 순서.
 * 설계 id ↔ 기존 id: home=dashboard · orders=delivery_orders · menu_categories=categories ·
 * ops_status=delivery_ops · public_preview=public_store · delivery=store_settings · gift=gift_certificates ·
 * care=customer_care · notif_settings=notification_settings · cs_center=customer_center.
 */
export const OWNER_NAV_REGISTRY: readonly OwnerNavEntryDef[] = [
  // 01 홈
  {
    id: "dashboard",
    group: "home",
    parentId: null,
    titleKey: "biz_nav_dashboard",
    descriptionKey: "biz_nav_dashboard_desc",
    href: (storeId) => OwnerRoutes.hub(storeId),
    activePrefixes: [""],
    bottomTab: "home",
    access: "any",
    surfaces: ["drawer"],
  },
  // 02 주문 관리
  {
    id: "delivery_orders",
    group: "orders",
    parentId: "dashboard",
    titleKey: "biz_nav_delivery_orders",
    descriptionKey: "biz_nav_delivery_orders_desc",
    href: (storeId) => OwnerRoutes.orders(storeId),
    activePrefixes: ["/orders", "/store-orders"],
    bottomTab: "orders",
    access: "suspendedAllowed",
    surfaces: ["drawer"],
    badgeFrom: "order_alerts",
  },
  {
    id: "order_chats",
    group: "orders",
    parentId: "delivery_orders",
    titleKey: "biz_care_order_chat",
    descriptionKey: "biz_care_order_chat_desc",
    href: (storeId) => OwnerRoutes.orderChats(storeId),
    activePrefixes: ["/order-chats", "/order-chat", "/store-order-chat"],
    bottomTab: "orders",
    access: "suspendedAllowed",
    surfaces: ["drawer", "customer_hub"],
  },
  // 03 상품 관리
  {
    id: "products",
    group: "products",
    parentId: "dashboard",
    titleKey: "biz_nav_products",
    descriptionKey: "biz_nav_products_desc",
    href: (storeId) => OwnerRoutes.products(storeId),
    activePrefixes: ["/products", "/menu"],
    bottomTab: "products",
    access: "approved",
    surfaces: ["drawer"],
  },
  {
    id: "product_new",
    group: "products",
    parentId: "products",
    titleKey: "biz_nav_product_new",
    descriptionKey: "biz_nav_product_new_desc",
    href: (storeId) => OwnerRoutes.productNew(storeId),
    activePrefixes: ["/products/new"],
    bottomTab: "products",
    access: "approved",
    surfaces: ["drawer"],
  },
  {
    id: "product_edit",
    group: "products",
    parentId: "products",
    titleKey: "biz_title_product_edit",
    /** 상품 id 가 필요한 화면 — 링크 대상 아님(제목·활성·뒤로가기 전용) */
    href: (storeId) => OwnerRoutes.products(storeId),
    activePrefixes: ["/products/*/edit"],
    bottomTab: "products",
    access: "approved",
    surfaces: [],
  },
  {
    id: "categories",
    group: "products",
    parentId: "products",
    titleKey: "biz_title_menu_categories",
    href: (storeId) => OwnerRoutes.menuCategories(storeId),
    activePrefixes: ["/menu-categories"],
    bottomTab: "products",
    access: "approved",
    surfaces: ["drawer"],
  },
  // 04 매장 운영
  {
    id: "store_manage",
    group: "store",
    parentId: "dashboard",
    titleKey: "owner_s4_title_store_manage",
    href: (storeId) => OwnerRoutes.settings(storeId),
    activePrefixes: ["/settings"],
    bottomTab: "manage",
    access: "approved",
    surfaces: [],
  },
  {
    id: "delivery_ops",
    group: "store",
    parentId: "store_manage",
    titleKey: "owner_s4_title_ops_status",
    descriptionKey: "biz_nav_ops_status_desc",
    href: (storeId) => OwnerRoutes.opsStatus(storeId),
    activePrefixes: ["/ops-status"],
    bottomTab: "manage",
    access: "preApproval",
    surfaces: ["drawer", "manage_hub"],
  },
  {
    id: "basic_info",
    group: "store",
    parentId: "store_manage",
    titleKey: "biz_nav_basic_info",
    descriptionKey: "biz_nav_basic_info_desc",
    href: (storeId) => OwnerRoutes.basicInfo(storeId),
    activePrefixes: ["/basic-info"],
    bottomTab: "manage",
    access: "preApproval",
    surfaces: ["drawer", "manage_hub"],
  },
  {
    id: "public_store",
    group: "store",
    parentId: "store_manage",
    titleKey: "owner_s4_title_public_preview",
    descriptionKey: "biz_nav_public_store_desc",
    href: () => OWNER_STORE_PREVIEW_HREF,
    activePrefixes: [],
    bottomTab: null,
    access: "approved",
    requirePublicSlug: true,
    surfaces: ["drawer"],
  },
  // 05 배달 관리
  {
    id: "store_settings",
    group: "delivery",
    parentId: "store_manage",
    titleKey: "owner_s4_title_delivery",
    descriptionKey: "biz_nav_store_settings_desc",
    href: (storeId) => OwnerRoutes.profile(storeId),
    activePrefixes: ["/profile", "/edit"],
    bottomTab: "manage",
    access: "preApproval",
    surfaces: ["drawer", "manage_hub"],
  },
  // 06 매출·정산 (D-13 「수수료·캐시 원장」)
  {
    id: "settlements",
    group: "settlement",
    parentId: "dashboard",
    titleKey: "owner_s4_title_settlements",
    descriptionKey: "owner_s4_desc_settlements",
    href: (storeId) => OwnerRoutes.settlements(storeId),
    activePrefixes: ["/settlements"],
    activeQuery: { path: "/finance", key: "section", values: ["outstanding", "transactions"] },
    bottomTab: "manage",
    access: "suspendedAllowed",
    surfaces: ["drawer", "manage_hub"],
  },
  // 07 코인·캐시
  {
    id: "finance",
    group: "coin_cash",
    parentId: "dashboard",
    titleKey: "biz_nav_finance",
    descriptionKey: "biz_nav_finance_desc",
    href: (storeId) => OwnerRoutes.finance(storeId),
    activePrefixes: ["/finance", "/business-cash", "/points"],
    activeQuery: {
      path: "/finance",
      key: "section",
      values: ["coin", "cash", "convert", "withdraw", "ads"],
    },
    bottomTab: "manage",
    access: "approved",
    surfaces: ["drawer", "manage_hub"],
  },
  // 08 광고·홍보
  {
    id: "ads",
    group: "ads",
    parentId: "dashboard",
    titleKey: "biz_nav_ads",
    descriptionKey: "biz_nav_ads_desc",
    href: (storeId) => OwnerRoutes.ads(storeId),
    activePrefixes: ["/ads"],
    bottomTab: "manage",
    access: "approved",
    surfaces: ["drawer", "manage_hub"],
  },
  {
    id: "ads_event",
    group: "ads",
    parentId: "ads",
    titleKey: "owner_s4_title_ads_event",
    href: (storeId) => ownerAdsEventPromotionsHref(storeId),
    activePrefixes: ["/ads/event-promotions"],
    bottomTab: "manage",
    access: "approved",
    surfaces: [],
  },
  {
    id: "coupons",
    group: "ads",
    parentId: "ads",
    titleKey: "biz_nav_coupons",
    descriptionKey: "biz_nav_coupons_desc",
    href: (storeId) => OwnerRoutes.coupons(storeId),
    activePrefixes: ["/coupons"],
    bottomTab: "manage",
    access: "approved",
    surfaces: ["drawer", "manage_hub"],
  },
  {
    id: "banners",
    group: "ads",
    parentId: "ads",
    titleKey: "biz_nav_banners",
    descriptionKey: "biz_nav_banners_desc",
    href: (storeId) => OwnerRoutes.banners(storeId),
    activePrefixes: ["/banners"],
    bottomTab: "manage",
    access: "approved",
    surfaces: ["drawer", "manage_hub"],
  },
  {
    id: "notices",
    group: "ads",
    parentId: "ads",
    titleKey: "biz_nav_notices",
    descriptionKey: "biz_nav_notices_desc",
    href: (storeId) => OwnerRoutes.notices(storeId),
    activePrefixes: ["/notices"],
    bottomTab: "manage",
    access: "approved",
    surfaces: ["drawer", "manage_hub"],
  },
  // 09 상품권
  {
    id: "gift_certificates",
    group: "gift",
    parentId: "dashboard",
    titleKey: "biz_nav_gift_certificates",
    descriptionKey: "biz_nav_gift_certificates_desc",
    href: (storeId) => OwnerRoutes.giftCertificates(storeId),
    activePrefixes: ["/gift-certificates"],
    bottomTab: "manage",
    access: "approved",
    surfaces: ["drawer", "manage_hub"],
  },
  // 10 고객 관리
  {
    id: "customer_care",
    group: "customers",
    parentId: "dashboard",
    titleKey: "biz_nav_customer_care",
    descriptionKey: "biz_nav_customer_care_desc",
    href: (storeId) => OwnerRoutes.customerCare(storeId),
    activePrefixes: ["/customer-care"],
    bottomTab: "customers",
    access: "approved",
    surfaces: ["drawer", "customer_hub"],
  },
  {
    id: "inquiries",
    group: "customers",
    parentId: "customer_care",
    titleKey: "biz_nav_store_inquiries",
    descriptionKey: "biz_nav_inquiries_desc",
    href: (storeId) => OwnerRoutes.inquiries(storeId),
    activePrefixes: ["/inquiries"],
    bottomTab: "customers",
    access: "approved",
    surfaces: ["drawer", "customer_hub"],
  },
  {
    id: "reviews",
    group: "customers",
    parentId: "customer_care",
    titleKey: "my_biz_reviews",
    href: (storeId) => OwnerRoutes.reviews(storeId),
    activePrefixes: ["/reviews"],
    bottomTab: "customers",
    access: "approved",
    surfaces: ["drawer", "customer_hub"],
  },
  // 11 알림
  {
    id: "notifications",
    group: "notifications",
    parentId: "dashboard",
    titleKey: "biz_nav_notifications",
    descriptionKey: "biz_nav_notifications_desc",
    href: (storeId) => OwnerRoutes.notifications(storeId),
    activePrefixes: ["/notifications"],
    bottomTab: "manage",
    access: "any",
    surfaces: ["drawer", "manage_hub"],
  },
  {
    id: "notification_settings",
    group: "notifications",
    parentId: "notifications",
    titleKey: "owner_s4_title_notif_settings",
    descriptionKey: "biz_nav_notification_settings_desc",
    href: (storeId) => OwnerRoutes.notificationSettings(storeId),
    activePrefixes: ["/notification-settings"],
    bottomTab: "manage",
    access: "any",
    surfaces: ["drawer", "manage_hub"],
  },
  // 12 설정·지원
  {
    id: "customer_center",
    group: "support",
    parentId: "dashboard",
    titleKey: "owner_s4_title_cs_center",
    descriptionKey: "biz_care_customer_center_desc",
    href: (storeId) => {
      const base = OwnerRoutes.customerCareCenter(storeId);
      return `${base}${base.includes("?") ? "&" : "?"}from=owner-care`;
    },
    activePrefixes: [
      "/customer-care/customer-center",
      "/customer-care/messages",
      "/customer-care/inquiries",
    ],
    bottomTab: "manage",
    access: "any",
    surfaces: ["drawer", "customer_hub"],
  },
  {
    id: "apply",
    group: "support",
    parentId: "dashboard",
    titleKey: "owner_s4_title_apply",
    href: () => OwnerRoutes.apply(),
    activePrefixes: ["/apply"],
    bottomTab: null,
    access: "any",
    surfaces: [],
  },
  {
    id: "my",
    group: "support",
    parentId: null,
    titleKey: "store_owner_my_home_link",
    href: () => "/my",
    activePrefixes: [],
    bottomTab: null,
    access: "any",
    surfaces: [],
  },
] as const;

/** 12그룹 섹션 메타 — 드로어·PC 사이드바 순서 */
export const OWNER_NAV_GROUPS: readonly { id: OwnerNavGroupId; titleKey: MessageKey }[] = [
  { id: "home", titleKey: "owner_s4_group_home" },
  { id: "orders", titleKey: "owner_s4_group_orders" },
  { id: "products", titleKey: "owner_s4_group_products" },
  { id: "store", titleKey: "owner_s4_group_store" },
  { id: "delivery", titleKey: "owner_s4_group_delivery" },
  { id: "settlement", titleKey: "owner_s4_group_settlement" },
  { id: "coin_cash", titleKey: "owner_s4_group_coin_cash" },
  { id: "ads", titleKey: "owner_s4_group_ads" },
  { id: "gift", titleKey: "owner_s4_group_gift" },
  { id: "customers", titleKey: "owner_s4_group_customers" },
  { id: "notifications", titleKey: "owner_s4_group_notifications" },
  { id: "support", titleKey: "owner_s4_group_support" },
] as const;

export function getOwnerNavEntry(id: BusinessAdminNavItemId): OwnerNavEntryDef | undefined {
  return OWNER_NAV_REGISTRY.find((e) => e.id === id);
}

/* ------------------------------------------------------------------ */
/* 경로 → 항목 매칭 (활성·제목·하단탭·뒤로가기·화면 허용 공통)            */
/* ------------------------------------------------------------------ */

export type OwnerNavSearchInput =
  | string
  | URLSearchParams
  | { get(name: string): string | null }
  | null
  | undefined;

function readSearchParam(search: OwnerNavSearchInput, key: string): string | null {
  if (search == null) return null;
  if (typeof search === "string") {
    return new URLSearchParams(search.replace(/^\?/, "")).get(key);
  }
  return search.get(key);
}

/**
 * 오너 경로를 `/stores/owner` 기준 상대 경로로 정규화 (`""` = 허브).
 * 레거시 `/my/business/*`·`/mypage/business/*`·`/stores/[slug]/owner/*` 는 같은 캐노니컬로 접는다.
 * 오너 경로가 아니면 null.
 */
export function toOwnerNavRelativePath(pathname: string): string | null {
  let p = (pathname.split("?")[0] ?? "").split("#")[0] ?? "";
  p = p.replace(/\/+$/, "") || "/";
  for (const legacy of ["/mypage/business", "/my/business"]) {
    if (p === legacy || p.startsWith(`${legacy}/`)) {
      p = `${OWNER_ROUTES_BASE}${p.slice(legacy.length)}`;
      break;
    }
  }
  const slugOwner = /^\/stores\/([^/]+)\/owner(\/.*)?$/.exec(p);
  if (slugOwner && slugOwner[1] !== "owner") {
    p = `${OWNER_ROUTES_BASE}${slugOwner[2] ?? ""}`;
  }
  if (p === OWNER_ROUTES_BASE) return "";
  if (!p.startsWith(`${OWNER_ROUTES_BASE}/`)) return null;
  return p.slice(OWNER_ROUTES_BASE.length);
}

function pathSegments(rel: string): string[] {
  return rel.split("/").filter(Boolean);
}

/** 세그먼트 단위 접두 일치 — 점수 높을수록 구체적. 일치 없음 = null. */
function matchOwnerNavPrefix(
  rel: string,
  prefix: string
): { score: number; exact: boolean } | null {
  if (prefix === "") return rel === "" ? { score: 0, exact: true } : null;
  const ps = pathSegments(prefix);
  const rs = pathSegments(rel);
  if (rs.length < ps.length) return null;
  let wildcards = 0;
  for (let i = 0; i < ps.length; i += 1) {
    if (ps[i] === "*") {
      wildcards += 1;
      continue;
    }
    if (ps[i] !== rs[i]) return null;
  }
  return { score: ps.length * 4 - wildcards, exact: rs.length === ps.length };
}

export type OwnerNavMatch = {
  entry: OwnerNavEntryDef;
  /** true = 항목 자신의 화면(뒤로가기 = 부모), false = 항목 아래 하위 화면(뒤로가기 = 항목) */
  own: boolean;
};

/** 규칙 (1) — 가장 긴 `activePrefixes`(또는 `activeQuery`) 일치 항목. */
export function resolveOwnerNavMatch(
  pathname: string,
  search?: OwnerNavSearchInput
): OwnerNavMatch | null {
  const rel = toOwnerNavRelativePath(pathname);
  if (rel == null) return null;
  const effectiveSearch: OwnerNavSearchInput =
    search ?? (pathname.includes("?") ? (pathname.split("?")[1] ?? "") : null);

  let best: { entry: OwnerNavEntryDef; score: number; own: boolean } | null = null;
  for (const entry of OWNER_NAV_REGISTRY) {
    for (const prefix of entry.activePrefixes) {
      const m = matchOwnerNavPrefix(rel, prefix);
      if (m && (!best || m.score > best.score)) {
        best = { entry, score: m.score, own: m.exact };
      }
    }
    const q = entry.activeQuery;
    if (q) {
      const m = matchOwnerNavPrefix(rel, q.path);
      const v = readSearchParam(effectiveSearch, q.key)?.trim() ?? "";
      if (m?.exact && v && q.values.includes(v)) {
        const score = m.score + 2;
        if (!best || score > best.score) best = { entry, score, own: true };
      }
    }
  }
  return best ? { entry: best.entry, own: best.own } : null;
}

/**
 * 드로어 활성 하이라이트 — 일치 항목 + 조상 전부.
 * 최상위 허브(`dashboard`)는 모든 화면의 부모라 조상 전파에서 제외(허브 자신일 때만 활성).
 */
export function resolveOwnerNavActiveIds(
  pathname: string,
  search?: OwnerNavSearchInput
): Set<BusinessAdminNavItemId> {
  const out = new Set<BusinessAdminNavItemId>();
  const match = resolveOwnerNavMatch(pathname, search);
  if (!match) return out;
  out.add(match.entry.id);
  let parentId = match.entry.parentId;
  while (parentId && parentId !== "dashboard" && !out.has(parentId)) {
    out.add(parentId);
    parentId = getOwnerNavEntry(parentId)?.parentId ?? null;
  }
  return out;
}

/** 규칙 (4) — 하단탭 활성 = 일치 항목의 `bottomTab`. */
export function resolveOwnerNavBottomTab(
  pathname: string,
  search?: OwnerNavSearchInput
): OwnerBottomNavTabId | null {
  return resolveOwnerNavMatch(pathname, search)?.entry.bottomTab ?? null;
}

/** 규칙 (5) — 제목 = 일치 항목 `titleKey`. 미등록 경로 null. */
export function resolveOwnerNavTitleKey(
  pathname: string,
  search?: OwnerNavSearchInput
): MessageKey | null {
  return resolveOwnerNavMatch(pathname, search)?.entry.titleKey ?? null;
}

/**
 * 규칙 (2) — 뒤로가기 대상 항목. 항목 자신의 화면이면 `parentId`, 항목 아래 하위 화면이면 그 항목.
 * 허브·부모 없음 = null (호출부는 허브로 폴백).
 */
export function resolveOwnerNavBackTarget(
  pathname: string,
  search?: OwnerNavSearchInput
): OwnerNavEntryDef | null {
  const match = resolveOwnerNavMatch(pathname, search);
  if (!match) return null;
  if (!match.own) return match.entry;
  const parentId = match.entry.parentId;
  return parentId ? (getOwnerNavEntry(parentId) ?? null) : null;
}

/**
 * 규칙 (3)·IA-21 — 선택 매장 승인 상태로 이 경로에 들어갈 수 있는지.
 * `StoreBusinessGuard` 와 드로어 노출이 같은 `ownerNavAccessAllows` 를 쓴다.
 * 레지스트리 미등록 오너 경로는 승인 매장만.
 */
export function isOwnerPathAllowedForApprovalStatus(
  pathname: string,
  approvalStatus: string | null | undefined,
  search?: OwnerNavSearchInput
): boolean {
  const match = resolveOwnerNavMatch(pathname, search);
  return ownerNavAccessAllows(match?.entry.access ?? "approved", approvalStatus);
}

/** 드로어 노출 — `access` 를 1-B 게이트로 평가 (보이면 들어갈 수 있다). */
export function ownerNavEntryVisible(entry: OwnerNavEntryDef, ctx: MyBusinessNavContext): boolean {
  if (!ownerNavAccessAllows(entry.access, ctx.approvalStatus)) return false;
  if (entry.requirePublicSlug) {
    if (!(ctx.approvalStatus === "approved" && ctx.isVisible && ctx.slug)) return false;
  }
  return true;
}

export type OwnerDrawerSectionItem = {
  id: BusinessAdminNavItemId;
  labelKey: MessageKey;
  href: string;
  descriptionKey?: MessageKey;
  badge?: number;
  disabled?: boolean;
};

export type OwnerDrawerSection = {
  groupId: OwnerNavGroupId;
  titleKey: MessageKey;
  items: OwnerDrawerSectionItem[];
};

/** Derive drawer/sidebar sections (12그룹) from the registry (ONE authority). */
export function buildOwnerDrawerSectionsFromRegistry(ctx: MyBusinessNavContext): OwnerDrawerSection[] {
  const sections: OwnerDrawerSection[] = [];
  for (const group of OWNER_NAV_GROUPS) {
    const items = OWNER_NAV_REGISTRY.filter(
      (e) => e.surfaces.includes("drawer") && e.group === group.id && ownerNavEntryVisible(e, ctx)
    ).map((e) => {
      const item: OwnerDrawerSectionItem = {
        id: e.id,
        labelKey: e.titleKey,
        href: e.href(ctx.storeId, ctx.slug),
        descriptionKey: e.descriptionKey,
      };
      if (e.badgeFrom === "order_alerts" && ctx.orderAlertsBadge > 0) {
        item.badge = ctx.orderAlertsBadge;
      }
      return item;
    });
    if (items.length > 0) {
      sections.push({ groupId: group.id, titleKey: group.titleKey, items });
    }
  }
  return sections;
}

/** Manage tab hub — registry-driven sections (manage_hub surface only). */
export function buildOwnerManageHubSectionsFromRegistry(
  ctx: MyBusinessNavContext
): OwnerDrawerSection[] {
  return buildOwnerDrawerSectionsFromRegistry(ctx)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        getOwnerNavEntry(item.id)?.surfaces.includes("manage_hub")
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export type OwnerCustomerHubEntryId =
  | "order-chat"
  | "store-inquiry"
  | "reviews"
  | "customer-center";

/** Customer hub — STORE↔CUSTOMER vs OWNER↔DIBAY stay separate entries. */
export function listOwnerCustomerHubEntries(storeId: string | null | undefined): {
  id: OwnerCustomerHubEntryId;
  href: string;
  titleKey: MessageKey;
  descKey: MessageKey;
  audience: "store_customer" | "dibay_support";
}[] {
  const sid = (storeId ?? "").trim() || null;
  return [
    {
      id: "order-chat",
      href: OwnerRoutes.orderChats(sid),
      titleKey: "biz_care_order_chat",
      descKey: "biz_care_order_chat_desc",
      audience: "store_customer",
    },
    {
      id: "store-inquiry",
      href: OwnerRoutes.inquiries(sid),
      titleKey: "biz_care_store_inquiry",
      descKey: "biz_care_store_inquiry_desc",
      audience: "store_customer",
    },
    {
      id: "reviews",
      href: OwnerRoutes.reviews(sid),
      titleKey: "my_biz_reviews",
      descKey: "biz_care_reviews_desc",
      audience: "store_customer",
    },
    {
      id: "customer-center",
      href: (() => {
        const base = OwnerRoutes.customerCareCenter(sid);
        return `${base}${base.includes("?") ? "&" : "?"}from=owner-care`;
      })(),
      titleKey: "biz_care_customer_center",
      descKey: "biz_care_customer_center_desc",
      audience: "dibay_support",
    },
  ];
}
