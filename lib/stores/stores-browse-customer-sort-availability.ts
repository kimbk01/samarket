import type { StoreBrowseServerSortId } from "@/lib/stores/store-discovery-browse-sort";

export type StoresBrowseCustomerSortAvailability = {
  popular: boolean;
  rating: boolean;
  distance: boolean;
};

export const STORES_BROWSE_CUSTOMER_SORT_AVAILABILITY_DEFAULT: StoresBrowseCustomerSortAvailability =
  {
    popular: true,
    rating: true,
    distance: true,
  };

export function parseStoresBrowseCustomerSortAvailability(
  raw: unknown
): StoresBrowseCustomerSortAvailability | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    popular: o.popular !== false,
    rating: o.rating !== false,
    distance: o.distance !== false,
  };
}

export function customerSortAvailabilityFromProductConfig(
  cfg: Record<string, unknown> | null | undefined
): StoresBrowseCustomerSortAvailability | null {
  if (!cfg || typeof cfg !== "object") return null;
  if (!("customerSortAvailability" in cfg)) return null;
  return parseStoresBrowseCustomerSortAvailability(cfg.customerSortAvailability);
}

export function resolveStoresBrowseCustomerSortAvailability(
  parsed: StoresBrowseCustomerSortAvailability | null | undefined
): StoresBrowseCustomerSortAvailability {
  return parsed ?? { ...STORES_BROWSE_CUSTOMER_SORT_AVAILABILITY_DEFAULT };
}

/** Disabled chip in URL → 기본순. reviews/fast unchanged (not customer chips). */
export function coerceBrowseSortToCustomerAvailability(
  sort: StoreBrowseServerSortId,
  availability: StoresBrowseCustomerSortAvailability
): StoreBrowseServerSortId {
  if (sort === "popular" && !availability.popular) return "default";
  if (sort === "rating" && !availability.rating) return "default";
  if (sort === "distance" && !availability.distance) return "default";
  return sort;
}
