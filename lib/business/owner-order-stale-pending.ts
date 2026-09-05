/**
 * Stale pending order classification — does NOT hide elapsed time.
 *
 * Root cause (confirmed): OWNER pending has no SYSTEM TTL/auto-cancel.
 * Accept-reminders notify only. Orders stay pending until owner accept/cancel
 * (or detail auto-accept). Multi-day elapsed (e.g. 1422h) = real unattended pending,
 * not mock data and not a display bug.
 *
 * Policy: represent clearly + owner must act; do not invent silent cancel here.
 */

export const OWNER_STALE_PENDING_SOFT_MS = 3 * 60 * 1000;
/** Attention threshold — unattended pending beyond one calendar day. */
export const OWNER_STALE_PENDING_DAY_MS = 24 * 60 * 60 * 1000;
/** Historical orphan attention — multi-week unattended pending. */
export const OWNER_STALE_PENDING_ORPHAN_MS = 7 * 24 * 60 * 60 * 1000;

export type OwnerOrderStaleClass =
  | "none"
  | "attention_pending"
  | "stale_pending"
  | "orphan_pending";

export function classifyOwnerOrderStalePending(input: {
  orderStatus: string;
  createdAt: string;
  nowMs?: number;
}): {
  class: OwnerOrderStaleClass;
  ageMs: number;
  ageHours: number;
} {
  const status = String(input.orderStatus ?? "").trim().toLowerCase();
  const created = new Date(input.createdAt).getTime();
  const now = input.nowMs ?? Date.now();
  if (!Number.isFinite(created) || status !== "pending") {
    return { class: "none", ageMs: 0, ageHours: 0 };
  }
  const ageMs = Math.max(0, now - created);
  const ageHours = Math.floor(ageMs / (60 * 60 * 1000));
  if (ageMs >= OWNER_STALE_PENDING_ORPHAN_MS) {
    return { class: "orphan_pending", ageMs, ageHours };
  }
  if (ageMs >= OWNER_STALE_PENDING_DAY_MS) {
    return { class: "stale_pending", ageMs, ageHours };
  }
  if (ageMs >= OWNER_STALE_PENDING_SOFT_MS) {
    return { class: "attention_pending", ageMs, ageHours };
  }
  return { class: "none", ageMs, ageHours };
}
