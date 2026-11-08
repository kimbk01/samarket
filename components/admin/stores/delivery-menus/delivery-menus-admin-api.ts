/**
 * 어드민 「배달·매장 › 메뉴 관리」 — 클라이언트 API 호출 (`/api/admin/stores/delivery-menus`,
 * 아이콘·대표 카드 그림 `/api/admin/stores/taxonomy/upload-image` kind=menu|menu_feature).
 * 결과는 `{ ok, code }` 만 — 문구는 `deliveryMenuAdminErrorText`.
 */

import type {
  DeliveryMenuAdminDefault,
  DeliveryMenuAdminRow,
  DeliveryMenuAdminShortcut,
} from "@/lib/stores/delivery-menus/delivery-menu-types";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { translateBy } from "@/lib/i18n/translate-by";
import type { MessageKey } from "@/lib/i18n/messages";

export const DELIVERY_MENUS_ADMIN_API = "/api/admin/stores/delivery-menus";
const UPLOAD_API = "/api/admin/stores/taxonomy/upload-image";

export type DeliveryMenuAdminStore = {
  id: string;
  store_name: string | null;
  slug: string | null;
  profile_image_url: string | null;
  store_category_id: string | null;
  store_topic_id: string | null;
  is_visible: boolean | null;
  approval_status: string | null;
  pickup_available: boolean | null;
};

export type DeliveryMenusAdminPayload = {
  /** null = 메뉴 테이블 미적용 */
  menus: DeliveryMenuAdminRow[] | null;
  shortcuts: DeliveryMenuAdminShortcut[];
  defaults: DeliveryMenuAdminDefault[];
  categories: StoreTaxonomyCategory[];
  topics: StoreTaxonomyTopic[];
  stores: DeliveryMenuAdminStore[];
};

export type DeliveryMenusApiResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; code: string; status?: number; storeIds?: string[] };

async function call<T>(url: string, init: RequestInit, pick: (j: Record<string, unknown>) => T): Promise<DeliveryMenusApiResult<T>> {
  try {
    const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && j.ok === true) return { ok: true, value: pick(j) };
    const code = typeof j.error === "string" && j.error ? j.error : res.status === 403 ? "forbidden" : "load_failed";
    const storeIds = Array.isArray(j.store_ids) ? j.store_ids.map(String) : undefined;
    return { ok: false, code, status: res.status, storeIds };
  } catch {
    return { ok: false, code: "network_error" };
  }
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function fetchDeliveryMenusAdmin(): Promise<DeliveryMenusApiResult<DeliveryMenusAdminPayload>> {
  return call(DELIVERY_MENUS_ADMIN_API, { method: "GET" }, (j) => {
    const snap = (j.snapshot ?? null) as {
      menus?: DeliveryMenuAdminRow[];
      shortcuts?: DeliveryMenuAdminShortcut[];
      defaults?: DeliveryMenuAdminDefault[];
    } | null;
    return {
      menus: snap && Array.isArray(snap.menus) ? snap.menus : null,
      shortcuts: snap && Array.isArray(snap.shortcuts) ? snap.shortcuts : [],
      defaults: snap && Array.isArray(snap.defaults) ? snap.defaults : [],
      categories: Array.isArray(j.categories) ? (j.categories as StoreTaxonomyCategory[]) : [],
      topics: Array.isArray(j.topics) ? (j.topics as StoreTaxonomyTopic[]) : [],
      stores: Array.isArray(j.stores) ? (j.stores as DeliveryMenuAdminStore[]) : [],
    };
  });
}

export function createDeliveryMenu(body: {
  parent_id: string | null;
  name_ko: string;
  name_en?: string | null;
}): Promise<DeliveryMenusApiResult<string | null>> {
  return call(DELIVERY_MENUS_ADMIN_API, json("POST", body), (j) => (typeof j.id === "string" ? j.id : null));
}

export function updateDeliveryMenu(id: string, patch: Record<string, unknown>): Promise<DeliveryMenusApiResult> {
  return call(DELIVERY_MENUS_ADMIN_API, json("PATCH", { id, patch }), () => undefined);
}

export function saveDeliveryMenuStores(id: string, storeIds: string[]): Promise<DeliveryMenusApiResult> {
  return call(DELIVERY_MENUS_ADMIN_API, json("PATCH", { id, store_ids: storeIds }), () => undefined);
}

export function saveDeliveryMenuShortcuts(
  rootId: string,
  shortcuts: { store_id: string; caption: string | null }[]
): Promise<DeliveryMenusApiResult> {
  return call(DELIVERY_MENUS_ADMIN_API, json("PATCH", { root_id: rootId, shortcuts }), () => undefined);
}

export function saveDeliveryMenuDefaults(defaults: DeliveryMenuAdminDefault[]): Promise<DeliveryMenusApiResult> {
  return call(DELIVERY_MENUS_ADMIN_API, json("PATCH", { defaults }), () => undefined);
}

export function reorderDeliveryMenus(
  key: "order" | "home_order",
  list: { id: string; value: number }[]
): Promise<DeliveryMenusApiResult> {
  const column = key === "order" ? "sort_order" : "home_sort_order";
  return call(
    DELIVERY_MENUS_ADMIN_API,
    json("PATCH", { [key]: list.map((o) => ({ id: o.id, [column]: o.value })) }),
    () => undefined
  );
}

export function deleteDeliveryMenu(id: string, moveTo: string | null): Promise<DeliveryMenusApiResult> {
  const q = new URLSearchParams({ id });
  if (moveTo) q.set("move_to", moveTo);
  return call(`${DELIVERY_MENUS_ADMIN_API}?${q.toString()}`, { method: "DELETE" }, () => undefined);
}

export function uploadDeliveryMenuImage(
  kind: "menu" | "menu_feature",
  id: string,
  file: File
): Promise<DeliveryMenusApiResult<string>> {
  const fd = new FormData();
  fd.append("kind", kind);
  fd.append("id", id);
  fd.append("file", file);
  return call(UPLOAD_API, { method: "POST", body: fd }, (j) => (typeof j.url === "string" ? j.url : ""));
}

export function deleteDeliveryMenuImage(kind: "menu" | "menu_feature", id: string): Promise<DeliveryMenusApiResult> {
  return call(UPLOAD_API, json("DELETE", { kind, id }), () => undefined);
}

/** API 오류 코드 → 어드민 문구 */
export function deliveryMenuAdminErrorText(code: string, ko: boolean): string {
  const map: Record<string, MessageKey> = {
    last_assignment: "admin_stores_delivery_menus_err_last_assignment",
    has_stores: "admin_stores_delivery_menus_err_has_stores",
    is_default: "admin_stores_delivery_menus_err_is_default",
    requires_child: "admin_stores_delivery_menus_err_requires_child",
    slug_taken: "admin_stores_delivery_menus_err_slug_taken",
    bad_color: "admin_stores_delivery_menus_err_bad_color",
    bad_link: "admin_stores_delivery_menus_err_bad_link",
    bad_parent: "admin_stores_delivery_menus_err_bad_parent",
    bad_move_target: "admin_stores_delivery_menus_err_bad_move_target",
    name_required: "admin_stores_delivery_menus_err_name_required",
    forbidden: "admin_stores_delivery_menus_err_forbidden",
    network_error: "admin_stores_delivery_menus_err_network_error",
  };
  const hit = map[code];
  if (hit) return translateBy(ko ? "ko" : "en", hit);
  return translateBy(ko ? "ko" : "en", "admin_stores_could_not_save_2", { code });
}
