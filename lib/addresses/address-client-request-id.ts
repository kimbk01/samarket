/**
 * POST /api/me/addresses 멱등용 client_request_id 생성·정규화 (ADDR-DATA-003).
 * DB: `user_addresses_user_client_request_uidx` (user_id, client_request_id) partial unique.
 */

export const USER_ADDRESS_CLIENT_REQUEST_UNIQUE_INDEX = "user_addresses_user_client_request_uidx";

export function normalizeAddressClientRequestId(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s.length > 128) return null;
  return s;
}

export function generateAddressClientRequestId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}
