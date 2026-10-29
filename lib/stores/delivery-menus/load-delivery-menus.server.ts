import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDeliveryMenusPublic,
  resolveDeliveryMenuPageStores,
  type DeliveryMenuAssignmentRow,
  type DeliveryMenuDataset,
  type DeliveryMenuDbRow,
  type DeliveryMenuDefaultRow,
  type DeliveryMenuShortcutRow,
  type DeliveryMenuVisibleStore,
} from "@/lib/stores/delivery-menus/delivery-menu-compute";
import {
  peekDeliveryMenuServerCache,
  setDeliveryMenuServerCache,
} from "@/lib/stores/delivery-menus/delivery-menu-server-cache";
import {
  isDeliveryMenuLinkTarget,
  type DeliveryMenuAdminDefault,
  type DeliveryMenuAdminRow,
  type DeliveryMenuAdminShortcut,
  type DeliveryMenuPublic,
} from "@/lib/stores/delivery-menus/delivery-menu-types";

const MENU_COLUMNS =
  "id, parent_id, slug, name_ko, name_en, icon_url, sort_order, is_active, show_on_home, home_sort_order, show_in_page_tab, link_target, pickup_only, badge_text, show_feature, feature_title, feature_image_url, feature_bg, feature_link_target, start_at, end_at";

const VISIBLE_STORE_COLUMNS =
  "id, slug, store_name, profile_image_url, store_category_id, store_topic_id, pickup_available";

/** 테이블·칸 미적용(42P01·42703) → 메뉴 없음 = 기존 업종 화면 (복구 스위치) */
function isMissingMenuSchemaError(message: string): boolean {
  return /delivery_menu|42P01|42703|does not exist|column .* does not exist/i.test(message);
}

export async function loadDeliveryMenuDataset(sb: SupabaseClient): Promise<DeliveryMenuDataset | null> {
  const [menusRes, assignRes, shortcutRes, defaultRes] = await Promise.all([
    sb.from("delivery_menus").select(MENU_COLUMNS).order("sort_order", { ascending: true }),
    sb.from("delivery_menu_store_overrides").select("menu_id, store_id, sort_order").eq("mode", "include"),
    sb.from("delivery_menu_shortcuts").select("root_menu_id, store_id, sort_order, caption"),
    sb.from("delivery_menu_defaults").select("category_id, topic_id, menu_id"),
  ]);
  const err = menusRes.error ?? assignRes.error ?? shortcutRes.error ?? defaultRes.error;
  if (err) {
    if (isMissingMenuSchemaError(err.message ?? "")) return null;
    throw new Error(`delivery_menus_load: ${err.message}`);
  }
  return {
    menus: (menusRes.data ?? []) as DeliveryMenuDbRow[],
    assignments: (assignRes.data ?? []) as DeliveryMenuAssignmentRow[],
    shortcuts: (shortcutRes.data ?? []) as DeliveryMenuShortcutRow[],
    defaults: (defaultRes.data ?? []) as DeliveryMenuDefaultRow[],
  };
}

/** 고객에게 보이는 매장 — 승인·노출 */
export async function loadDeliveryMenuVisibleStores(sb: SupabaseClient): Promise<DeliveryMenuVisibleStore[]> {
  const { data, error } = await sb
    .from("stores")
    .select(VISIBLE_STORE_COLUMNS)
    .eq("approval_status", "approved")
    .eq("is_visible", true);
  if (error) throw new Error(`delivery_menu_visible_stores: ${error.message}`);
  return (data ?? []) as DeliveryMenuVisibleStore[];
}

export async function loadDeliveryMenusPublic(
  sb: SupabaseClient,
  input?: { nowMs?: number }
): Promise<DeliveryMenuPublic[]> {
  const dataset = await loadDeliveryMenuDataset(sb);
  if (!dataset || dataset.menus.length === 0) return [];
  const stores = await loadDeliveryMenuVisibleStores(sb);
  return buildDeliveryMenusPublic(dataset, stores, input?.nowMs ?? Date.now());
}

type DeliveryMenuPageCacheValue = { dataset: DeliveryMenuDataset | null; stores: DeliveryMenuVisibleStore[] };

/** 메뉴 구성 + 노출 매장 (인스턴스 메모리 20s — 목록 API 핫패스 추가 왕복 최소화) */
async function loadDeliveryMenuPageContext(sb: SupabaseClient): Promise<DeliveryMenuPageCacheValue> {
  const cached = peekDeliveryMenuServerCache<DeliveryMenuPageCacheValue>();
  if (cached) return cached;
  const dataset = await loadDeliveryMenuDataset(sb);
  const stores = dataset && dataset.menus.length > 0 ? await loadDeliveryMenuVisibleStores(sb) : [];
  const value = { dataset, stores };
  setDeliveryMenuServerCache(value);
  return value;
}

/** 목록 API — 1단 slug 가 메뉴 페이지면 매장 집합, 아니면 null (업종 경로) */
export async function resolveDeliveryMenuPage(
  sb: SupabaseClient,
  input: { rootSlug: string; menuSlug: string | null; nowMs?: number }
): Promise<ReturnType<typeof resolveDeliveryMenuPageStores>> {
  const { dataset, stores } = await loadDeliveryMenuPageContext(sb);
  if (!dataset || dataset.menus.length === 0) return null;
  const rootSlug = input.rootSlug.trim().toLowerCase();
  if (!dataset.menus.some((m) => m.parent_id == null && m.slug === rootSlug)) return null;
  return resolveDeliveryMenuPageStores(dataset, stores, {
    rootSlug,
    menuSlug: input.menuSlug,
    nowMs: input.nowMs ?? Date.now(),
  });
}

export type DeliveryMenuAdminSnapshot = {
  menus: DeliveryMenuAdminRow[];
  shortcuts: DeliveryMenuAdminShortcut[];
  defaults: DeliveryMenuAdminDefault[];
};

/** 어드민 — 전체(숨김·기간 밖 포함) */
export async function loadDeliveryMenusAdmin(sb: SupabaseClient): Promise<DeliveryMenuAdminSnapshot | null> {
  const dataset = await loadDeliveryMenuDataset(sb);
  if (!dataset) return null;
  const assignmentsByMenu = new Map<string, DeliveryMenuAssignmentRow[]>();
  for (const a of dataset.assignments) {
    const list = assignmentsByMenu.get(a.menu_id) ?? [];
    list.push(a);
    assignmentsByMenu.set(a.menu_id, list);
  }
  return {
    menus: dataset.menus.map((m) => ({
      id: m.id,
      slug: m.slug,
      parent_id: m.parent_id,
      name_ko: m.name_ko,
      name_en: m.name_en,
      icon_url: m.icon_url,
      sort_order: m.sort_order ?? 0,
      is_active: m.is_active !== false,
      show_on_home: m.show_on_home !== false,
      home_sort_order: m.home_sort_order ?? 0,
      show_in_page_tab: m.show_in_page_tab !== false,
      link_target: isDeliveryMenuLinkTarget(m.link_target) ? m.link_target : null,
      pickup_only: m.pickup_only === true,
      badge_text: m.badge_text,
      show_feature: m.show_feature === true,
      feature_title: m.feature_title,
      feature_image_url: m.feature_image_url,
      feature_bg: m.feature_bg,
      feature_link_target: isDeliveryMenuLinkTarget(m.feature_link_target) ? m.feature_link_target : null,
      start_at: m.start_at,
      end_at: m.end_at,
      store_ids: (assignmentsByMenu.get(m.id) ?? [])
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((a) => String(a.store_id)),
    })),
    shortcuts: dataset.shortcuts.map((s) => ({
      root_menu_id: s.root_menu_id,
      store_id: s.store_id,
      sort_order: s.sort_order ?? 0,
      caption: s.caption,
    })),
    defaults: dataset.defaults.map((d) => ({
      category_id: d.category_id,
      topic_id: d.topic_id,
      menu_id: d.menu_id,
    })),
  };
}
