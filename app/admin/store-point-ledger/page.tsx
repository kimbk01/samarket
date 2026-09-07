import { redirect } from "next/navigation";

/**
 * AD-P0 / STEP 13 — Legacy AST-002 store_point_ledger ops menu removed.
 * Canonical Coin ledger lives under /admin/finance (store_economic_point_ledger).
 * Historical rows are not deleted.
 */
export default function AdminStorePointLedgerRoute() {
  redirect("/admin/finance/transactions?wallet=COIN");
}
