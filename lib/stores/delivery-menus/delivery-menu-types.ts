/**
 * CONTRACT — 배달 고객 화면 「메뉴」 (배민 미러링, 업종과 분리).
 * - 업종(store_categories·store_topics) = 매장 신청 분류·수수료 기준. 메뉴 = 어드민이 만드는 고객 화면.
 * - 1단(parentId null) = 홈 상단 탭 (음식배달·픽업·장보기·쇼핑·선물하기·혜택모아보기).
 *   메뉴 페이지 `/stores/browse/{1단 slug}` — 3단 탭 = 2단 메뉴 (`?menu={2단 slug}`), 「홈」 탭 = 1단 전체 매장.
 * - 2단 = 홈 아이콘·페이지 탭. 매장 목록(매장 하나씩 지정, 업종 무관·중복 가능) 또는 화면 연결(`linkTarget`).
 * - 노출 매장은 항상 메뉴 1개 이상 (DB 트리거 + 승인 거부 + 업종 기본 메뉴 표시 폴백).
 * 설계: docs/audit/delivery-baemin-mirror-design-v6-2026-10-30.html
 */

/** 아이콘·대표 카드 「누르면」 — 고정 목록 (주소 직접 입력 없음) */
export const DELIVERY_MENU_LINK_TARGETS = [
  "gift_mall",
  "gift_platform",
  "gift_store",
  "gift_owned",
  "gift_received",
  "gift_sent",
  "coupons",
  "points",
  "events",
  "member_benefits",
] as const;

export type DeliveryMenuLinkTarget = (typeof DELIVERY_MENU_LINK_TARGETS)[number];

export function isDeliveryMenuLinkTarget(v: unknown): v is DeliveryMenuLinkTarget {
  return typeof v === "string" && (DELIVERY_MENU_LINK_TARGETS as readonly string[]).includes(v);
}

/** 연결 화면 내부 URL — 기존 화면만 (`commerce-hub-nav`·마이페이지·이벤트) */
export function deliveryMenuLinkHref(target: DeliveryMenuLinkTarget): string {
  switch (target) {
    case "gift_mall":
      return "/stores/gift-mall";
    case "gift_platform":
      return "/stores/gift-mall?scope=platform";
    case "gift_store":
      return "/stores/gift-mall?scope=store";
    case "gift_owned":
      return "/orders/activity?tab=gifts&giftTab=owned";
    case "gift_received":
      return "/orders/activity?tab=gifts&giftTab=received";
    case "gift_sent":
      return "/orders/activity?tab=gifts&giftTab=sent";
    case "coupons":
      return "/orders/activity?tab=coupons";
    case "points":
      return "/mypage/points";
    case "events":
      return "/events";
    case "member_benefits":
      return "/mypage/benefits";
  }
}

export const DELIVERY_MENU_LINK_TARGET_LABEL_KO: Record<DeliveryMenuLinkTarget, string> = {
  gift_mall: "상품권몰",
  gift_platform: "상품권몰 · DIBAY 상품권",
  gift_store: "상품권몰 · 매장 상품권",
  gift_owned: "선물함",
  gift_received: "받은 선물",
  gift_sent: "보낸 선물",
  coupons: "쿠폰함",
  points: "포인트",
  events: "이벤트",
  member_benefits: "회원 혜택",
};

export type DeliveryMenuFeatureCard = {
  title: string;
  imageUrl: string | null;
  /** `#RRGGBB` — 없으면 DIBAY 금색 */
  bg: string | null;
  linkTarget: DeliveryMenuLinkTarget | null;
};

export type DeliveryMenuShortcut = {
  storeId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  caption: string | null;
};

/** GET /api/stores/taxonomy `deliveryMenus` 항목 — 활성·기간 안 · 보이는 메뉴만 */
export type DeliveryMenuPublic = {
  id: string;
  slug: string;
  /** 1단(상단 탭)이면 null */
  parentId: string | null;
  nameKo: string;
  nameEn: string | null;
  iconUrl: string | null;
  /** 페이지 탭 순서 (1단: 상단 탭 순서) */
  sortOrder: number;
  /** 2단: 홈 아이콘 판에 표시 */
  showOnHome: boolean;
  homeSortOrder: number;
  /** 2단: 메뉴 페이지 탭에 표시 */
  showInPageTab: boolean;
  /** 2단: 화면 연결 (null = 매장 목록) */
  linkTarget: DeliveryMenuLinkTarget | null;
  /** 1단: 픽업 가능 매장만 */
  pickupOnly: boolean;
  /** 1단: 상단 탭 위 작은 빨간 글씨 */
  badgeText: string | null;
  /** 1단: 대표 카드 */
  feature: DeliveryMenuFeatureCard | null;
  /** 2단 매장 목록 메뉴: 고객에게 보이는 매장 수 (픽업 탭은 픽업 가능 매장만) */
  storeCount: number;
  /** 1단: 매장 바로가기 줄 */
  shortcuts: DeliveryMenuShortcut[];
};

/** 어드민 편집용 — 숨김·기간 밖 포함 */
export type DeliveryMenuAdminRow = {
  id: string;
  slug: string;
  parent_id: string | null;
  name_ko: string;
  name_en: string | null;
  icon_url: string | null;
  sort_order: number;
  is_active: boolean;
  show_on_home: boolean;
  home_sort_order: number;
  show_in_page_tab: boolean;
  link_target: DeliveryMenuLinkTarget | null;
  pickup_only: boolean;
  badge_text: string | null;
  show_feature: boolean;
  feature_title: string | null;
  feature_image_url: string | null;
  feature_bg: string | null;
  feature_link_target: DeliveryMenuLinkTarget | null;
  start_at: string | null;
  end_at: string | null;
  /** 2단: 지정 매장 (순서대로) */
  store_ids: string[];
};

export type DeliveryMenuAdminShortcut = {
  root_menu_id: string;
  store_id: string;
  sort_order: number;
  caption: string | null;
};

export type DeliveryMenuAdminDefault = {
  category_id: string;
  topic_id: string | null;
  menu_id: string;
};

/** 목록 API 매장 필터 — 지정 매장만 */
export type DeliveryMenuStoreFilter = {
  menuId: string;
  /** 비어 있음 = 업종 연결 없음 (지정 매장만) */
  topicIds: ReadonlySet<string> | null;
  includeStoreIds: ReadonlySet<string>;
  excludeStoreIds: ReadonlySet<string>;
};

export const DELIVERY_MENU_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function isDeliveryMenuSlug(value: string): boolean {
  return DELIVERY_MENU_SLUG_RE.test(value);
}

/** 매장 행이 메뉴에 속하는지 — 제외 > 추가 > 연결 업종 */
export function deliveryMenuIncludesStore(
  filter: DeliveryMenuStoreFilter,
  row: { id: string; store_topic_id?: string | null }
): boolean {
  if (filter.excludeStoreIds.has(row.id)) return false;
  if (filter.includeStoreIds.has(row.id)) return true;
  if (filter.topicIds == null) return true;
  const topicId = row.store_topic_id ? String(row.store_topic_id) : "";
  return topicId !== "" && filter.topicIds.has(topicId);
}

/** 응답 캐시 키 조각 — 메뉴 구성이 바뀌면 키가 바뀐다 */
export function deliveryMenuStoreFilterCacheToken(filter: DeliveryMenuStoreFilter | null | undefined): string {
  if (!filter) return "none";
  const topics = filter.topicIds ? [...filter.topicIds].sort().join(".") : "all";
  const inc = [...filter.includeStoreIds].sort().join(".");
  const exc = [...filter.excludeStoreIds].sort().join(".");
  return `${filter.menuId}:${topics}:${inc}:${exc}`;
}
