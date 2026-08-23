"use client";

/**
 * BROWSE presentation owner (SSOT).
 * Implementation currently lives in `StoreDeliveryRowCard` after hierarchy/badge cutover.
 * Import this owner at browse call sites — do not treat RowCard as shared HOME/BROWSE authority.
 */

export {
  StoreDeliveryRowCard as StoresBrowseStoreComparisonCard,
  browseItemToRowCard,
  homeFeedToRowCard,
  storeRowCardDataEqual,
  type StoreRowCardData,
} from "@/components/stores/home/StoreDeliveryRowCard";
