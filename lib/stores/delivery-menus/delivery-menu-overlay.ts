/**
 * CONTRACT — 고객 「메뉴」를 업종 스냅샷에 입히는 단일 지점 (HOME·BROWSE 공통).
 * - 메뉴가 없으면 입력 그대로 반환 → 고객 화면은 기존 업종 (복구 스위치).
 * - 메뉴가 있으면: 1단 메뉴가 있는 1차 업종만 고객에게 보이고, 이름·아이콘·순서는 1단 메뉴 값.
 * - 업종 id·slug 는 바꾸지 않는다 (목록 API·광고·정책·수수료 키 그대로).
 */
import type { DeliveryMenuPublic } from "@/lib/stores/delivery-menus/delivery-menu-types";
import type { StoreTaxonomyCategory } from "@/lib/stores/store-taxonomy-types";

export type DeliveryMenuCarrier = { menus?: DeliveryMenuPublic[] };

function readString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** GET /api/stores/taxonomy `deliveryMenus` → 검증된 배열 (형식 불량 항목은 버림) */
export function readDeliveryMenusFromTaxonomyJson(json: unknown): DeliveryMenuPublic[] {
  const raw = (json as { deliveryMenus?: unknown } | null)?.deliveryMenus;
  if (!Array.isArray(raw)) return [];
  const out: DeliveryMenuPublic[] = [];
  for (const item of raw) {
    const m = item as Record<string, unknown>;
    const id = readString(m.id);
    const slug = readString(m.slug).toLowerCase();
    const primarySlug = readString(m.primarySlug).toLowerCase();
    const nameKo = readString(m.nameKo);
    if (!id || !slug || !primarySlug || !nameKo) continue;
    out.push({
      id,
      slug,
      parentId: readString(m.parentId) || null,
      primarySlug,
      nameKo,
      nameEn: readString(m.nameEn) || null,
      iconUrl: readString(m.iconUrl) || null,
      sortOrder: Number(m.sortOrder ?? 0) || 0,
      showOnHome: m.showOnHome === true,
      homeSortOrder: Number(m.homeSortOrder ?? 0) || 0,
      topicSlugs: Array.isArray(m.topicSlugs) ? m.topicSlugs.map((x) => readString(x).toLowerCase()).filter(Boolean) : [],
      hasStoreOverrides: m.hasStoreOverrides === true,
    });
  }
  return out;
}

/**
 * 업종 노출 정책(P-01: 숨김·기간)을 메뉴에도 적용 — 고객에게 보이는 업종 기준으로 메뉴를 추린다.
 * - 1단: 1차 업종이 보일 때만
 * - 2단: 개별 추가가 있거나, 연결 2차 업종 중 하나라도 보일 때만 (숨긴 업종 slug 는 제외)
 */
export function pruneDeliveryMenusToVisibleTaxonomy(
  menus: DeliveryMenuPublic[],
  categories: { slug: string }[],
  topics: { slug: string }[]
): DeliveryMenuPublic[] {
  if (menus.length === 0) return menus;
  const visiblePrimary = new Set(categories.map((c) => String(c.slug ?? "").trim().toLowerCase()));
  const visibleTopics = new Set(topics.map((t) => String(t.slug ?? "").trim().toLowerCase()));
  const out: DeliveryMenuPublic[] = [];
  for (const m of menus) {
    if (!visiblePrimary.has(m.primarySlug)) continue;
    if (m.parentId == null) {
      out.push(m);
      continue;
    }
    const topicSlugs = m.topicSlugs.filter((slug) => visibleTopics.has(slug));
    if (topicSlugs.length === 0 && !m.hasStoreOverrides) continue;
    out.push(topicSlugs.length === m.topicSlugs.length ? m : { ...m, topicSlugs });
  }
  return out;
}

function sortMenus(a: DeliveryMenuPublic, b: DeliveryMenuPublic): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.slug.localeCompare(b.slug);
}

/** 1차 업종 목록에 1단 메뉴 입히기 — 메뉴 없음 = 입력 그대로 */
export function applyDeliveryMenusToCategories(
  categories: StoreTaxonomyCategory[],
  menus: DeliveryMenuPublic[]
): StoreTaxonomyCategory[] {
  if (menus.length === 0) return categories;
  const rootByPrimary = new Map<string, DeliveryMenuPublic>();
  for (const m of menus) {
    if (m.parentId == null) rootByPrimary.set(m.primarySlug, m);
  }
  const out: StoreTaxonomyCategory[] = [];
  for (const c of categories) {
    const root = rootByPrimary.get(String(c.slug ?? "").trim().toLowerCase());
    if (!root) continue;
    out.push({
      ...c,
      name: root.nameKo,
      name_en: root.nameEn ?? c.name_en ?? null,
      image_url: root.iconUrl ?? c.image_url ?? null,
      sort_order: root.sortOrder,
    });
  }
  return out;
}

/** 해당 1차 업종의 2단 메뉴 (탭 순서). 1단 메뉴가 없으면 null = 업종 2차 탭 그대로 */
export function listDeliveryMenuTabsForPrimary(
  menus: DeliveryMenuPublic[] | undefined,
  primarySlug: string
): DeliveryMenuPublic[] | null {
  if (!menus || menus.length === 0) return null;
  const pk = primarySlug.trim().toLowerCase();
  const root = menus.find((m) => m.parentId == null && m.primarySlug === pk);
  if (!root) return null;
  return menus.filter((m) => m.parentId === root.id).sort(sortMenus);
}

/** 홈 아이콘 1개 — 누르면 `href` 로 이동 */
export type DeliveryHomeMenuEntry = StoreTaxonomyCategory & {
  /** 이동 경로 (`/stores/browse/{1차}?sub=all` 또는 `?menu={2단}`) */
  homeHref: string;
  /** 이동할 1차 업종 slug (목록 미리 받기 키) */
  homePrimarySlug: string;
};

export function buildDeliveryPrimaryEntryHref(primarySlug: string): string {
  return `/stores/browse/${encodeURIComponent(primarySlug.trim().toLowerCase())}?sub=all`;
}

export function buildDeliveryMenuTabHref(primarySlug: string, menuSlug: string): string {
  /** `sub=all` 을 함께 둔다 — `useBrowseSubAllCanonicalUrl` 이 sub 없는 URL을 `?sub=all` 로 바꾸며 `menu` 를 지우지 않게 */
  return `/stores/browse/${encodeURIComponent(primarySlug.trim().toLowerCase())}?sub=all&menu=${encodeURIComponent(menuSlug)}`;
}

/**
 * 배달 홈 아이콘 — 메뉴가 있으면 「홈 아이콘에 표시」한 1단·2단 메뉴(홈 순서),
 * 없으면 1차 업종(정렬 순서). 2단 아이콘은 부모 1단 페이지를 그 탭 선택 상태로 연다.
 */
export function resolveDeliveryHomeMenuEntries(
  categories: StoreTaxonomyCategory[],
  menus: DeliveryMenuPublic[] | undefined
): DeliveryHomeMenuEntry[] {
  if (!menus || menus.length === 0) {
    return categories.map((c) => ({
      ...c,
      homeHref: buildDeliveryPrimaryEntryHref(String(c.slug)),
      homePrimarySlug: String(c.slug ?? "").trim().toLowerCase(),
    }));
  }
  const visiblePrimary = new Set(categories.map((c) => String(c.slug ?? "").trim().toLowerCase()));
  const categoryByPrimary = new Map(categories.map((c) => [String(c.slug ?? "").trim().toLowerCase(), c]));
  const entries = menus
    .filter((m) => m.showOnHome && visiblePrimary.has(m.primarySlug))
    .sort((a, b) => (a.homeSortOrder !== b.homeSortOrder ? a.homeSortOrder - b.homeSortOrder : sortMenus(a, b)));
  return entries.map((m) => {
    const base = categoryByPrimary.get(m.primarySlug);
    return {
      id: m.id,
      slug: m.slug,
      name: m.nameKo,
      name_en: m.nameEn,
      sort_order: m.homeSortOrder,
      image_url: m.iconUrl ?? (m.parentId == null ? (base?.image_url ?? null) : null),
      homeHref:
        m.parentId == null ? buildDeliveryPrimaryEntryHref(m.primarySlug) : buildDeliveryMenuTabHref(m.primarySlug, m.slug),
      homePrimarySlug: m.primarySlug,
    };
  });
}
