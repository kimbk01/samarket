import type { StoreRow } from "@/lib/stores/db-store-mapper";

export function storeRowCanSell(row: StoreRow): boolean {
  return (
    !!row.sales_permission &&
    row.sales_permission.allowed_to_sell === true &&
    row.sales_permission.sales_status === "approved"
  );
}
