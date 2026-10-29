import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeliveryMenuAdminRow,
  DeliveryMenuPublic,
  DeliveryMenuStoreFilter,
} from "@/lib/stores/delivery-menus/delivery-menu-types";

type MenuRow = {
  id: string;
  parent_id: string | null;
  primary_category_id: string | null;
  slug: string;
  name_ko: string;
  name_en: string | null;
  icon_url: string | null;
  sort_order: number | null;
  is_active: boolean | null;
  show_on_home: boolean | null;
  home_sort_order: number | null;
  start_at: string | null;
  end_at: string | null;
};

const MENU_COLUMNS =
  "id, parent_id, primary_category_id, slug, name_ko, name_en, icon_url, sort_order, is_active, show_on_home, home_sort_order, start_at, end_at";

/** 테이블 미적용(42P01)·권한 오류 → 메뉴 없음 = 기존 업종 화면 (복구 스위치) */
function isMissingMenuTableError(message: string): boolean {
  return /delivery_menu|42P01|does not exist/i.test(message);
}

function isWithinWindow(row: Pick<MenuRow, "start_at" | "end_at">, nowMs: number): boolean {
  if (row.start_at && Date.parse(row.start_at) > nowMs) return false;
  if (row.end_at && Date.parse(row.end_at) <= nowMs) return false;
  return true;
}

type LoadedMenuData = {
  menus: MenuRow[];
  sources: { menu_id: string; topic_id: string }[];
  overrides: { menu_id: string; store_id: string; mode: string }[];
};

async function loadMenuTables(sb: SupabaseClient): Promise<LoadedMenuData | null> {
  const [menusRes, sourcesRes, overridesRes] = await Promise.all([
    sb.from("delivery_menus").select(MENU_COLUMNS).order("sort_order", { ascending: true }),
    sb.from("delivery_menu_sources").select("menu_id, topic_id"),
    sb.from("delivery_menu_store_overrides").select("menu_id, store_id, mode"),
  ]);
  const err = menusRes.error ?? sourcesRes.error ?? overridesRes.error;
  if (err) {
    if (isMissingMenuTableError(err.message ?? "")) return null;
    throw new Error(`delivery_menus_load: ${err.message}`);
  }
  return {
    menus: (menusRes.data ?? []) as MenuRow[],
    sources: (sourcesRes.data ?? []) as LoadedMenuData["sources"],
    overrides: (overridesRes.data ?? []) as LoadedMenuData["overrides"],
  };
}

/**
 * 고객 메뉴 — 활성·기간 안. 1단이 숨김이면 하위 2단도 제외.
 * 1차 업종이 숨김(`is_active=false`)·조회 불가면 그 1단 메뉴도 제외.
 */
export async function loadDeliveryMenusPublic(
  sb: SupabaseClient,
  input: {
    categories: { id: string; slug: string }[];
    topics: { id: string; slug: string }[];
    nowMs?: number;
  }
): Promise<DeliveryMenuPublic[]> {
  const data = await loadMenuTables(sb);
  if (!data || data.menus.length === 0) return [];
  const nowMs = input.nowMs ?? Date.now();
  const categorySlugById = new Map(input.categories.map((c) => [String(c.id), c.slug]));
  const topicSlugById = new Map(input.topics.map((t) => [String(t.id), t.slug]));

  const visibleRoots = new Map<string, MenuRow & { primarySlug: string }>();
  for (const m of data.menus) {
    if (m.parent_id != null || !m.is_active || !isWithinWindow(m, nowMs)) continue;
    const primarySlug = m.primary_category_id ? categorySlugById.get(String(m.primary_category_id)) : undefined;
    if (!primarySlug) continue;
    visibleRoots.set(m.id, { ...m, primarySlug });
  }

  const topicsByMenu = new Map<string, string[]>();
  for (const s of data.sources) {
    const slug = topicSlugById.get(String(s.topic_id));
    if (!slug) continue;
    const list = topicsByMenu.get(s.menu_id) ?? [];
    list.push(slug);
    topicsByMenu.set(s.menu_id, list);
  }
  const menusWithOverrides = new Set(data.overrides.map((o) => o.menu_id));

  const out: DeliveryMenuPublic[] = [];
  for (const root of visibleRoots.values()) {
    out.push({
      id: root.id,
      slug: root.slug,
      parentId: null,
      primarySlug: root.primarySlug,
      nameKo: root.name_ko,
      nameEn: root.name_en,
      iconUrl: root.icon_url,
      sortOrder: root.sort_order ?? 0,
      showOnHome: root.show_on_home === true,
      homeSortOrder: root.home_sort_order ?? 0,
      topicSlugs: [],
      hasStoreOverrides: false,
    });
  }
  for (const m of data.menus) {
    if (m.parent_id == null || !m.is_active || !isWithinWindow(m, nowMs)) continue;
    const root = visibleRoots.get(m.parent_id);
    if (!root) continue;
    const topicSlugs = topicsByMenu.get(m.id) ?? [];
    const hasStoreOverrides = menusWithOverrides.has(m.id);
    /** 연결 업종·개별 매장이 모두 없는 2단은 빈 탭 → 고객에게 숨김 */
    if (topicSlugs.length === 0 && !hasStoreOverrides) continue;
    out.push({
      id: m.id,
      slug: m.slug,
      parentId: m.parent_id,
      primarySlug: root.primarySlug,
      nameKo: m.name_ko,
      nameEn: m.name_en,
      iconUrl: m.icon_url,
      sortOrder: m.sort_order ?? 0,
      showOnHome: m.show_on_home === true,
      homeSortOrder: m.home_sort_order ?? 0,
      topicSlugs,
      hasStoreOverrides,
    });
  }
  return out;
}

/** 목록 API — `menu` 슬러그 → 매장 필터. 메뉴 없음·1단·숨김이면 null (업종 경로 그대로) */
export async function resolveDeliveryMenuStoreFilter(
  sb: SupabaseClient,
  input: { primarySlug: string; menuSlug: string; nowMs?: number }
): Promise<{ filter: DeliveryMenuStoreFilter; singleTopicSlug: string | null } | null> {
  const menuSlug = input.menuSlug.trim().toLowerCase();
  if (!menuSlug) return null;
  const { data: menu, error } = await sb
    .from("delivery_menus")
    .select(`${MENU_COLUMNS}, parent:parent_id ( id, primary_category_id, is_active, start_at, end_at, category:primary_category_id ( slug ) )`)
    .eq("slug", menuSlug)
    .maybeSingle();
  if (error) {
    if (isMissingMenuTableError(error.message ?? "")) return null;
    throw new Error(`delivery_menu_resolve: ${error.message}`);
  }
  const row = menu as
    | (MenuRow & {
        parent: {
          id: string;
          is_active: boolean | null;
          start_at: string | null;
          end_at: string | null;
          category: { slug: string } | null;
        } | null;
      })
    | null;
  const nowMs = input.nowMs ?? Date.now();
  if (!row || !row.parent || !row.is_active || !isWithinWindow(row, nowMs)) return null;
  if (!row.parent.is_active || !isWithinWindow(row.parent, nowMs)) return null;
  if ((row.parent.category?.slug ?? "") !== input.primarySlug.trim().toLowerCase()) return null;

  const [sourcesRes, overridesRes] = await Promise.all([
    sb.from("delivery_menu_sources").select("topic_id, topic:topic_id ( slug )").eq("menu_id", row.id),
    sb.from("delivery_menu_store_overrides").select("store_id, mode").eq("menu_id", row.id),
  ]);
  const err = sourcesRes.error ?? overridesRes.error;
  if (err) throw new Error(`delivery_menu_resolve_children: ${err.message}`);
  const sources = (sourcesRes.data ?? []) as unknown as { topic_id: string; topic: { slug: string } | null }[];
  const overrides = (overridesRes.data ?? []) as { store_id: string; mode: string }[];
  const includeStoreIds = new Set(overrides.filter((o) => o.mode === "include").map((o) => String(o.store_id)));
  const excludeStoreIds = new Set(overrides.filter((o) => o.mode === "exclude").map((o) => String(o.store_id)));
  const topicIds = new Set(sources.map((s) => String(s.topic_id)));
  if (topicIds.size === 0 && includeStoreIds.size === 0) return null;
  const singleTopicSlug =
    topicIds.size === 1 && includeStoreIds.size === 0 && excludeStoreIds.size === 0
      ? (sources[0]?.topic?.slug ?? null)
      : null;
  return {
    filter: {
      menuId: row.id,
      /** 연결 업종 없이 개별 추가만 있으면 추가 매장만 */
      topicIds,
      includeStoreIds,
      excludeStoreIds,
    },
    singleTopicSlug,
  };
}

/** 어드민 — 전체(숨김·기간 밖 포함) */
export async function loadDeliveryMenusAdmin(sb: SupabaseClient): Promise<DeliveryMenuAdminRow[] | null> {
  const data = await loadMenuTables(sb);
  if (!data) return null;
  return data.menus.map((m) => ({
    id: m.id,
    slug: m.slug,
    parent_id: m.parent_id,
    primary_category_id: m.primary_category_id,
    name_ko: m.name_ko,
    name_en: m.name_en,
    icon_url: m.icon_url,
    sort_order: m.sort_order ?? 0,
    is_active: m.is_active !== false,
    show_on_home: m.show_on_home === true,
    home_sort_order: m.home_sort_order ?? 0,
    start_at: m.start_at,
    end_at: m.end_at,
    topic_ids: data.sources.filter((s) => s.menu_id === m.id).map((s) => String(s.topic_id)),
    include_store_ids: data.overrides
      .filter((o) => o.menu_id === m.id && o.mode === "include")
      .map((o) => String(o.store_id)),
    exclude_store_ids: data.overrides
      .filter((o) => o.menu_id === m.id && o.mode === "exclude")
      .map((o) => String(o.store_id)),
  }));
}
