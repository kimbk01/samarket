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

/** `safeT(key, …)` 두 번째 인자 — 문구는 카탈로그(`gift_u3_err_*`)만 쓴다(B4 대체 문구 제거). */
export function giftTransferErrorFallbacks(key: GiftTransferErrorCopyKey): {
  vars?: Record<string, string | number>;
} {
  void key;
  return {};
}
