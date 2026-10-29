/**
 * 배달 메뉴 — 순수 계산 (서버 로더·테스트 공용, DB 없음).
 * 메뉴 매장 = 지정 매장 ∪ (어느 메뉴에도 없는 노출 매장 중 업종 기본 메뉴가 이 메뉴인 매장 — 안전장치 S6).
 */
import {
  isDeliveryMenuLinkTarget,
  type DeliveryMenuFeatureCard,
  type DeliveryMenuLinkTarget,
  type DeliveryMenuPublic,
  type DeliveryMenuShortcut,
} from "@/lib/stores/delivery-menus/delivery-menu-types";

export type DeliveryMenuDbRow = {
  id: string;
  parent_id: string | null;
  slug: string;
  name_ko: string;
  name_en: string | null;
  icon_url: string | null;
  sort_order: number | null;
  is_active: boolean | null;
  show_on_home: boolean | null;
  home_sort_order: number | null;
  show_in_page_tab: boolean | null;
  link_target: string | null;
  pickup_only: boolean | null;
  badge_text: string | null;
  show_feature: boolean | null;
  feature_title: string | null;
  feature_image_url: string | null;
  feature_bg: string | null;
  feature_link_target: string | null;
  start_at: string | null;
  end_at: string | null;
};

export type DeliveryMenuAssignmentRow = { menu_id: string; store_id: string; sort_order: number | null };
export type DeliveryMenuShortcutRow = {
  root_menu_id: string;
  store_id: string;
  sort_order: number | null;
  caption: string | null;
};
export type DeliveryMenuDefaultRow = { category_id: string; topic_id: string | null; menu_id: string };

/** 고객에게 보이는 매장 (승인·노출) */
export type DeliveryMenuVisibleStore = {
  id: string;
  slug: string;
  store_name: string;
  profile_image_url: string | null;
  store_category_id: string | null;
  store_topic_id: string | null;
  pickup_available: boolean | null;
};

export type DeliveryMenuDataset = {
  menus: DeliveryMenuDbRow[];
  assignments: DeliveryMenuAssignmentRow[];
  shortcuts: DeliveryMenuShortcutRow[];
  defaults: DeliveryMenuDefaultRow[];
};

export function isDeliveryMenuWithinWindow(
  row: Pick<DeliveryMenuDbRow, "start_at" | "end_at">,
  nowMs: number
): boolean {
  if (row.start_at && Date.parse(row.start_at) > nowMs) return false;
  if (row.end_at && Date.parse(row.end_at) <= nowMs) return false;
  return true;
}

function linkTargetOrNull(v: string | null): DeliveryMenuLinkTarget | null {
  return isDeliveryMenuLinkTarget(v) ? v : null;
}

/** 매장의 업종 기본 메뉴 — 2차 업종 기본이 1차 업종 기본보다 우선 */
export function resolveDefaultMenuIdForStore(
  defaults: readonly DeliveryMenuDefaultRow[],
  store: Pick<DeliveryMenuVisibleStore, "store_category_id" | "store_topic_id">
): string | null {
  const cat = store.store_category_id ? String(store.store_category_id) : "";
  if (!cat) return null;
  const topic = store.store_topic_id ? String(store.store_topic_id) : "";
  let categoryLevel: string | null = null;
  for (const d of defaults) {
    if (String(d.category_id) !== cat) continue;
    if (d.topic_id == null) {
      categoryLevel = String(d.menu_id);
      continue;
    }
    if (topic && String(d.topic_id) === topic) return String(d.menu_id);
  }
  return categoryLevel;
}

/**
 * 2단 메뉴별 매장 id (지정 순서). 지정이 하나도 없는 노출 매장은 업종 기본 메뉴에 붙인다 (S6 표시 폴백).
 * 숨김·미승인 매장 지정은 제외한다.
 */
export function computeDeliveryMenuStoreIds(
  dataset: Pick<DeliveryMenuDataset, "assignments" | "defaults">,
  visibleStores: readonly DeliveryMenuVisibleStore[]
): { byMenu: Map<string, string[]>; unassignedStoreIds: string[] } {
  const visibleIds = new Set(visibleStores.map((s) => String(s.id)));
  const sorted = [...dataset.assignments].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const byMenu = new Map<string, string[]>();
  const assigned = new Set<string>();
  for (const a of sorted) {
    const storeId = String(a.store_id);
    if (!visibleIds.has(storeId)) continue;
    const list = byMenu.get(String(a.menu_id)) ?? [];
    if (!list.includes(storeId)) list.push(storeId);
    byMenu.set(String(a.menu_id), list);
    assigned.add(storeId);
  }
  const unassignedStoreIds: string[] = [];
  for (const s of visibleStores) {
    const id = String(s.id);
    if (assigned.has(id)) continue;
    unassignedStoreIds.push(id);
    const fallback = resolveDefaultMenuIdForStore(dataset.defaults, s);
    if (!fallback) continue;
    const list = byMenu.get(fallback) ?? [];
    list.push(id);
    byMenu.set(fallback, list);
  }
  return { byMenu, unassignedStoreIds };
}

function sortByOrder(a: DeliveryMenuDbRow, b: DeliveryMenuDbRow): number {
  const d = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  return d !== 0 ? d : a.slug.localeCompare(b.slug);
}

/**
 * 고객 메뉴 — 활성·기간 안. 숨긴 1단의 2단 제외. 매장 0곳 매장 목록 메뉴 제외(자동 숨김).
 * 보일 2단·대표 카드가 하나도 없는 1단 제외.
 */
export function buildDeliveryMenusPublic(
  dataset: DeliveryMenuDataset,
  visibleStores: readonly DeliveryMenuVisibleStore[],
  nowMs: number
): DeliveryMenuPublic[] {
  const storeById = new Map(visibleStores.map((s) => [String(s.id), s]));
  const { byMenu } = computeDeliveryMenuStoreIds(dataset, visibleStores);
  const live = dataset.menus.filter((m) => m.is_active !== false && isDeliveryMenuWithinWindow(m, nowMs));
  const roots = live.filter((m) => m.parent_id == null).sort(sortByOrder);
  const out: DeliveryMenuPublic[] = [];
  for (const root of roots) {
    const pickupOnly = root.pickup_only === true;
    const children: DeliveryMenuPublic[] = [];
    for (const m of live.filter((c) => c.parent_id === root.id).sort(sortByOrder)) {
      const linkTarget = linkTargetOrNull(m.link_target);
      const ids = byMenu.get(m.id) ?? [];
      const storeCount = pickupOnly
        ? ids.filter((id) => storeById.get(id)?.pickup_available !== false).length
        : ids.length;
      if (!linkTarget && storeCount === 0) continue;
      children.push({
        id: m.id,
        slug: m.slug,
        parentId: root.id,
        nameKo: m.name_ko,
        nameEn: m.name_en,
        iconUrl: m.icon_url,
        sortOrder: m.sort_order ?? 0,
        showOnHome: m.show_on_home !== false,
        homeSortOrder: m.home_sort_order ?? 0,
        showInPageTab: m.show_in_page_tab !== false,
        linkTarget,
        pickupOnly: false,
        badgeText: null,
        feature: null,
        storeCount: linkTarget ? 0 : storeCount,
        shortcuts: [],
      });
    }
    const feature: DeliveryMenuFeatureCard | null =
      root.show_feature === true && (root.feature_title ?? "").trim()
        ? {
            title: (root.feature_title ?? "").trim(),
            imageUrl: root.feature_image_url,
            bg: root.feature_bg,
            linkTarget: linkTargetOrNull(root.feature_link_target),
          }
        : null;
    if (children.length === 0 && !feature) continue;
    const shortcuts: DeliveryMenuShortcut[] = [];
    for (const sc of [...dataset.shortcuts]
      .filter((x) => x.root_menu_id === root.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
      const st = storeById.get(String(sc.store_id));
      if (!st) continue;
      if (pickupOnly && st.pickup_available === false) continue;
      shortcuts.push({
        storeId: st.id,
        slug: st.slug,
        name: st.store_name,
        imageUrl: st.profile_image_url,
        caption: (sc.caption ?? "").trim() || null,
      });
    }
    out.push({
      id: root.id,
      slug: root.slug,
      parentId: null,
      nameKo: root.name_ko,
      nameEn: root.name_en,
      iconUrl: root.icon_url,
      sortOrder: root.sort_order ?? 0,
      showOnHome: true,
      homeSortOrder: root.home_sort_order ?? 0,
      showInPageTab: true,
      linkTarget: null,
      pickupOnly,
      badgeText: (root.badge_text ?? "").trim() || null,
      feature,
      storeCount: 0,
      shortcuts,
    });
    out.push(...children);
  }
  return out;
}

/**
 * 메뉴 페이지 매장 — `menuSlug` 없음(「홈」 탭) = 1단의 매장 목록 메뉴 전체 합집합.
 * 픽업 1단은 픽업 가능 매장만. 1단·2단이 보이지 않으면 null.
 */
export function resolveDeliveryMenuPageStores(
  dataset: DeliveryMenuDataset,
  visibleStores: readonly DeliveryMenuVisibleStore[],
  input: { rootSlug: string; menuSlug: string | null; nowMs: number }
): {
  rootId: string;
  menuId: string | null;
  pickupOnly: boolean;
  storeIds: string[];
  categoryIds: string[];
} | null {
  const rootSlug = input.rootSlug.trim().toLowerCase();
  const menuSlug = (input.menuSlug ?? "").trim().toLowerCase();
  const live = dataset.menus.filter((m) => m.is_active !== false && isDeliveryMenuWithinWindow(m, input.nowMs));
  const root = live.find((m) => m.parent_id == null && m.slug === rootSlug);
  if (!root) return null;
  const children = live.filter((m) => m.parent_id === root.id && !linkTargetOrNull(m.link_target));
  const targets = menuSlug ? children.filter((m) => m.slug === menuSlug) : children.sort(sortByOrder);
  if (menuSlug && targets.length === 0) return null;
  const storeById = new Map(visibleStores.map((s) => [String(s.id), s]));
  const { byMenu } = computeDeliveryMenuStoreIds(dataset, visibleStores);
  const pickupOnly = root.pickup_only === true;
  const storeIds: string[] = [];
  const seen = new Set<string>();
  for (const m of targets) {
    for (const id of byMenu.get(m.id) ?? []) {
      if (seen.has(id)) continue;
      const st = storeById.get(id);
      if (!st) continue;
      if (pickupOnly && st.pickup_available === false) continue;
      seen.add(id);
      storeIds.push(id);
    }
  }
  const categoryIds = [
    ...new Set(
      storeIds
        .map((id) => storeById.get(id)?.store_category_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0)
    ),
  ];
  return {
    rootId: root.id,
    menuId: menuSlug ? (targets[0]?.id ?? null) : null,
    pickupOnly,
    storeIds,
    categoryIds,
  };
}
