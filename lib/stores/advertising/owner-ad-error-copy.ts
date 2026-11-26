/**
 * 사장님 배달 광고 신청·제출 실패 → 안내 문구 키 단일 정의 (광고 감사 SA-04 · 2026-11-26).
 *
 * 예전 두 화면(배너·매장 홍보)은 「요금이 변경되었습니다」 또는 「처리에 실패했습니다」 둘로 뭉갰다 —
 * 서버가 견적 실패마다 `refreshQuote` 를 붙여서 자리 없음·판매 중지·신청 받기 끔이 모두 「요금이 변경」으로 보였다.
 * 상단 배너 자리 없음(`capacity_full`)은 전용 문구가 없어 「처리에 실패」였다.
 */
import type { MessageKey } from "@/lib/i18n/messages";

const QUOTE_ERROR_KEY: Record<string, MessageKey> = {
  applications_paused: "owner_ads_error_applications_paused",
  product_disabled: "owner_ads_error_applications_paused",
  package_disabled: "owner_ads_error_package_unavailable",
  price_not_configured: "owner_ads_error_package_unavailable",
  invalid_duration: "owner_ads_error_package_unavailable",
  placement_not_sellable: "owner_ads_error_placement_unavailable",
  inventory_product_mismatch: "owner_ads_error_placement_unavailable",
};

const ERROR_KEY: Record<string, MessageKey> = {
  ios_digital_purchase_unavailable: "owner_ios_cash_purchase_unavailable",
  inventory: "owner_ads_error_inventory",
  store: "owner_ads_error_store",
  quote_stale: "owner_ads_error_quote_stale",
  applications_paused: "owner_ads_error_applications_paused",
  no_packages: "owner_ads_no_sellable_packages",
  capacity_full: "owner_ads_error_capacity_full",
  capacity_check_failed: "owner_ads_error_check_failed",
  home_ads_disabled: "owner_ads_error_placement_unavailable",
  category_ads_disabled: "owner_ads_error_placement_unavailable",
  placement_not_sellable: "owner_ads_error_placement_unavailable",
  period_ended: "owner_ads_error_period_ended",
  INSUFFICIENT_BUSINESS_CASH: "owner_ads_funding_insufficient",
  INSUFFICIENT_STORE_CASH: "owner_ads_funding_insufficient",
};

export function ownerAdErrorKey(code: string | null | undefined, quoteError?: string | null): MessageKey | null {
  const c = String(code ?? "").trim();
  if (!c) return null;
  if (c === "quote_unavailable") {
    return QUOTE_ERROR_KEY[String(quoteError ?? "").trim()] ?? "owner_ads_error_package_unavailable";
  }
  /** 화면이 견적 실패 세부 코드(`quoteError`)를 그대로 넘겨도 같은 문구 */
  return ERROR_KEY[c] ?? QUOTE_ERROR_KEY[c] ?? "owner_ads_error_generic";
}
