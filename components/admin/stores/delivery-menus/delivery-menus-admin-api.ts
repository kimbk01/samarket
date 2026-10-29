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
  const map: Record<string, [string, string]> = {
    last_assignment: [
      "이 매장은 다른 메뉴에 없어 뺄 수 없습니다. 다른 메뉴에 먼저 넣은 뒤 빼 주세요. (노출 매장은 메뉴 1개 이상 필수)",
      "This store is in no other menu. Add it to another menu first (visible stores need at least one menu).",
    ],
    has_stores: [
      "다른 메뉴에 없는 매장이 남아 있어 삭제할 수 없습니다. 「옮길 메뉴」를 골라 주세요.",
      "Some stores are only in this menu. Choose a menu to move them to.",
    ],
    is_default: [
      "업종 기본 메뉴로 쓰는 메뉴입니다. 「옮길 메뉴」를 고르면 기본 메뉴도 함께 옮깁니다.",
      "This menu is a category default. Choose a menu to move the default to.",
    ],
    requires_child: ["매장은 상단 탭이 아닌 메뉴(아이콘)에만 넣을 수 있습니다.", "Stores can only be added to menus, not top tabs."],
    slug_taken: ["같은 주소 이름이 이미 있습니다.", "That URL name is already used."],
    bad_color: ["색은 #RRGGBB 형식으로 입력해 주세요.", "Use #RRGGBB for the color."],
    bad_link: ["연결 화면을 다시 골라 주세요.", "Choose the linked screen again."],
    bad_parent: ["옮길 상단 탭을 다시 골라 주세요.", "Choose the top tab again."],
    bad_move_target: ["옮길 메뉴는 삭제하는 메뉴 밖에서 골라 주세요.", "Choose a menu outside the one being deleted."],
    name_required: ["이름을 입력해 주세요.", "Enter a name."],
    forbidden: ["권한이 없습니다.", "No permission."],
    network_error: ["네트워크 오류입니다. 새로고침 후 다시 저장해 주세요.", "Network error. Refresh and save again."],
  };
  const hit = map[code];
  if (hit) return ko ? hit[0] : hit[1];
  return ko ? `저장하지 못했습니다. (${code})` : `Could not save. (${code})`;
}
