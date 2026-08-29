/**
 * Customer Gift Mall / purchase eligibility — single SSOT.
 *
 * eligible_for_customer_purchase =
 *   active = true
 *   AND mall_visible = true (null/undefined treated as true; DB default true)
 *   AND archived_at IS NULL
 *   AND sales_starts_at <= now
 *   AND (sales_ends_at IS NULL OR sales_ends_at > now)
 *   AND (max_issuance IS NULL OR issued_count < max_issuance)
 *
 * Used by: Mall list, Mall detail-by-id, Admin customer-state projection.
 * Purchase RPC must enforce the same predicates (migration).
 */

export type GiftProductCustomerPurchaseRow = {
  active?: boolean | null;
  archived_at?: string | null;
  sales_starts_at?: string | null;
  sales_ends_at?: string | null;
  mall_visible?: boolean | null;
  max_issuance?: number | null;
  issued_count?: number | null;
};

/** @deprecated alias — use GiftProductCustomerPurchaseRow */
export type GiftProductCatalogRow = GiftProductCustomerPurchaseRow;

export type GiftCustomerPurchaseIneligibilityReason =
  | "paused"
  | "mall_hidden"
  | "archived"
  | "before_sales_start"
  | "after_sales_end"
  | "issuance_cap_reached";

export type GiftCustomerPurchaseEvaluation = {
  eligible: boolean;
  reason: GiftCustomerPurchaseIneligibilityReason | null;
};

export function evaluateGiftProductCustomerPurchaseEligibility(
  row: GiftProductCustomerPurchaseRow,
  nowMs: number = Date.now()
): GiftCustomerPurchaseEvaluation {
  if (row.active !== true) {
    return { eligible: false, reason: "paused" };
  }
  if (row.mall_visible === false) {
    return { eligible: false, reason: "mall_hidden" };
  }
  if (row.archived_at != null && String(row.archived_at).trim() !== "") {
    return { eligible: false, reason: "archived" };
  }
  const startMs = parseIsoMs(row.sales_starts_at);
  if (startMs != null && startMs > nowMs) {
    return { eligible: false, reason: "before_sales_start" };
  }
  const endMs = parseIsoMs(row.sales_ends_at);
  // Match purchase RPC: sales_ends_at > now (exclusive end)
  if (endMs != null && endMs <= nowMs) {
    return { eligible: false, reason: "after_sales_end" };
  }
  const maxIssuance =
    row.max_issuance == null || !Number.isFinite(Number(row.max_issuance))
      ? null
      : Math.trunc(Number(row.max_issuance));
  const issued =
    row.issued_count == null || !Number.isFinite(Number(row.issued_count))
      ? 0
      : Math.trunc(Number(row.issued_count));
  if (maxIssuance != null && issued >= maxIssuance) {
    return { eligible: false, reason: "issuance_cap_reached" };
  }
  return { eligible: true, reason: null };
}

/** True when product may appear / be purchased in customer Gift Mall. */
export function isGiftProductCustomerCatalogEligible(
  row: GiftProductCustomerPurchaseRow,
  nowMs: number = Date.now()
): boolean {
  return evaluateGiftProductCustomerPurchaseEligibility(row, nowMs).eligible;
}

export function parseGiftProductIsoMs(iso: string | null | undefined): number | null {
  return parseIsoMs(iso);
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (iso == null || String(iso).trim() === "") return null;
  const ms = Date.parse(String(iso));
  return Number.isFinite(ms) ? ms : null;
}
