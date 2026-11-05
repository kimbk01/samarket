/**
 * Map gift purchase API/RPC error codes to i18n keys (U2 buyer UX).
 * Never surface raw codes in UI — callers use safeT(key, fallback*).
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

export function giftPurchaseErrorFallbacks(
  key: GiftPurchaseErrorCopyKey,
  amounts?: GiftPurchaseErrorAmounts | null
): {
  fallbackKo: string;
  fallbackEn: string;
  vars?: Record<string, string | number>;
} {
  switch (key) {
    case "gift_u2_err_insufficient":
      return { fallbackKo: "Point가 부족합니다.", fallbackEn: "Not enough Point." };
    case "gift_u2_err_apple_restricted": {
      const total = (amounts?.total ?? 0).toLocaleString("en-US");
      const usable = (amounts?.usable ?? 0).toLocaleString("en-US");
      return {
        fallbackKo: `보유 Point ${total}P 중 이 결제에 사용할 수 있는 Point는 ${usable}P입니다. Apple 결제로 충전한 Point는 광고·홍보에만 사용할 수 있습니다.`,
        fallbackEn: `You have ${total}P, of which ${usable}P can be used for this payment. Point charged through Apple can only be used for ads and promotions.`,
        vars: { total, usable },
      };
    }
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
