/**
 * Pure preferred-store picker — no sessionStorage, listeners, or network.
 */
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { computeOwnerCanSell } from "@/lib/delivery/owner/owner-lite-store-shortcuts";

export function pickPreferredOwnerStore(stores: StoreRow[]): StoreRow | null {
  if (stores.length === 0) return null;
  return (
    stores.find(
      (store) =>
        String(store.approval_status) === "approved" &&
        store.is_visible === true &&
        computeOwnerCanSell(store.sales_permission)
    ) ??
    stores.find((store) => String(store.approval_status) === "approved") ??
    stores[0] ??
    null
  );
}
