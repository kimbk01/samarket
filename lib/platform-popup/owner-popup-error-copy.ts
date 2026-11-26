/**
 * 사장님 팝업 광고 신청 실패 → 안내 문구 키 단일 정의 (광고 감사 X-3·PP-03 · 2026-11-27).
 * 서버는 오류 코드만 돌려준다. 화면은 이 함수 하나로 문구를 고른다 — 오류 코드 원문은 보이지 않는다.
 */
import type { MessageKey } from "@/lib/i18n/messages";

const KEY_BY_CODE: Record<string, MessageKey> = {
  owner_platform_popup_new_sales_disabled: "owner_platform_popup_new_sales_disabled",
  INSUFFICIENT_BUSINESS_CASH: "owner_platform_popup_insufficient",
  INSUFFICIENT_STORE_CASH: "owner_platform_popup_insufficient",
};

export function ownerPopupErrorKey(code: string | null | undefined): MessageKey {
  return KEY_BY_CODE[String(code ?? "").trim()] ?? "owner_ads_error_generic";
}
