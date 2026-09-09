/**
 * DIBAY DATA RESET — Store → Finance/Gift FK boundary inventory (B1).
 * Contract documentation for migration 20261213120000_data_reset_blocker_close_b1_b2_fk.
 * Not an executor.
 */

export type StoreFkOnDeletePolicy = "RESTRICT" | "CASCADE" | "SET NULL";

export type StoreFkBoundaryRow = {
  childTable: string;
  column: string;
  layer: "identity" | "operating" | "historical" | "finance_gift";
  onDelete: StoreFkOnDeletePolicy;
  notes: string;
};

/** After B1 migration — finance/gift/historical RESTRICT; operating may stay CASCADE. */
export const STORE_FK_BOUNDARY_AFTER_B1: readonly StoreFkBoundaryRow[] = [
  {
    childTable: "gift_certificate_instances",
    column: "store_id",
    layer: "finance_gift",
    onDelete: "RESTRICT",
    notes: "Gift value — store row delete forbidden while instances exist",
  },
  {
    childTable: "gift_certificate_redemptions",
    column: "store_id",
    layer: "finance_gift",
    onDelete: "RESTRICT",
    notes: "Redemption history",
  },
  {
    childTable: "store_cash_accounts",
    column: "store_id",
    layer: "finance_gift",
    onDelete: "RESTRICT",
    notes: "Gift Store Cash account",
  },
  {
    childTable: "store_cash_ledger",
    column: "store_id",
    layer: "finance_gift",
    onDelete: "RESTRICT",
    notes: "Gift Store Cash ledger",
  },
  {
    childTable: "store_economic_point_accounts",
    column: "store_id",
    layer: "finance_gift",
    onDelete: "RESTRICT",
    notes: "AST-004 Coin account",
  },
  {
    childTable: "store_economic_point_ledger",
    column: "store_id",
    layer: "finance_gift",
    onDelete: "RESTRICT",
    notes: "AST-004 Coin ledger",
  },
  {
    childTable: "business_cash_accounts",
    column: "store_id",
    layer: "finance_gift",
    onDelete: "RESTRICT",
    notes: "AST-005 Business Cash",
  },
  {
    childTable: "business_cash_ledger",
    column: "store_id",
    layer: "finance_gift",
    onDelete: "RESTRICT",
    notes: "AST-005 ledger",
  },
  {
    childTable: "sale_fee_obligations",
    column: "store_id",
    layer: "finance_gift",
    onDelete: "RESTRICT",
    notes: "Fee history",
  },
  {
    childTable: "store_orders",
    column: "store_id",
    layer: "historical",
    onDelete: "RESTRICT",
    notes: "Historical transactions — STORE ROW DELETE blocked if orders exist",
  },
  {
    childTable: "store_settlements",
    column: "store_id",
    layer: "finance_gift",
    onDelete: "RESTRICT",
    notes: "Settlements preserved",
  },
  {
    childTable: "store_products",
    column: "store_id",
    layer: "operating",
    onDelete: "CASCADE",
    notes: "Operating catalog — CASCADE OK for product-only wipe under store identity",
  },
] as const;

export const STORE_ROW_DELETE_WHEN_FINANCE_PRESENT = "FORBIDDEN" as const;
export const STORE_IDENTITY_DEFAULT_RESET_MODE = "ARCHIVE_OR_RESET_STATE" as const;
