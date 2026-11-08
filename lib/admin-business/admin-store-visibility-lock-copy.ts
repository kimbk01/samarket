/**
 * v4 UI-04 — 관리자 노출 변경 확인창 설명 (O-04 관리자 숨김 잠금).
 * 관리자 숨김 = 잠금(오너가 다시 켤 수 없음) · 관리자 노출 켜기 = 잠금 해제.
 */

import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

export function adminStoreVisibilityLockConfirmCopy(nextVisible: boolean, ko: boolean): string {
  if (nextVisible) {
    return tx(ko, "admin_business_turning_visibility_on_also_clears_the");
  }
  return tx(ko, "admin_business_a_store_hidden_by_an_admin");
}
