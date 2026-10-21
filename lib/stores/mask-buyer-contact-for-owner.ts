/**
 * LOC-008 (=ORD-08) — buyer contact retention for the STORE OWNER view.
 *
 * Owner D-15 (recommended, 2026-10-20): buyer phone / detail address / coordinates are hidden from the owner
 * 30 days after the order ended. In-progress orders are untouched (delivery needs them).
 * - phone → every digit except the last 4 replaced by `*`
 * - detail address (`delivery_address_detail`, `delivery_detail_address`) → null
 * - coordinates (`delivery_latitude`, `delivery_longitude`) → null
 * Read-time masking only — stored rows are never changed (D-5). Admin views are NOT masked (permission).
 *
 * End time: `refunded_at` for refunded orders, otherwise `updated_at` (the last change is at or after the
 * terminal transition, so masking can start later but never earlier than 30 days after the end).
 */

export const OWNER_BUYER_CONTACT_RETENTION_DAYS = 30;

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "refunded"]);
const DAY_MS = 86_400_000;

export type OwnerBuyerContactRow = {
  order_status?: unknown;
  updated_at?: unknown;
  refunded_at?: unknown;
  buyer_phone?: unknown;
  delivery_address_detail?: unknown;
  delivery_detail_address?: unknown;
  delivery_latitude?: unknown;
  delivery_longitude?: unknown;
};

function parseMs(v: unknown): number | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

/** Terminal order whose end is more than 30 days before `now`. */
export function isOwnerBuyerContactExpired(row: OwnerBuyerContactRow, now: Date = new Date()): boolean {
  const status = String(row.order_status ?? "").trim().toLowerCase();
  if (!TERMINAL_STATUSES.has(status)) return false;
  const endMs =
    (status === "refunded" ? parseMs(row.refunded_at) : null) ?? parseMs(row.updated_at);
  if (endMs == null) return false;
  return now.getTime() - endMs > OWNER_BUYER_CONTACT_RETENTION_DAYS * DAY_MS;
}

/** `+639171234567` → `*********4567` (non-digits kept so the format stays readable). */
export function maskPhoneKeepLast4(phone: string): string {
  const totalDigits = (phone.match(/\d/g) ?? []).length;
  let seen = 0;
  return phone.replace(/\d/g, (d) => {
    seen += 1;
    return seen > totalDigits - 4 ? d : "*";
  });
}

/**
 * Returns the row unchanged while the order is in progress or within 30 days of its end;
 * otherwise a copy with phone masked and detail address / coordinates cleared + `buyer_contact_masked: true`.
 * Only keys present on the row are touched (list rows have no coordinates).
 */
export function maskBuyerContactForOwner<T extends object>(
  row: T,
  now: Date = new Date()
): T & { buyer_contact_masked?: true } {
  const r = row as OwnerBuyerContactRow;
  if (!isOwnerBuyerContactExpired(r, now)) return row;
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>), buyer_contact_masked: true };
  if (typeof r.buyer_phone === "string" && r.buyer_phone.trim()) {
    out.buyer_phone = maskPhoneKeepLast4(r.buyer_phone.trim());
  }
  for (const k of [
    "delivery_address_detail",
    "delivery_detail_address",
    "delivery_latitude",
    "delivery_longitude",
  ] as const) {
    if (k in out) out[k] = null;
  }
  return out as T & { buyer_contact_masked: true };
}
