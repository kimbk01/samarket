export type CommerceExtrasFromHours = {
  minOrderPhp: number | null;
  deliveryFeePhp: number | null;
  /** 이 금액(페소) 이상 주문 시 동네배달 청구 배달비 0 */
  freeDeliveryOverPhp: number | null;
  /** 안내용(청구 금액에 미포함) */
  deliveryCourierLabel: string | null;
  estPrepLabel: string;
};

/** business_hours_json 확장 필드에서 최소주문·배달비 등 */
export function parseCommerceExtrasFromHoursJson(raw: unknown): CommerceExtrasFromHours {
  const base: CommerceExtrasFromHours = {
    minOrderPhp: null,
    deliveryFeePhp: null,
    freeDeliveryOverPhp: null,
    deliveryCourierLabel: null,
    estPrepLabel: "20~40분",
  };
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  const min = Number(o.min_order_php ?? o.minOrderPhp);
  const fee = Number(o.delivery_fee_php ?? o.deliveryFeePhp);
  const freeRaw = Number(o.free_delivery_over_php ?? o.freeDeliveryOverPhp);
  const courier = String(o.delivery_courier_label ?? o.deliveryCourierLabel ?? "").trim();
  const prep = String(o.est_prep_label ?? o.estPrepLabel ?? "").trim();
  return {
    minOrderPhp: Number.isFinite(min) && min > 0 ? Math.round(min) : null,
    deliveryFeePhp: Number.isFinite(fee) && fee >= 0 ? Math.round(fee) : null,
    freeDeliveryOverPhp: Number.isFinite(freeRaw) && freeRaw > 0 ? Math.round(freeRaw) : null,
    deliveryCourierLabel: courier || null,
    estPrepLabel: prep || base.estPrepLabel,
  };
}

/**
 * 동네배달 청구에 더할 배달비(페소). 무료배달 기준 이상이면 0.
 * 상품 소계(라인 합) 기준 — 최소주문 통과 후 같은 소계로 판단.
 */
export function resolveChargedDeliveryFeePhp(
  extras: Pick<CommerceExtrasFromHours, "deliveryFeePhp" | "freeDeliveryOverPhp">,
  itemsSubtotalPhp: number,
  fulfillment: "pickup" | "local_delivery" | "shipping"
): number {
  if (fulfillment !== "local_delivery") return 0;
  const raw =
    extras.deliveryFeePhp != null && Number.isFinite(extras.deliveryFeePhp) && extras.deliveryFeePhp >= 0
      ? Math.round(extras.deliveryFeePhp)
      : 0;
  const fo = extras.freeDeliveryOverPhp;
  if (fo != null && fo > 0 && itemsSubtotalPhp >= fo) return 0;
  return raw;
}
