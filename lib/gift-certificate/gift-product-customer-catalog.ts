/**
 * Customer Gift Mall catalog eligibility — lifecycle fields only.
 *
 * SSOT fields on gift_certificate_products:
 * - active
 * - archived_at
 * - sales_starts_at / sales_ends_at
 * - gift_scope / store_id (scope binding)
 * - creation_source (provenance; not a visibility mask)
 *
 * No title substring / regex filtering. QA fixtures must be archived or
 * deactivated by harness cleanup — not hidden in presentation.
 */

export type GiftProductCatalogRow = {
  active?: boolean | null;
  archived_at?: string | null;
  sales_starts_at?: string | null;
  sales_ends_at?: string | null;
};

/** True when product may appear in customer Gift Mall catalog queries. */
export function isGiftProductCustomerCatalogEligible(
  row: GiftProductCatalogRow,
  nowMs: number = Date.now()
): boolean {
  if (row.active !== true) return false;
  if (row.archived_at != null && String(row.archived_at).trim() !== "") return false;
  const startMs = parseIsoMs(row.sales_starts_at);
  if (startMs != null && startMs > nowMs) return false;
  const endMs = parseIsoMs(row.sales_ends_at);
  if (endMs != null && endMs <= nowMs) return false;
  return true;
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (iso == null || String(iso).trim() === "") return null;
  const ms = Date.parse(String(iso));
  return Number.isFinite(ms) ? ms : null;
}
