/**
 * WP2 어드민 「메뉴 구성」 — 클라이언트 API 호출 (GET/POST/PATCH/DELETE `/api/admin/stores/delivery-menus`,
 * 아이콘 업로드·삭제 `/api/admin/stores/taxonomy/upload-image` kind=menu).
 * 결과는 `{ ok, error }` 코드만 — 문구는 `deliveryMenuErrorText`.
 */

import type { DeliveryMenuAdminRow } from "@/lib/stores/delivery-menus/delivery-menu-types";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import type { DeliveryMenuAdminStore } from "./delivery-menus-admin-model";

export const DELIVERY_MENUS_ADMIN_API = "/api/admin/stores/delivery-menus";
const UPLOAD_API = "/api/admin/stores/taxonomy/upload-image";

export type DeliveryMenusAdminPayload = {
  /** null = 메뉴 테이블 미적용 */
  menus: DeliveryMenuAdminRow[] | null;
  categories: StoreTaxonomyCategory[];
  topics: StoreTaxonomyTopic[];
  stores: DeliveryMenuAdminStore[];
};

export type DeliveryMenusApiResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; code: string; status?: number };

async function call<T>(url: string, init: RequestInit, pick: (j: Record<string, unknown>) => T): Promise<DeliveryMenusApiResult<T>> {
  try {
    const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && j.ok === true) return { ok: true, value: pick(j) };
    const code = typeof j.error === "string" && j.error ? j.error : res.status === 403 ? "forbidden" : "load_failed";
    return { ok: false, code, status: res.status };
  } catch {
    return { ok: false, code: "network_error" };
  }
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function fetchDeliveryMenusAdmin(): Promise<DeliveryMenusApiResult<DeliveryMenusAdminPayload>> {
  return call(DELIVERY_MENUS_ADMIN_API, { method: "GET" }, (j) => ({
    menus: Array.isArray(j.menus) ? (j.menus as DeliveryMenuAdminRow[]) : null,
    categories: Array.isArray(j.categories) ? (j.categories as StoreTaxonomyCategory[]) : [],
    topics: Array.isArray(j.topics) ? (j.topics as StoreTaxonomyTopic[]) : [],
    stores: Array.isArray(j.stores) ? (j.stores as DeliveryMenuAdminStore[]) : [],
  }));
}

export function createDeliveryMenu(body: {
  parent_id?: string;
  primary_category_id?: string;
  slug: string;
  name_ko: string;
  name_en?: string | null;
  sort_order?: number;
}): Promise<DeliveryMenusApiResult<string | null>> {
  return call(DELIVERY_MENUS_ADMIN_API, json("POST", body), (j) => (typeof j.id === "string" ? j.id : null));
}

export function updateDeliveryMenu(body: {
  id: string;
  patch?: Record<string, unknown>;
  topic_ids?: string[];
  include_store_ids?: string[];
  exclude_store_ids?: string[];
}): Promise<DeliveryMenusApiResult> {
  return call(DELIVERY_MENUS_ADMIN_API, json("PATCH", body), () => undefined);
}

export function reorderDeliveryMenus(order: { id: string; sort_order: number }[]): Promise<DeliveryMenusApiResult> {
  return call(DELIVERY_MENUS_ADMIN_API, json("PATCH", { order }), () => undefined);
}

export function reorderDeliveryMenusHome(
  homeOrder: { id: string; home_sort_order: number }[]
): Promise<DeliveryMenusApiResult> {
  return call(DELIVERY_MENUS_ADMIN_API, json("PATCH", { home_order: homeOrder }), () => undefined);
}

export function deleteDeliveryMenu(id: string): Promise<DeliveryMenusApiResult> {
  return call(`${DELIVERY_MENUS_ADMIN_API}?id=${encodeURIComponent(id)}`, { method: "DELETE" }, () => undefined);
}

export function uploadDeliveryMenuIcon(id: string, file: File): Promise<DeliveryMenusApiResult<string>> {
  const fd = new FormData();
  fd.append("kind", "menu");
  fd.append("id", id);
  fd.append("file", file);
  return call(UPLOAD_API, { method: "POST", body: fd }, (j) => (typeof j.url === "string" ? j.url : ""));
}

export function deleteDeliveryMenuIcon(id: string): Promise<DeliveryMenusApiResult> {
  return call(UPLOAD_API, json("DELETE", { kind: "menu", id }), () => undefined);
}
