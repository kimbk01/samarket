import { resolveStoreFrontCommerceState } from "@/lib/stores/store-auto-hours";
import { resolveStoreFrontOrderable } from "@/lib/stores/store-point-commerce-block";

/** DB candidate gate — home-feed / browse RPC 와 동일 계약 */
export const STORE_DISCOVERY_CANDIDATE_APPROVAL_STATUS = "approved" as const;

export type StoreDiscoveryEligibilityState =
  | "orderable_deliverable"
  | "open_delivery_disabled"
  | "open_out_of_range"
  | "resting"
  | "preparing"
  | "closed";

export type StoreDiscoveryBrowseDisplayStatus = "open" | "resting" | "closed" | "preparing";

export type StoreDiscoveryHomeDisplayStatus = "open" | "closed" | "preparing";

export type StoreDiscoveryEligibilityInput = {
  business_hours_json: unknown;
  is_open: boolean | null;
  point_commerce_blocked?: boolean | null;
  /**
   * DEF-70 — `store_sales_permissions` 판정 (목록 select LEFT embed → `flattenStoreListSalesPermission`).
   * `false` = 판매 중지·미승인 → 주문 불가, 임시 휴업과 같은 「closed」 표시·최하위 정렬.
   * `undefined`/`null` = 값을 읽지 않은 경로 — 기존 동작 유지.
   */
  sales_allowed?: boolean | null;
  /**
   * 묶음3-A S-02 — 샘플 매장(`stores.store_kind = 'sample'`). 판매 미승인이어도 「판매 중지」가 아니다:
   * 표시 상태·정렬은 영업시간 그대로, 주문만 불가(`orderable=false`). 실매장 판매 중지는 기존대로 closed·최하위.
   */
  is_sample_store?: boolean | null;
  delivery_available: boolean | null;
  distanceOutOfRange?: boolean;
  /** 테스트·결정적 평가용 — 생략 시 `new Date()` */
  now?: Date;
};

export type StoreDiscoveryEligibilityResult = {
  state: StoreDiscoveryEligibilityState;
  /** Lower = higher list priority */
  rank: number;
  orderable: boolean;
  inBreak: boolean;
  browseDisplayStatus: StoreDiscoveryBrowseDisplayStatus;
  homeDisplayStatus: StoreDiscoveryHomeDisplayStatus;
};

const ELIGIBILITY_RANK: Record<StoreDiscoveryEligibilityState, number> = {
  orderable_deliverable: 0,
  open_delivery_disabled: 1,
  open_out_of_range: 2,
  resting: 3,
  preparing: 4,
  closed: 5,
};

function isSampleStore(input: StoreDiscoveryEligibilityInput): boolean {
  return input.is_sample_store === true;
}

/** 실매장 판매 중지·미승인만 — 샘플은 판매 미승인이어도 여기 해당하지 않음 (S-02). */
function isSalesSuspended(input: StoreDiscoveryEligibilityInput): boolean {
  return input.sales_allowed === false && !isSampleStore(input);
}

function resolveCommerce(input: StoreDiscoveryEligibilityInput) {
  const now = input.now ?? new Date();
  const commerceState = resolveStoreFrontCommerceState(input.business_hours_json, input.is_open, now);
  /** 영업시간·포인트 차단 기준 영업 여부 (판매 권한 제외) — 샘플의 표시·정렬 기준 */
  const openByHours = resolveStoreFrontOrderable(commerceState.isOpenForCommerce, input);
  const orderable = !isSalesSuspended(input) && !isSampleStore(input) && openByHours;
  /** 표시·정렬용 — 샘플은 영업시간대로, 그 외는 orderable 과 같음 */
  const displayOpen = orderable || (isSampleStore(input) && openByHours);
  return { commerceState, orderable, displayOpen };
}

export function resolveStoreDiscoveryBrowseDisplayStatus(
  input: StoreDiscoveryEligibilityInput
): StoreDiscoveryBrowseDisplayStatus {
  const { commerceState, displayOpen } = resolveCommerce(input);
  if (displayOpen) return "open";
  if (isSalesSuspended(input)) return "closed";
  if (commerceState.inBreak) return "resting";
  if (!commerceState.isOpenForCommerce) return "closed";
  return "preparing";
}

export function resolveStoreDiscoveryHomeDisplayStatus(
  input: StoreDiscoveryEligibilityInput
): StoreDiscoveryHomeDisplayStatus {
  const { commerceState, displayOpen } = resolveCommerce(input);
  if (displayOpen) return "open";
  if (isSalesSuspended(input)) return "closed";
  if (commerceState.inBreak) return "preparing";
  if (!commerceState.isOpenForCommerce) return "closed";
  return "preparing";
}

/**
 * Canonical discovery eligibility — HOME/BROWSE 공통.
 * OPEN ≠ ORDERABLE ≠ DELIVERY_AVAILABLE ≠ SERVICEABLE
 */
export function resolveStoreDiscoveryEligibility(
  input: StoreDiscoveryEligibilityInput
): StoreDiscoveryEligibilityResult {
  const { commerceState, orderable, displayOpen } = resolveCommerce(input);
  const deliveryAvailable = input.delivery_available === true;
  const outOfRange = input.distanceOutOfRange === true;
  const browseDisplayStatus = resolveStoreDiscoveryBrowseDisplayStatus(input);
  const homeDisplayStatus = resolveStoreDiscoveryHomeDisplayStatus(input);

  let state: StoreDiscoveryEligibilityState;
  if (displayOpen && deliveryAvailable && !outOfRange) {
    state = "orderable_deliverable";
  } else if (displayOpen && !deliveryAvailable) {
    state = "open_delivery_disabled";
  } else if (displayOpen && outOfRange) {
    state = "open_out_of_range";
  } else if (isSalesSuspended(input)) {
    state = "closed";
  } else if (commerceState.inBreak) {
    state = "resting";
  } else if (!commerceState.isOpenForCommerce) {
    state = "closed";
  } else {
    state = "preparing";
  }

  return {
    state,
    rank: ELIGIBILITY_RANK[state],
    orderable,
    inBreak: commerceState.inBreak,
    browseDisplayStatus,
    homeDisplayStatus,
  };
}

export function compareStoreDiscoveryEligibilityRank(aRank: number, bRank: number): number {
  return aRank - bRank;
}
