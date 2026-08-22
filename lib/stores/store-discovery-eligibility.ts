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

function resolveCommerce(input: StoreDiscoveryEligibilityInput) {
  const now = input.now ?? new Date();
  const commerceState = resolveStoreFrontCommerceState(input.business_hours_json, input.is_open, now);
  const orderable = resolveStoreFrontOrderable(commerceState.isOpenForCommerce, input);
  return { commerceState, orderable };
}

export function resolveStoreDiscoveryBrowseDisplayStatus(
  input: StoreDiscoveryEligibilityInput
): StoreDiscoveryBrowseDisplayStatus {
  const { commerceState, orderable } = resolveCommerce(input);
  if (orderable) return "open";
  if (commerceState.inBreak) return "resting";
  if (!commerceState.isOpenForCommerce && input.point_commerce_blocked !== true) return "closed";
  return "preparing";
}

export function resolveStoreDiscoveryHomeDisplayStatus(
  input: StoreDiscoveryEligibilityInput
): StoreDiscoveryHomeDisplayStatus {
  const { commerceState, orderable } = resolveCommerce(input);
  if (orderable) return "open";
  if (commerceState.inBreak) return "preparing";
  if (!commerceState.isOpenForCommerce && input.point_commerce_blocked !== true) return "closed";
  return "preparing";
}

/**
 * Canonical discovery eligibility — HOME/BROWSE 공통.
 * OPEN ≠ ORDERABLE ≠ DELIVERY_AVAILABLE ≠ SERVICEABLE
 */
export function resolveStoreDiscoveryEligibility(
  input: StoreDiscoveryEligibilityInput
): StoreDiscoveryEligibilityResult {
  const { commerceState, orderable } = resolveCommerce(input);
  const deliveryAvailable = input.delivery_available === true;
  const outOfRange = input.distanceOutOfRange === true;
  const browseDisplayStatus = resolveStoreDiscoveryBrowseDisplayStatus(input);
  const homeDisplayStatus = resolveStoreDiscoveryHomeDisplayStatus(input);

  let state: StoreDiscoveryEligibilityState;
  if (orderable && deliveryAvailable && !outOfRange) {
    state = "orderable_deliverable";
  } else if (orderable && !deliveryAvailable) {
    state = "open_delivery_disabled";
  } else if (orderable && outOfRange) {
    state = "open_out_of_range";
  } else if (commerceState.inBreak) {
    state = "resting";
  } else if (!commerceState.isOpenForCommerce && input.point_commerce_blocked !== true) {
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
