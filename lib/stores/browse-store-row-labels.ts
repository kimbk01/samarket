import type { AppLanguageCode } from "@/lib/i18n/config";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { buildBrowseStoreListEtaLabel } from "@/lib/stores/store-delivery-eta-label";
import {
  formatStoreBrowseDeliveryFeeLine,
  formatStoreBrowseDeliveryFeeStrikePhp,
} from "@/lib/stores/store-commerce-extras";
import {
  browseCommerceSnapshotEqual,
  commerceExtrasFromBrowseSnapshot,
  type BrowseStoreCommerceSnapshot,
} from "@/lib/stores/browse-store-commerce-snapshot";
import { paymentMethodsLineFromBusinessRecord } from "@/lib/stores/payment-methods-config";
import { formatMoneyPhp } from "@/lib/utils/format";

export type BrowseStoreRowLabelContext = {
  deliveryAvailable: boolean;
  rideMinutes: number | null;
  /** user_lat/lng 등으로 목록 거리·ETA 슬롯을 쓸 때 true */
  routeContextPresent: boolean;
  deliveryRideTimeSource: string;
};

export type BrowseStoreRowLabels = {
  deliveryFeeLabel: string | null;
  deliveryFeeStrikePhp: number | null;
  etaLabel: string;
  paymentMethodsLine: string;
  minOrderLabel: string | null;
};

/** 카드에 노출할 문구 — `locale` 기준으로만 생성 (API 사전 번역 문자열 미사용) */
export function formatBrowseStoreRowLabels(
  lang: AppLanguageCode,
  commerce: BrowseStoreCommerceSnapshot,
  ctx: BrowseStoreRowLabelContext
): BrowseStoreRowLabels {
  const extras = commerceExtrasFromBrowseSnapshot(commerce);
  const deliveryFeeLabel = formatStoreBrowseDeliveryFeeLine(
    extras,
    { deliveryAvailable: ctx.deliveryAvailable },
    lang
  );
  const deliveryFeeStrikePhp = formatStoreBrowseDeliveryFeeStrikePhp(extras, {
    deliveryAvailable: ctx.deliveryAvailable,
  });
  const manualForEta =
    ctx.deliveryRideTimeSource === "store" ? commerce.deliveryRideDisplayManual : null;
  const etaLabel = buildBrowseStoreListEtaLabel(
    extras,
    ctx.rideMinutes,
    {
      deliveryAvailable: ctx.deliveryAvailable,
      routeContextPresent: ctx.routeContextPresent,
      manualRideDisplay: manualForEta,
    },
    lang
  );
  const payFromCfg = paymentMethodsLineFromBusinessRecord(
    {
      payment_methods_config: commerce.paymentMethodsConfig,
      payment_methods: commerce.paymentMethodsLegacy,
    },
    lang
  );
  const paymentMethodsLine =
    payFromCfg.trim() ||
    safeTranslate(lang, "store_pay_methods_fallback", {
      fallbackKo: "GCash · 만나서 결제 등 (매장 확인)",
      fallbackEn: "GCash, cash on delivery, etc. (confirm with store)",
    });
  const minOrderLabel =
    commerce.minOrderPhp != null && Number.isFinite(commerce.minOrderPhp) && commerce.minOrderPhp > 0
      ? safeTranslate(lang, "store_min_order_amount_colon", {
          vars: { amount: formatMoneyPhp(commerce.minOrderPhp) },
          fallbackKo: `최소주문 ${formatMoneyPhp(commerce.minOrderPhp)}`,
          fallbackEn: `Min. order ${formatMoneyPhp(commerce.minOrderPhp)}`,
        })
      : null;

  return {
    deliveryFeeLabel,
    deliveryFeeStrikePhp,
    etaLabel,
    paymentMethodsLine,
    minOrderLabel,
  };
}

