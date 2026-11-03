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
  store: { ko: "매장 개별 정책", en: "Store override" },
  topic: { ko: "2차 업종 정책", en: "Secondary category" },
  category: { ko: "1차 업종 정책", en: "Primary category" },
  default: { ko: "기본", en: "Default" },
  missing_policy: { ko: "정책 없음", en: "Missing policy" },
};

export function commissionPolicyScopeLabel(scope: string | null | undefined, lang: AppLanguageCode): string | null {
  const s = String(scope ?? "").trim();
  if (!s) return null;
  const hit = POLICY_SCOPE_LABEL[s];
  return hit ? (lang === "en" ? hit.en : hit.ko) : s;
}
