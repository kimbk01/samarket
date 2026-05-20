import { looksLikeMessageKey } from "@/lib/i18n/safe-ui-label";
import { coerceBusinessHoursRecord } from "@/lib/stores/coerce-business-hours-json";
import {
  parseCommerceExtrasFromHoursJson,
  type CommerceExtrasFromHours,
  type StoreDeliveryFeeMode,
} from "@/lib/stores/store-commerce-extras";

/** browse/home-feed 카드 — 언어와 무관한 매장 영업·결제 사실만 (라벨은 클라이언트에서 생성) */
export type BrowseStoreCommerceSnapshot = {
  minOrderPhp: number | null;
  deliveryFeePhp: number | null;
  freeDeliveryOverPhp: number | null;
  deliveryCourierLabel: string | null;
  deliveryFeeMode: StoreDeliveryFeeMode | null;
  deliveryFeeStrikeReferencePhp: number | null;
  prepMinutes: number | null;
  estPrepLabel: string;
  deliveryRideDisplayManual: string | null;
  paymentMethodsLegacy: string | null;
  paymentMethodsConfig: Record<string, unknown> | null;
};

function sanitizeCourierLabel(label: string | null): string | null {
  const s = label?.trim() ?? "";
  if (!s || looksLikeMessageKey(s)) return null;
  return s;
}

export function buildBrowseStoreCommerceSnapshot(businessHoursJson: unknown): BrowseStoreCommerceSnapshot {
  const extras = parseCommerceExtrasFromHoursJson(businessHoursJson);
  const o = coerceBusinessHoursRecord(businessHoursJson);
  const cfgRaw = o.payment_methods_config ?? o.paymentMethodsConfig;
  const paymentMethodsConfig =
    cfgRaw && typeof cfgRaw === "object" && !Array.isArray(cfgRaw) ? (cfgRaw as Record<string, unknown>) : null;
  const legacy = String(o.payment_methods ?? o.paymentMethods ?? "").trim();

  return {
    minOrderPhp: extras.minOrderPhp,
    deliveryFeePhp: extras.deliveryFeePhp,
    freeDeliveryOverPhp: extras.freeDeliveryOverPhp,
    deliveryCourierLabel: sanitizeCourierLabel(extras.deliveryCourierLabel),
    deliveryFeeMode: extras.deliveryFeeMode,
    deliveryFeeStrikeReferencePhp: extras.deliveryFeeStrikeReferencePhp,
    prepMinutes: extras.prepMinutes,
    estPrepLabel: extras.estPrepLabel,
    deliveryRideDisplayManual: extras.deliveryRideDisplayManual,
    paymentMethodsLegacy: legacy || null,
    paymentMethodsConfig,
  };
}

export function commerceExtrasFromBrowseSnapshot(
  snap: BrowseStoreCommerceSnapshot
): CommerceExtrasFromHours {
  return {
    minOrderPhp: snap.minOrderPhp,
    deliveryFeePhp: snap.deliveryFeePhp,
    freeDeliveryOverPhp: snap.freeDeliveryOverPhp,
    deliveryCourierLabel: snap.deliveryCourierLabel,
    deliveryFeeMode: snap.deliveryFeeMode,
    deliveryFeeStrikeReferencePhp: snap.deliveryFeeStrikeReferencePhp,
    prepMinutes: snap.prepMinutes,
    estPrepLabel: snap.estPrepLabel,
    deliveryRideDisplayManual: snap.deliveryRideDisplayManual,
  };
}

export function browseCommerceSnapshotEqual(
  a: BrowseStoreCommerceSnapshot | null | undefined,
  b: BrowseStoreCommerceSnapshot | null | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return (
    a.minOrderPhp === b.minOrderPhp &&
    a.deliveryFeePhp === b.deliveryFeePhp &&
    a.freeDeliveryOverPhp === b.freeDeliveryOverPhp &&
    a.deliveryCourierLabel === b.deliveryCourierLabel &&
    a.deliveryFeeMode === b.deliveryFeeMode &&
    a.deliveryFeeStrikeReferencePhp === b.deliveryFeeStrikeReferencePhp &&
    a.prepMinutes === b.prepMinutes &&
    a.estPrepLabel === b.estPrepLabel &&
    a.deliveryRideDisplayManual === b.deliveryRideDisplayManual &&
    a.paymentMethodsLegacy === b.paymentMethodsLegacy &&
    JSON.stringify(a.paymentMethodsConfig) === JSON.stringify(b.paymentMethodsConfig)
  );
}
