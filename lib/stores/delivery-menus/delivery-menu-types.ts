/**
 * CONTRACT — 배달 고객 화면 「메뉴」 (업종과 분리).
 * - 업종(store_categories·store_topics) = 내부 구분·수수료 기준. 메뉴 = 어드민이 만드는 화면 구성.
 * - 1단 메뉴 = 1차 업종 1개의 페이지(`/stores/browse/{primarySlug}`), 2단 메뉴 = 그 페이지의 탭(`?menu={slug}`).
 * - 2단 매장 = 연결 2차 업종 매장 ∪ 개별 추가 − 개별 제외 (모두 부모 1단의 1차 업종 안).
 * - 메뉴가 없거나 조회 실패면 고객 화면은 기존 업종(1·2차) 그대로 (복구 스위치).
 * 설계: docs/audit/delivery-baemin-master-plan-2026-10-29.md WP1~WP3
 */

/** GET /api/stores/taxonomy `deliveryMenus` 항목 — 활성·기간 안의 메뉴만 */
export type DeliveryMenuPublic = {
  id: string;
  slug: string;
  /** 1단이면 null */
  parentId: string | null;
  /** 1단: 연결 1차 업종 slug. 2단: 부모 1단의 1차 업종 slug */
  primarySlug: string;
  nameKo: string;
  nameEn: string | null;
  iconUrl: string | null;
  sortOrder: number;
  showOnHome: boolean;
  homeSortOrder: number;
  /** 2단: 연결 2차 업종 slug (1단은 빈 배열) */
  topicSlugs: string[];
  /** 2단: 개별 추가·제외가 있음 → 목록은 `menu` 필터 경로 */
  hasStoreOverrides: boolean;
};

/** 어드민 편집용 — 숨김·기간 밖 포함 */
export type DeliveryMenuAdminRow = {
  id: string;
  slug: string;
  parent_id: string | null;
  primary_category_id: string | null;
  name_ko: string;
  name_en: string | null;
  icon_url: string | null;
  sort_order: number;
  is_active: boolean;
  show_on_home: boolean;
  home_sort_order: number;
  start_at: string | null;
  end_at: string | null;
  topic_ids: string[];
  include_store_ids: string[];
  exclude_store_ids: string[];
};

/** 목록 API 매장 필터 — `resolveBrowseFilteredStoreRows` 에서 업종 필터 뒤에 적용 */
export type DeliveryMenuStoreFilter = {
  menuId: string;
  /** null = 1차 업종 전체(연결 업종 없음) */
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
