export type CommerceExtrasFromHours = {
  minOrderPhp: number | null;
  deliveryFeePhp: number | null;
  /** 이 금액(페소) 이상 주문 시 동네배달 청구 배달비 0 */
  freeDeliveryOverPhp: number | null;
  /** 안내용(청구 금액에 미포함) */
  deliveryCourierLabel: string | null;
  /** 조리·준비(분). `prep_time_minutes` 우선, 없으면 `est_prep_label`에서 추정 */
  prepMinutes: number | null;
  /** 카드·요약용 조리 라벨(레거시 호환: `est_prep_label` 또는 prep 분에서 파생) */
  estPrepLabel: string;
};

const PREP_MINUTES_CLAMP = { min: 1, max: 180 } as const;

export function clampStorePrepMinutes(n: number): number {
  return Math.max(
    PREP_MINUTES_CLAMP.min,
    Math.min(PREP_MINUTES_CLAMP.max, Math.round(n))
  );
}

/**
 * 레거시 자유 텍스트 `est_prep_label`(예: "20~40분", "25분")에서 조리 분 추정.
 * 범위면 중간값을 반환한다.
 */
export function parsePrepMinutesLegacyFromEstPrepLabel(label: string): number | null {
  const t = label.trim();
  if (!t) return null;
  const range = /(\d+)\s*[~\-–]\s*(\d+)/.exec(t);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
      return clampStorePrepMinutes(Math.round((a + b) / 2));
    }
  }
  const single = /^(\d+)\s*분?\s*$/u.exec(t);
  if (single) {
    const n = Number(single[1]);
    if (Number.isFinite(n) && n > 0) return clampStorePrepMinutes(n);
  }
  const loose = /(\d+)\s*분/u.exec(t);
  if (loose) {
    const n = Number(loose[1]);
    if (Number.isFinite(n) && n > 0) return clampStorePrepMinutes(n);
  }
  return null;
}

function readPrepTimeMinutesFromJson(o: Record<string, unknown>): number | null {
  const v = o.prep_time_minutes ?? o.prepTimeMinutes;
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return clampStorePrepMinutes(n);
}

/** business_hours_json 확장 필드에서 최소주문·배달비 등 */
export function parseCommerceExtrasFromHoursJson(raw: unknown): CommerceExtrasFromHours {
  const base: CommerceExtrasFromHours = {
    minOrderPhp: null,
    deliveryFeePhp: null,
    freeDeliveryOverPhp: null,
    deliveryCourierLabel: null,
    prepMinutes: null,
    estPrepLabel: "20~40분",
  };
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  const min = Number(o.min_order_php ?? o.minOrderPhp);
  const fee = Number(o.delivery_fee_php ?? o.deliveryFeePhp);
  const freeRaw = Number(o.free_delivery_over_php ?? o.freeDeliveryOverPhp);
  const courier = String(o.delivery_courier_label ?? o.deliveryCourierLabel ?? "").trim();
  const prepLabelRaw = String(o.est_prep_label ?? o.estPrepLabel ?? "").trim();
  let prepMinutes = readPrepTimeMinutesFromJson(o);
  if (prepMinutes == null) {
    prepMinutes = parsePrepMinutesLegacyFromEstPrepLabel(prepLabelRaw);
  }
  const estPrepLabel =
    prepMinutes != null ? `${prepMinutes}분` : prepLabelRaw || base.estPrepLabel;
  return {
    minOrderPhp: Number.isFinite(min) && min > 0 ? Math.round(min) : null,
    deliveryFeePhp: Number.isFinite(fee) && fee >= 0 ? Math.round(fee) : null,
    freeDeliveryOverPhp: Number.isFinite(freeRaw) && freeRaw > 0 ? Math.round(freeRaw) : null,
    deliveryCourierLabel: courier || null,
    prepMinutes,
    estPrepLabel,
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
