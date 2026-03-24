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

/** 표시·저장 겸용 한 줄 ( · 구분) */
export function formatPaymentMethodsDisplayLine(v: PaymentMethodsFormValues): string {
  const parts: string[] = [];
  if (v.payMethodGcash) parts.push("GCash");
  if (v.payMethodCashMeet) parts.push("만나서 현금");
  if (v.payMethodBank) parts.push("계좌이체");
  if (v.payMethodOtherEnabled) {
    const t = v.payMethodOtherText.trim();
    parts.push(t || "기타");
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
export function paymentMethodsLineFromBusinessRecord(o: Record<string, unknown>): string {
  const cfg = o.payment_methods_config ?? o.paymentMethodsConfig;
  if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) {
    const r = cfg as Record<string, unknown>;
    const parts: string[] = [];
    if (r.gcash === true) parts.push("GCash");
    if (r.cash_meet === true || r.cashMeet === true) parts.push("만나서 현금");
    if (r.bank_transfer === true || r.bankTransfer === true) parts.push("계좌이체");
    const other =
      typeof r.other_note === "string"
        ? r.other_note.trim()
        : typeof r.otherNote === "string"
          ? r.otherNote.trim()
          : "";
    const otherOn = r.other_enabled === true || r.otherEnabled === true;
    if (other) parts.push(other);
    else if (otherOn) parts.push("기타");
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

/** 장바구니에서 매장이 입력한 기타 라벨 (없으면 "기타") */
export function otherPaymentMethodLabelFromConfig(businessHoursJson: unknown): string {
  const t = readPaymentMethodsFormValues(businessHoursJson).payMethodOtherText.trim();
  return t || "기타";
}

/** 카트 라디오용: id + 화면 라벨(기타는 매장 입력 문구) */
export function checkoutPaymentOptionsForCart(
  businessHoursJson: unknown
): { id: OrderCheckoutPaymentId; label: string }[] {
  const ids = effectiveCheckoutPaymentMethodIdsForCart(businessHoursJson);
  const safe = ids.length > 0 ? ids : [...ORDER_CHECKOUT_CORE_IDS];
  const otherLbl = otherPaymentMethodLabelFromConfig(businessHoursJson);
  return safe.map((id) => ({
    id,
    label: id === "other" ? otherLbl : labelCheckoutPaymentMethodKo(id),
  }));
}

/** 주문 목록·상세·관리자 표시용 */
export function formatBuyerPaymentDisplay(
  method: string | null | undefined,
  detail: string | null | undefined
): string {
  const m = (method ?? "").trim();
  if (!m) return "—";
  if (m === "other") {
    const d = (detail ?? "").trim();
    return d || "기타";
  }
  return labelCheckoutPaymentMethodKo(m);
}

/** 카트·확인 모달용 짧은 한글 라벨 (기타는 맥락 없이 "기타" — 화면은 checkoutPaymentOptionsForCart 사용) */
export function labelCheckoutPaymentMethodKo(id: string): string {
  switch (id) {
    case "cod":
      return "현금(착불·만나서)";
    case "gcash":
      return "GCash";
    case "bank_transfer":
      return "계좌이체";
    case "other":
      return "기타";
    case "card_on_delivery":
      return "카드(배달 시 결제)";
    default:
      return id;
  }
}
