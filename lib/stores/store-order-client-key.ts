/**
 * POST /api/me/store-orders 멱등용 client_order_key 생성·정규화.
 */

export function normalizeStoreOrderClientKey(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s.length > 128) return null;
  return s;
}

export function generateStoreOrderClientKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}
