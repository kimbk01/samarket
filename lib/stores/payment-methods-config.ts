import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { coerceBusinessHoursRecord } from "@/lib/stores/coerce-business-hours-json";

/**
 * 코어 결제 코드 (매장 폼: GCash / 만나서 현금 / 계좌이체 / 기타·직접입력).
 * DB `buyer_payment_method` 및 주문 API `payment_method`와 동일.
 */
export const ORDER_CHECKOUT_CORE_IDS = ["cod", "gcash", "bank_transfer", "other"] as const;
export type OrderCheckoutCorePaymentId = (typeof ORDER_CHECKOUT_CORE_IDS)[number];

/** JSON에서만 옵션으로 켤 수 있는 추가 수단 */
export type OrderCheckoutPaymentId = OrderCheckoutCorePaymentId | "card_on_delivery";

const ORDER_CHECKOUT_ID_SET = new Set<string>([...ORDER_CHECKOUT_CORE_IDS, "card_on_delivery"]);

const CHECKOUT_PAYMENT_LABEL_KEYS: Record<string, MessageKey> = {
  cod: "store_pay_label_cod",
  gcash: "store_pay_label_gcash",
  bank_transfer: "store_pay_label_bank_transfer",
  other: "store_pay_label_other",
  card_on_delivery: "store_pay_label_card_on_delivery",
};

export type PaymentMethodsFormValues = {
  payMethodGcash: boolean;
  payMethodCashMeet: boolean;
  payMethodBank: boolean;
  /** 기타 사용 시 자유 입력 */
  payMethodOtherEnabled: boolean;
  payMethodOtherText: string;
};

export function readPaymentMethodsFormValues(raw: unknown): PaymentMethodsFormValues {
  const o = coerceBusinessHoursRecord(raw);
  const cfg = o.payment_methods_config ?? o.paymentMethodsConfig;
  if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) {
    const r = cfg as Record<string, unknown>;
    const other =
      typeof r.other_note === "string"
        ? r.other_note.trim()
        : typeof r.otherNote === "string"
          ? r.otherNote.trim()
          : "";
    const otherOn =
      r.other_enabled === true || r.otherEnabled === true || Boolean(other);
    return {
      payMethodGcash: r.gcash === true,
      payMethodCashMeet: r.cash_meet === true || r.cashMeet === true,
      payMethodBank: r.bank_transfer === true || r.bankTransfer === true,
      payMethodOtherEnabled: otherOn,
      payMethodOtherText: other,
    };
  }
  const line = String(o.payment_methods ?? o.paymentMethods ?? "").trim();
  if (line) {
    return {
      payMethodGcash: false,
      payMethodCashMeet: false,
      payMethodBank: false,
      payMethodOtherEnabled: true,
      payMethodOtherText: line,
    };
  }
  return {
    payMethodGcash: false,
    payMethodCashMeet: false,
    payMethodBank: false,
    payMethodOtherEnabled: false,
    payMethodOtherText: "",
  };
}

export function labelCheckoutPaymentMethod(
  id: string,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  const key = CHECKOUT_PAYMENT_LABEL_KEYS[id];
  return key ? translate(lang, key) : id;
}

/** @deprecated `labelCheckoutPaymentMethod` 사용 */
export const labelCheckoutPaymentMethodKo = labelCheckoutPaymentMethod;

/** 표시·저장 겸용 한 줄 ( · 구분) */
export function formatPaymentMethodsDisplayLine(
  v: PaymentMethodsFormValues,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  const parts: string[] = [];
  if (v.payMethodGcash) parts.push(translate(lang, "store_pay_label_gcash"));
  if (v.payMethodCashMeet) parts.push(translate(lang, "store_pay_display_cash_meet"));
  if (v.payMethodBank) parts.push(translate(lang, "store_pay_label_bank_transfer"));
  if (v.payMethodOtherEnabled) {
    const custom = v.payMethodOtherText.trim();
    parts.push(custom || translate(lang, "store_pay_label_other"));
  }
  return parts.join(" · ");
}

export function paymentMethodsConfigPayload(v: PaymentMethodsFormValues): Record<string, unknown> | null {
  const hasAny =
    v.payMethodGcash ||
    v.payMethodCashMeet ||
    v.payMethodBank ||
    v.payMethodOtherEnabled;
  if (!hasAny) return null;
  const other = v.payMethodOtherText.trim();
  return {
    gcash: v.payMethodGcash,
    cash_meet: v.payMethodCashMeet,
    bank_transfer: v.payMethodBank,
    other_enabled: v.payMethodOtherEnabled,
    ...(other ? { other_note: other } : {}),
  };
}

/** JSON 레코드에서 결제 안내 한 줄 (고객 화면) */
export function paymentMethodsLineFromBusinessRecord(
  o: Record<string, unknown>,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  const cfg = o.payment_methods_config ?? o.paymentMethodsConfig;
  if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) {
    const r = cfg as Record<string, unknown>;
    const parts: string[] = [];
    if (r.gcash === true) parts.push(translate(lang, "store_pay_label_gcash"));
    if (r.cash_meet === true || r.cashMeet === true) {
      parts.push(translate(lang, "store_pay_display_cash_meet"));
    }
    if (r.bank_transfer === true || r.bankTransfer === true) {
      parts.push(translate(lang, "store_pay_label_bank_transfer"));
    }
    const other =
      typeof r.other_note === "string"
        ? r.other_note.trim()
        : typeof r.otherNote === "string"
          ? r.otherNote.trim()
          : "";
    const otherOn = r.other_enabled === true || r.otherEnabled === true;
    if (other) parts.push(other);
    else if (otherOn) parts.push(translate(lang, "store_pay_label_other"));
    if (parts.length) return parts.join(" · ");
  }
  return String(o.payment_methods ?? o.paymentMethods ?? "").trim();
}

/**
 * 매장 프로필의 결제 체크박스 → 주문 화면에서 노출할 방법 id 목록.
 * 아무 것도 체크되지 않으면 코어 4종 전부 노출(기존 매장 하위 호환).
 */
export function effectiveCheckoutPaymentMethodIdsForCart(
  businessHoursJson: unknown
): OrderCheckoutPaymentId[] {
  const v = readPaymentMethodsFormValues(businessHoursJson);
  const ids: OrderCheckoutPaymentId[] = [];
  if (v.payMethodCashMeet) ids.push("cod");
  if (v.payMethodGcash) ids.push("gcash");
  if (v.payMethodBank) ids.push("bank_transfer");
  if (v.payMethodOtherEnabled) ids.push("other");
  const o = coerceBusinessHoursRecord(businessHoursJson);
  const cfg = (o.payment_methods_config ?? o.paymentMethodsConfig) as
    | Record<string, unknown>
    | undefined;
  if (cfg && typeof cfg === "object") {
    if (cfg.card_on_delivery === true || cfg.cardOnDelivery === true) {
      ids.push("card_on_delivery");
    }
  }
  if (ids.length === 0) {
    return [...ORDER_CHECKOUT_CORE_IDS];
  }
  return ids;
}

export function isKnownCheckoutPaymentMethodId(id: string): boolean {
  return ORDER_CHECKOUT_ID_SET.has(id);
}

/** 장바구니에서 매장이 입력한 기타 라벨 (없으면 카탈로그 "기타") */
export function otherPaymentMethodLabelFromConfig(
  businessHoursJson: unknown,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  const custom = readPaymentMethodsFormValues(businessHoursJson).payMethodOtherText.trim();
  return custom || translate(lang, "store_pay_label_other");
}

/** 카트 라디오용: id + 화면 라벨(기타는 매장 입력 문구) */
export function checkoutPaymentOptionsForCart(
  businessHoursJson: unknown,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): { id: OrderCheckoutPaymentId; label: string }[] {
  const ids = effectiveCheckoutPaymentMethodIdsForCart(businessHoursJson);
  const safe = ids.length > 0 ? ids : [...ORDER_CHECKOUT_CORE_IDS];
  const otherLbl = otherPaymentMethodLabelFromConfig(businessHoursJson, lang);
  return safe.map((id) => ({
    id,
    label: id === "other" ? otherLbl : labelCheckoutPaymentMethod(id, lang),
  }));
}

/** 주문 목록·상세·관리자 표시용 */
export function formatBuyerPaymentDisplay(
  method: string | null | undefined,
  detail: string | null | undefined,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  const m = (method ?? "").trim();
  if (!m) return "—";
  if (m === "other") {
    const d = (detail ?? "").trim();
    return d || translate(lang, "store_pay_label_other");
  }
  return labelCheckoutPaymentMethod(m, lang);
}
