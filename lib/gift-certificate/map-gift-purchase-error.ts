/**
 * Map gift purchase API/RPC error codes to i18n keys (U2 buyer UX).
 * Never surface raw codes in UI — callers use safeT(key, giftPurchaseErrorFallbacks(key)).
 */

export type GiftPurchaseErrorCopyKey =
  | "gift_u2_err_insufficient"
  | "gift_u2_err_apple_restricted"
  | "gift_u2_err_unavailable"
  | "gift_u2_err_not_found"
  | "gift_u2_err_unauthorized"
  | "gift_u2_err_generic";

const UNAVAILABLE = new Set([
  "product_inactive",
  "product_mall_hidden",
  "sales_not_started",
  "sales_ended",
  "max_issuance_reached",
  "invalid_price",
  "not_purchasable",
]);

export function mapGiftPurchaseErrorKey(code: string | null | undefined): GiftPurchaseErrorCopyKey {
  const c = String(code ?? "").trim();
  if (!c) return "gift_u2_err_generic";
  if (c === "insufficient_balance") return "gift_u2_err_insufficient";
  if (c === "point_apple_funds_restricted") return "gift_u2_err_apple_restricted";
  if (c === "product_not_found") return "gift_u2_err_not_found";
  if (c === "unauthorized" || c === "forbidden") return "gift_u2_err_unauthorized";
  if (UNAVAILABLE.has(c)) return "gift_u2_err_unavailable";
  return "gift_u2_err_generic";
}

/** Apple 충전분 제한 안내용 금액 (API 402 응답의 total_points / usable_points) */
export type GiftPurchaseErrorAmounts = { total: number; usable: number };

export function readGiftPurchaseErrorAmounts(json: unknown): GiftPurchaseErrorAmounts | null {
  if (!json || typeof json !== "object") return null;
  const row = json as Record<string, unknown>;
  const total = Number(row.total_points);
  const usable = Number(row.usable_points);
  if (!Number.isFinite(total) || !Number.isFinite(usable)) return null;
  return { total: Math.trunc(total), usable: Math.max(0, Math.trunc(usable)) };
}

/**
 * `safeT(key, …)` 두 번째 인자 — 문구는 카탈로그(`gift_u2_err_*`)만 쓴다(B4 대체 문구 제거).
 * Apple 충전분 제한 안내만 금액 치환값을 넘긴다.
 */
export function giftPurchaseErrorFallbacks(
  key: GiftPurchaseErrorCopyKey,
  amounts?: GiftPurchaseErrorAmounts | null
): {
  vars?: Record<string, string | number>;
} {
  if (key !== "gift_u2_err_apple_restricted") return {};
  const total = (amounts?.total ?? 0).toLocaleString("en-US");
  const usable = (amounts?.usable ?? 0).toLocaleString("en-US");
  return { vars: { total, usable } };
}
