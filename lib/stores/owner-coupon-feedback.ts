import type { MessageKey } from "@/lib/i18n/messages";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import type { OwnerCouponDetailAction } from "@/lib/stores/owner-coupon-list-bucket";

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** 3-C IA-06 — 오너 쿠폰 PATCH/POST 오류 코드 → 화면 문구 (그 외 코드는 공용 오너 API 오류 문구). */
const COUPON_ERROR_KEYS: Record<string, MessageKey> = {
  invalid_transition: "store_coupon_owner_err_invalid_transition",
  admin_paused_resume_forbidden: "store_coupon_owner_err_admin_paused",
  unsupported_max_uses: "store_coupon_owner_err_unsupported_max_uses",
  owner_platform_offer_readonly: "store_coupon_owner_err_readonly",
  reissue_source_blocked: "store_coupon_owner_err_reissue_blocked",
  db_error: "store_coupon_owner_err_failed",
  missing_client_request_id: "store_coupon_owner_err_failed",
  invalid_action: "store_coupon_owner_err_failed",
};

export function ownerCouponErrorMessage(code: string | null | undefined, t: TranslateFn): string {
  const raw = String(code ?? "").trim();
  const key = COUPON_ERROR_KEYS[raw];
  if (key) return t(key);
  return raw ? resolveOwnerApiErrorMessage(raw, t) : t("store_coupon_owner_err_failed");
}

export function ownerCouponDoneMessageKey(action: OwnerCouponDetailAction): MessageKey {
  switch (action) {
    case "pause":
      return "store_coupon_owner_done_pause";
    case "resume":
      return "store_coupon_owner_done_resume";
    case "end":
      return "store_coupon_owner_done_end";
    default:
      return "store_coupon_owner_done_reissue";
  }
}

/** IA-05 — 재발행 확인창 1회분 고정 키 (같은 확인창의 재시도는 같은 키 → 서버가 기존 행 반환). */
export function newOwnerCouponClientRequestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `reissue-${c.randomUUID()}`;
  return `reissue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
