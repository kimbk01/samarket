/**
 * 수수료 표·상세의 주문 상태·결제 방법·정책 범위 한국어 표기 (실기 O-2 발견 결함 1 · Owner 「1·2·4·6 수정」 2026-11-04).
 * 이전: DB 값(`preparing`·`cod`·`category`)을 그대로 출력.
 * 새 문구를 만들지 않는다 — 주문 상태 = `processStatusLabel`(주문 화면과 같은 말), 결제 = `labelCheckoutPaymentMethod`,
 * 정책 범위 = 관리자 수수료 정책 화면 문구(`admin_stores_fee_reason_*`·`admin_stores_fee_scope_default`)와 같은 말.
 * 모르는 값은 숨기지 않고 원래 값 그대로 보인다.
 */
import type { AppLanguageCode } from "@/lib/i18n/config";
import { processStatusLabel } from "@/lib/stores/store-order-process-model";
import { labelCheckoutPaymentMethod } from "@/lib/stores/payment-methods-config";
import { catalogPair } from "@/lib/i18n/catalog-pair";

/** 배달·픽업 구분을 못 읽은 줄은 배달 기준 표기 (수수료는 배달 주문이 대부분 · 상태 이름 대부분 공통) */
const DEFAULT_FULFILLMENT = "local_delivery";

export function commissionOrderStatusLabel(
  orderStatus: string | null | undefined,
  fulfillmentType: string | null | undefined,
  lang: AppLanguageCode
): string {
  const s = String(orderStatus ?? "").trim();
  if (!s) return "—";
  return processStatusLabel(s, String(fulfillmentType ?? "").trim() || DEFAULT_FULFILLMENT, "owner_badge", lang);
}

export function commissionPaymentMethodLabel(paymentMethod: string | null | undefined, lang: AppLanguageCode): string | null {
  const p = String(paymentMethod ?? "").trim();
  return p ? labelCheckoutPaymentMethod(p, lang) : null;
}

/** 「주문 상태 · 결제 방법」 한 줄 */
export function commissionOrderStatusLine(
  row: { orderStatus: string; paymentMethod: string | null; fulfillmentType?: string | null },
  lang: AppLanguageCode
): string {
  const pm = commissionPaymentMethodLabel(row.paymentMethod, lang);
  return [commissionOrderStatusLabel(row.orderStatus, row.fulfillmentType, lang), pm].filter(Boolean).join(" · ");
}

const POLICY_SCOPE_LABEL: Record<string, { ko: string; en: string }> = {
  store: catalogPair("stores_store_override"),
  topic: catalogPair("stores_secondary_category"),
  category: catalogPair("stores_primary_category"),
  default: catalogPair("stores_default"),
  missing_policy: catalogPair("stores_missing_policy"),
};

export function commissionPolicyScopeLabel(scope: string | null | undefined, lang: AppLanguageCode): string | null {
  const s = String(scope ?? "").trim();
  if (!s) return null;
  const hit = POLICY_SCOPE_LABEL[s];
  return hit ? (lang === "en" ? hit.en : hit.ko) : s;
}

/**
 * 사장님 화면 「수수료 환급」 상태 칩 이름 — 실제 처리대로 (F-3 · Owner 확정 「일반 권장안」 2026-11-04).
 * 환급 승인 금액은 캐시 환급(`cashRefundMinor`)과 미납 취소(`outstandingCancelMinor`)로 나뉜다(1단계 10937bf1a 의 두 칸과 같은 값).
 * 관리자 화면은 쓰지 않는다(이름 「수수료 환급」 유지). 두 값이 모두 0 이면 null → 호출처가 기존 이름을 쓴다.
 */
export function commissionOwnerRefundedLabel(
  decision: { cashRefundMinor?: number | null; outstandingCancelMinor?: number | null } | null | undefined,
  lang: AppLanguageCode
): string | null {
  const cash = Number(decision?.cashRefundMinor ?? 0) > 0;
  const cancel = Number(decision?.outstandingCancelMinor ?? 0) > 0;
  const en = lang === "en";
  if (cash && cancel) return en ? "Cash refunded · Unpaid cancelled" : "Cash 환급·미납 취소";
  if (cash) return en ? "Cash refunded" : "Cash 환급";
  if (cancel) return en ? "Unpaid cancelled" : "미납 취소";
  return null;
}
