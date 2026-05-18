import type { AppLanguageCode } from "@/lib/i18n/config";
import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { formatMoneyPhp } from "@/lib/utils/format";

function scT(
  lang: AppLanguageCode,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  return translate(lang, key, vars);
}

/** `business_hours_json.delivery_fee_mode` */
export type StoreDeliveryFeeMode = "self" | "self_free_promo" | "courier";

export type CommerceExtrasFromHours = {
  minOrderPhp: number | null;
  deliveryFeePhp: number | null;
  /** 이 금액(페소) 이상 주문 시 동네배달 청구 배달비 0 — 유료 자체배달에만 적용(self_free_promo·courier 제외) */
  freeDeliveryOverPhp: number | null;
  /** 배달업체(착불) 안내 문구 */
  deliveryCourierLabel: string | null;
  /** null: 배달비 미설정. self / self_free_promo / courier 상호 배타 저장 */
  deliveryFeeMode: StoreDeliveryFeeMode | null;
  /** self_free_promo: 목록·상세 취소선용 원래 배달비(표시만) */
  deliveryFeeStrikeReferencePhp: number | null;
  /** 조리·준비(분). `prep_time_minutes` 우선, 없으면 `est_prep_label`에서 추정 */
  prepMinutes: number | null;
  /** 카드·요약용 조리 라벨(레거시 호환: `est_prep_label` 또는 prep 분에서 파생) */
  estPrepLabel: string;
  /**
   * 전역 `delivery_ride_time_source=store` 일 때 목록·ETA에 쓰는 수기 배달 구간 문구.
   * `business_hours_json.delivery_ride_display_manual`
   */
  deliveryRideDisplayManual: string | null;
};

const DELIVERY_RIDE_DISPLAY_MANUAL_MAX = 80;

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

function readExplicitDeliveryFeeMode(o: Record<string, unknown>): StoreDeliveryFeeMode | null {
  const raw = String(o.delivery_fee_mode ?? o.deliveryFeeMode ?? "").trim().toLowerCase();
  if (raw === "self") return "self";
  if (raw === "self_free_promo") return "self_free_promo";
  if (raw === "courier") return "courier";
  return null;
}

/** business_hours_json 확장 필드에서 최소주문·배달비 등 */
export function parseCommerceExtrasFromHoursJson(raw: unknown): CommerceExtrasFromHours {
  const base: CommerceExtrasFromHours = {
    minOrderPhp: null,
    deliveryFeePhp: null,
    freeDeliveryOverPhp: null,
    deliveryCourierLabel: null,
    deliveryFeeMode: null,
    deliveryFeeStrikeReferencePhp: null,
    prepMinutes: null,
    estPrepLabel: "20~40분",
    deliveryRideDisplayManual: null,
  };
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  const min = Number(o.min_order_php ?? o.minOrderPhp);
  const feeRaw = Number(o.delivery_fee_php ?? o.deliveryFeePhp);
  const freeRaw = Number(o.free_delivery_over_php ?? o.freeDeliveryOverPhp);
  const courierRaw = String(o.delivery_courier_label ?? o.deliveryCourierLabel ?? "").trim();
  const strikeRaw = Number(o.delivery_fee_strike_reference_php ?? o.deliveryFeeStrikeReferencePhp);
  const strikeFromJson =
    Number.isFinite(strikeRaw) && strikeRaw > 0 ? Math.round(strikeRaw) : null;
  const prepLabelRaw = String(o.est_prep_label ?? o.estPrepLabel ?? "").trim();
  let prepMinutes = readPrepTimeMinutesFromJson(o);
  if (prepMinutes == null) {
    prepMinutes = parsePrepMinutesLegacyFromEstPrepLabel(prepLabelRaw);
  }
  const estPrepLabel =
    prepMinutes != null ? `${prepMinutes}분` : prepLabelRaw || base.estPrepLabel;

  const manualRideRaw = String(o.delivery_ride_display_manual ?? o.deliveryRideDisplayManual ?? "").trim();
  const deliveryRideDisplayManual =
    manualRideRaw.length > 0 ? manualRideRaw.slice(0, DELIVERY_RIDE_DISPLAY_MANUAL_MAX) : null;

  const feeRounded =
    Number.isFinite(feeRaw) && feeRaw >= 0 ? Math.round(feeRaw) : null;
  const courierNonEmpty = courierRaw.length > 0 ? courierRaw : null;

  let explicit = readExplicitDeliveryFeeMode(o);
  let deliveryFeeMode: StoreDeliveryFeeMode | null = explicit;

  if (deliveryFeeMode == null) {
    if (feeRounded != null && feeRounded > 0) {
      deliveryFeeMode = "self";
    } else if (courierNonEmpty) {
      deliveryFeeMode = "courier";
    } else if (feeRounded === 0) {
      deliveryFeeMode = "self";
    } else {
      deliveryFeeMode = null;
    }
  }

  /** 레거시: 금액·업체 텍스트 동시 존재 시 self 우선, 업체 라벨은 표시·청구에서 제외 */
  if (
    explicit == null &&
    feeRounded != null &&
    feeRounded > 0 &&
    courierNonEmpty
  ) {
    deliveryFeeMode = "self";
  }

  let deliveryFeePhp: number | null = feeRounded;
  let deliveryCourierLabel: string | null = courierNonEmpty;
  let deliveryFeeStrikeReferencePhp: number | null = null;

  if (deliveryFeeMode === "courier") {
    deliveryFeePhp = null;
    deliveryFeeStrikeReferencePhp = null;
  } else if (deliveryFeeMode === "self_free_promo") {
    deliveryFeePhp = null;
    deliveryCourierLabel = null;
    deliveryFeeStrikeReferencePhp = strikeFromJson;
  } else if (deliveryFeeMode === "self") {
    deliveryCourierLabel = null;
    deliveryFeeStrikeReferencePhp = null;
  } else {
    deliveryFeePhp = null;
    deliveryCourierLabel = null;
    deliveryFeeStrikeReferencePhp = null;
  }

  const freeDeliveryOverPhp =
    deliveryFeeMode === "self_free_promo" ? null
    : Number.isFinite(freeRaw) && freeRaw > 0 ? Math.round(freeRaw)
    : null;

  return {
    minOrderPhp: Number.isFinite(min) && min > 0 ? Math.round(min) : null,
    deliveryFeePhp,
    freeDeliveryOverPhp,
    deliveryCourierLabel,
    deliveryFeeMode,
    deliveryFeeStrikeReferencePhp,
    prepMinutes,
    estPrepLabel,
    deliveryRideDisplayManual,
  };
}

/**
 * 동네배달 청구에 더할 배달비(페소). 무료배달 기준 이상이면 0.
 * 배달업체(착불)·이벤트 무료(self_free_promo)는 항상 0.
 */
export function resolveChargedDeliveryFeePhp(
  extras: Pick<
    CommerceExtrasFromHours,
    "deliveryFeePhp" | "freeDeliveryOverPhp" | "deliveryFeeMode"
  >,
  itemsSubtotalPhp: number,
  fulfillment: "pickup" | "local_delivery" | "shipping"
): number {
  if (fulfillment !== "local_delivery") return 0;
  if (extras.deliveryFeeMode === "courier") return 0;
  if (extras.deliveryFeeMode === "self_free_promo") return 0;
  if (extras.deliveryFeeMode !== "self") return 0;
  const raw =
    extras.deliveryFeePhp != null && Number.isFinite(extras.deliveryFeePhp) && extras.deliveryFeePhp >= 0
      ? Math.round(extras.deliveryFeePhp)
      : 0;
  const fo = extras.freeDeliveryOverPhp;
  if (fo != null && fo > 0 && itemsSubtotalPhp >= fo) return 0;
  return raw;
}

/** browse/home-feed 카드 주 문구(취소선 금액은 `deliveryFeeStrikePhp` 별도). 배달 불가면 null */
export function formatStoreBrowseDeliveryFeeLine(
  extras: CommerceExtrasFromHours,
  opts: { deliveryAvailable: boolean },
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string | null {
  if (!opts.deliveryAvailable) return null;
  if (extras.deliveryFeeMode === "courier") {
    if (extras.deliveryCourierLabel) {
      return scT(lang, "store_delivery_fee_courier_colon", { label: extras.deliveryCourierLabel });
    }
    return scT(lang, "store_delivery_fee_cod_line");
  }
  if (extras.deliveryFeeMode === "self_free_promo") {
    return scT(lang, "store_free_delivery_applied");
  }
  if (extras.deliveryFeeMode === "self" && extras.deliveryFeePhp != null && extras.deliveryFeePhp >= 0) {
    if (
      extras.deliveryFeePhp === 0 &&
      extras.freeDeliveryOverPhp != null &&
      extras.freeDeliveryOverPhp > 0
    ) {
      return scT(lang, "store_delivery_fee_free_line");
    }
    return scT(lang, "store_delivery_fee_amount_line", {
      amount: formatMoneyPhp(extras.deliveryFeePhp),
    });
  }
  return null;
}

/** 목록 API: 취소선용 금액(self_free_promo) */
export function formatStoreBrowseDeliveryFeeStrikePhp(
  extras: CommerceExtrasFromHours,
  opts: { deliveryAvailable: boolean }
): number | null {
  if (!opts.deliveryAvailable || extras.deliveryFeeMode !== "self_free_promo") return null;
  return extras.deliveryFeeStrikeReferencePhp;
}

/** 목록 카드 무료 강조 행(임계 무료 또는 이벤트 무료) */
export function storeBrowseDeliveryFeeShowsFreeBadge(extras: CommerceExtrasFromHours): boolean {
  if (extras.deliveryFeeMode === "self_free_promo") return true;
  return (
    extras.deliveryFeeMode === "self" &&
    extras.deliveryFeePhp === 0 &&
    extras.freeDeliveryOverPhp != null &&
    extras.freeDeliveryOverPhp > 0
  );
}

/** 매장 상단/히어로 등 — 값만(라벨은 컴포넌트에서 `배달비`로 통일) */
export function formatStoreDetailDeliveryFeeValue(
  extras: CommerceExtrasFromHours,
  opts: { deliveryAvailable: boolean },
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string {
  if (!opts.deliveryAvailable) return scT(lang, "store_delivery_no_short");
  if (extras.deliveryFeeMode === "courier") {
    if (extras.deliveryCourierLabel) return extras.deliveryCourierLabel;
    return scT(lang, "store_cod_label");
  }
  if (extras.deliveryFeeMode === "self_free_promo") {
    return scT(lang, "store_free_delivery_applied");
  }
  if (extras.deliveryFeeMode === "self" && extras.deliveryFeePhp != null) {
    if (
      extras.deliveryFeePhp === 0 &&
      extras.freeDeliveryOverPhp != null &&
      extras.freeDeliveryOverPhp > 0
    ) {
      return scT(lang, "store_free_delivery_short");
    }
    if (extras.deliveryFeePhp >= 0) return formatMoneyPhp(extras.deliveryFeePhp);
  }
  return scT(lang, "store_inquiry_title");
}

/** 매장 가로 요약 줄: `배달비 …` 형태 */
export function formatStoreStorefrontDeliveryFeeLine(
  extras: CommerceExtrasFromHours,
  opts: { deliveryAvailable: boolean },
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string {
  if (!opts.deliveryAvailable) return scT(lang, "store_delivery_no_short");
  if (extras.deliveryFeeMode === "courier") {
    if (extras.deliveryCourierLabel) {
      return scT(lang, "store_delivery_fee_courier_colon", { label: extras.deliveryCourierLabel });
    }
    return scT(lang, "store_delivery_fee_cod_line");
  }
  if (extras.deliveryFeeMode === "self_free_promo") {
    return scT(lang, "store_free_delivery_applied");
  }
  if (extras.deliveryFeeMode === "self" && extras.deliveryFeePhp != null && extras.deliveryFeePhp >= 0) {
    return scT(lang, "store_delivery_fee_amount_line", {
      amount: formatMoneyPhp(extras.deliveryFeePhp),
    });
  }
  return scT(lang, "store_delivery_fee_inquire_line");
}
