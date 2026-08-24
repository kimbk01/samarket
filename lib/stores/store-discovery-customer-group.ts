/**
 * Canonical customer-visible BROWSE grouping — projection of 6-stage eligibility.
 * Internal rank/state stay on `resolveStoreDiscoveryEligibility`. This module does not merge states.
 *
 * rank0 orderable_deliverable     → GROUP_A (orderable now for delivery)
 * rank1 open_delivery_disabled    → GROUP_B
 * rank2 open_out_of_range         → GROUP_B
 * rank3 resting                   → GROUP_B
 * rank4 preparing                 → GROUP_B
 * rank5 closed                    → GROUP_B
 *
 * Inactive/hidden/blocked never reach this map (candidate gate). Not the same as closed.
 */

export type StoreDiscoveryCustomerGroup = "A" | "B";

export function storeDiscoveryCustomerGroupFromEligibilityRank(
  rank: number
): StoreDiscoveryCustomerGroup {
  return rank === 0 ? "A" : "B";
}

export function compareStoreDiscoveryCustomerGroup(aRank: number, bRank: number): number {
  const ag = storeDiscoveryCustomerGroupFromEligibilityRank(aRank);
  const bg = storeDiscoveryCustomerGroupFromEligibilityRank(bRank);
  if (ag === bg) return 0;
  return ag === "A" ? -1 : 1;
}

export const STORE_DISCOVERY_ELIGIBILITY_TO_CUSTOMER_GROUP = {
  rank0: "GROUP_A",
  rank1: "GROUP_B",
  rank2: "GROUP_B",
  rank3: "GROUP_B",
  rank4: "GROUP_B",
  rank5: "GROUP_B",
} as const;
