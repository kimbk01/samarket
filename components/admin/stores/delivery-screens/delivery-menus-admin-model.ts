/**
 * WP2 어드민 「메뉴 구성」 — 순수 계산 (화면·테스트 공용).
 * 규칙은 서버(`load-delivery-menus.server.ts`)와 같다:
 * - 활성 = is_active && 기간 안. 1단은 연결 1차 업종이 숨김이면 고객에게 안 보인다.
 * - 2단 매장 = 부모 1차 업종 매장 중 (연결 2차 업종 ∪ 개별 추가) − 개별 제외.
 * - 연결 업종·개별 추가가 모두 없는 2단은 고객에게 숨김(빈 탭).
 */

import {
  deliveryMenuIncludesStore,
  type DeliveryMenuAdminRow,
} from "@/lib/stores/delivery-menus/delivery-menu-types";

export type DeliveryMenuAdminStore = {
  id: string;
  store_name: string | null;
  store_category_id: string | null;
  store_topic_id: string | null;
  is_visible: boolean | null;
  approval_status: string | null;
  store_kind?: string | null;
};

export type DeliveryMenuAdminCategory = { id: string; name: string; slug: string; is_active?: boolean };

export type DeliveryMenuSources = Pick<DeliveryMenuAdminRow, "topic_ids" | "include_store_ids" | "exclude_store_ids">;

/** 고객 화면에 나오는 매장 — 노출 + 승인 */
export function isCustomerVisibleStore(s: Pick<DeliveryMenuAdminStore, "is_visible" | "approval_status">): boolean {
  return s.is_visible === true && s.approval_status === "approved";
}

export function isMenuWithinWindow(
  m: Pick<DeliveryMenuAdminRow, "start_at" | "end_at">,
  nowMs: number
): boolean {
  if (m.start_at && Date.parse(m.start_at) > nowMs) return false;
  if (m.end_at && Date.parse(m.end_at) <= nowMs) return false;
  return true;
}

export function isMenuLiveNow(
  m: Pick<DeliveryMenuAdminRow, "is_active" | "start_at" | "end_at">,
  nowMs: number
): boolean {
  return m.is_active && isMenuWithinWindow(m, nowMs);
}

/** 2단 메뉴(부모 1차 업종 안)에 보일 매장 */
export function storesForChildMenu<T extends DeliveryMenuAdminStore>(
  sources: DeliveryMenuSources,
  primaryCategoryId: string | null,
  stores: readonly T[]
): T[] {
  if (!primaryCategoryId) return [];
  const filter = {
    menuId: "",
    topicIds: new Set(sources.topic_ids),
    includeStoreIds: new Set(sources.include_store_ids),
    excludeStoreIds: new Set(sources.exclude_store_ids),
  };
  return stores.filter(
    (s) => s.store_category_id === primaryCategoryId && deliveryMenuIncludesStore(filter, s)
  );
}

/** 2단이 고객에게 보이는 탭인지 — 활성·기간 + 연결 업종 또는 개별 추가 있음 */
export function isChildMenuShownAsTab(child: DeliveryMenuAdminRow, nowMs: number): boolean {
  return isMenuLiveNow(child, nowMs) && (child.topic_ids.length > 0 || child.include_store_ids.length > 0);
}

/** 고객에게 보이는 1단 — 활성·기간 + 1차 업종 노출 */
export function liveRootMenusByCategory(
  menus: readonly DeliveryMenuAdminRow[],
  categories: readonly DeliveryMenuAdminCategory[],
  nowMs: number
): Map<string, DeliveryMenuAdminRow> {
  const activeCategory = new Set(categories.filter((c) => c.is_active !== false).map((c) => c.id));
  const out = new Map<string, DeliveryMenuAdminRow>();
  for (const m of menus) {
    if (m.parent_id != null || !m.primary_category_id) continue;
    if (!isMenuLiveNow(m, nowMs) || !activeCategory.has(m.primary_category_id)) continue;
    out.set(m.primary_category_id, m);
  }
  return out;
}

export type DeliveryMenuCoverage<T extends DeliveryMenuAdminStore> = {
  /** 고객 메뉴에 안 보이는 매장 (1차 없음 · 활성 1단 없음) */
  uncovered: T[];
  /** 1단에는 있지만 활성 2단 탭 어디에도 없음 → 「전체」에서만 */
  allTabOnly: T[];
};

/** 노출·승인 매장 기준 메뉴 누락 현황 */
export function computeDeliveryMenuCoverage<T extends DeliveryMenuAdminStore>(
  menus: readonly DeliveryMenuAdminRow[],
  categories: readonly DeliveryMenuAdminCategory[],
  stores: readonly T[],
  nowMs: number
): DeliveryMenuCoverage<T> {
  const roots = liveRootMenusByCategory(menus, categories, nowMs);
  const liveChildrenByRoot = new Map<string, DeliveryMenuAdminRow[]>();
  for (const m of menus) {
    if (m.parent_id == null || !isChildMenuShownAsTab(m, nowMs)) continue;
    const list = liveChildrenByRoot.get(m.parent_id) ?? [];
    list.push(m);
    liveChildrenByRoot.set(m.parent_id, list);
  }
  const uncovered: T[] = [];
  const allTabOnly: T[] = [];
  for (const s of stores) {
    if (!isCustomerVisibleStore(s)) continue;
    const root = s.store_category_id ? roots.get(s.store_category_id) : undefined;
    if (!root) {
      uncovered.push(s);
      continue;
    }
    const children = liveChildrenByRoot.get(root.id) ?? [];
    const inSomeTab = children.some((c) => storesForChildMenu(c, root.primary_category_id, [s]).length > 0);
    if (!inSomeTab) allTabOnly.push(s);
  }
  return { uncovered, allTabOnly };
}

/** 형제 순서 위/아래 이동 → PATCH `order` 페이로드 (sort_order = index*10) */
export function moveSiblingOrder(
  siblingIds: readonly string[],
  id: string,
  delta: -1 | 1
): { id: string; sort_order: number }[] | null {
  const idx = siblingIds.indexOf(id);
  const next = idx + delta;
  if (idx < 0 || next < 0 || next >= siblingIds.length) return null;
  const ids = [...siblingIds];
  [ids[idx], ids[next]] = [ids[next], ids[idx]];
  return ids.map((x, i) => ({ id: x, sort_order: i * 10 }));
}

/** ISO → datetime-local 입력값 (브라우저 현지 시간) */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local 입력값 → ISO (빈 값 = null = 상시) */
export function localInputToIso(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function deliveryMenuErrorText(code: string | null | undefined, ko: boolean): string {
  switch (code) {
    case "slug_taken":
      return ko ? "이미 사용 중인 주소(slug)입니다. 다른 값을 입력하세요." : "This slug is already in use.";
    case "primary_taken":
      return ko ? "이 1차 업종에는 이미 1단 메뉴가 있습니다." : "This category already has a top menu.";
    case "scope_mismatch":
      return ko
        ? "부모 1단의 1차 업종에 속한 2차 업종·매장만 연결할 수 있습니다."
        : "Only topics and stores in the parent menu's category can be linked.";
    case "depth_exceeded":
      return ko ? "메뉴는 2단까지만 만들 수 있습니다." : "Menus can only be two levels deep.";
    case "include_exclude_overlap":
      return ko ? "같은 매장을 개별 추가와 개별 제외에 함께 넣을 수 없습니다." : "A store cannot be both included and excluded.";
    case "name_required":
      return ko ? "메뉴 이름(한국어)을 입력하세요." : "Enter a menu name.";
    case "bad_request":
      return ko ? "입력값을 확인하세요 (이름·주소 형식)." : "Check the name and slug.";
    case "not_found":
      return ko ? "메뉴를 찾을 수 없습니다. 새로고침해 주세요." : "Menu not found. Refresh and try again.";
    case "forbidden":
      return ko ? "권한이 없습니다." : "Permission denied.";
    case "network_error":
      return ko ? "네트워크 오류입니다. 잠시 뒤 새로고침해 주세요." : "Network error. Try again shortly.";
    default:
      return ko ? "처리하지 못했습니다. 잠시 뒤 새로고침해 주세요." : "Something went wrong. Try again shortly.";
  }
}
