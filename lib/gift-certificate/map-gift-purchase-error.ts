/**
 * Map gift purchase API/RPC error codes to i18n keys (U2 buyer UX).
 * Never surface raw codes in UI — callers use safeT(key, fallback*).
 */

export type GiftPurchaseErrorCopyKey =
  | "gift_u2_err_insufficient"
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
  if (c === "product_not_found") return "gift_u2_err_not_found";
  if (c === "unauthorized" || c === "forbidden") return "gift_u2_err_unauthorized";
  if (UNAVAILABLE.has(c)) return "gift_u2_err_unavailable";
  return "gift_u2_err_generic";
}

export function giftPurchaseErrorFallbacks(key: GiftPurchaseErrorCopyKey): {
  fallbackKo: string;
  fallbackEn: string;
} {
  switch (key) {
    case "gift_u2_err_insufficient":
      return { fallbackKo: "Point가 부족합니다.", fallbackEn: "Not enough Point." };
    case "gift_u2_err_unavailable":
      return {
        fallbackKo: "현재 구매할 수 없는 상품권입니다.",
        fallbackEn: "This gift certificate is not available for purchase.",
      };
    case "gift_u2_err_not_found":
      return { fallbackKo: "상품권을 찾을 수 없습니다.", fallbackEn: "Gift certificate not found." };
    case "gift_u2_err_unauthorized":
      return { fallbackKo: "로그인이 필요합니다.", fallbackEn: "Sign in required." };
    default:
      return {
        fallbackKo: "구매에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        fallbackEn: "Purchase failed. Please try again.",
      };
  }
}
