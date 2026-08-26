/**
 * Map gift transfer API/RPC error codes to i18n keys (U3 friend gift UX).
 */

export type GiftTransferErrorCopyKey =
  | "gift_u3_err_not_friend"
  | "gift_u3_err_not_owner"
  | "gift_u3_err_gift_locked"
  | "gift_u3_err_not_transferable"
  | "gift_u3_err_already_accepted"
  | "gift_u3_err_generic";

export function mapGiftTransferErrorKey(code: string | null | undefined): GiftTransferErrorCopyKey {
  const c = String(code ?? "").trim().toLowerCase();
  if (!c) return "gift_u3_err_generic";
  if (c.includes("not_friend") || c.includes("not_friend_contact") || c === "not_general_direct") {
    return "gift_u3_err_not_friend";
  }
  if (c.includes("not_owner") || c.includes("forbidden")) return "gift_u3_err_not_owner";
  if (c.includes("locked") || c.includes("pending") || c.includes("gift_locked")) {
    return "gift_u3_err_gift_locked";
  }
  if (c.includes("not_transferable") || c.includes("transferable")) {
    return "gift_u3_err_not_transferable";
  }
  if (c.includes("already_accepted") || c.includes("accepted")) {
    return "gift_u3_err_already_accepted";
  }
  return "gift_u3_err_generic";
}

export function giftTransferErrorFallbacks(key: GiftTransferErrorCopyKey): {
  fallbackKo: string;
  fallbackEn: string;
} {
  switch (key) {
    case "gift_u3_err_not_friend":
      return {
        fallbackKo: "친구에게만 상품권을 선물할 수 있습니다.",
        fallbackEn: "You can only send gift certificates to friends.",
      };
    case "gift_u3_err_not_owner":
      return {
        fallbackKo: "더 이상 보유 중인 상품권이 아닙니다.",
        fallbackEn: "You no longer own this gift certificate.",
      };
    case "gift_u3_err_gift_locked":
      return {
        fallbackKo: "이미 수령 대기 중인 상품권입니다.",
        fallbackEn: "This gift is already awaiting accept.",
      };
    case "gift_u3_err_not_transferable":
      return {
        fallbackKo: "선물할 수 없는 상품권입니다.",
        fallbackEn: "This gift certificate can’t be transferred.",
      };
    case "gift_u3_err_already_accepted":
      return {
        fallbackKo: "이미 수령된 상품권입니다.",
        fallbackEn: "This gift was already accepted.",
      };
    default:
      return {
        fallbackKo: "상품권 선물에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        fallbackEn: "Couldn’t send the gift. Please try again.",
      };
  }
}
