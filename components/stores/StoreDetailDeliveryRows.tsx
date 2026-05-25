"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import type { ReactNode } from "react";
import { StoreDetailSectionTitle } from "@/components/stores/StoreDetailSectionTitle";
import { formatMoneyPhp } from "@/lib/utils/format";
import { telHrefFromLoosePhPhone } from "@/lib/utils/ph-mobile";
import {
  compactStoreHoursRangeForDisplay,
  type StoreDeliveryMeta,
} from "@/lib/stores/store-detail-meta";
import { STORE_DETAIL_CARD, STORE_DETAIL_GUTTER } from "@/lib/stores/store-detail-ui";

/** 세로 구분 — 두께 2px, 셀 높이에 맞춤 */
function CommerceMetricVSeparator() {
  return (
    <div className="flex w-[2px] shrink-0 self-stretch py-0" aria-hidden>
      <div className="min-h-0 flex-1 rounded-ui-rect bg-sam-surface-muted" />
    </div>
  );
}

/** 가로 셀 (구분선은 부모에서 VSeparator로 삽입) */
function CommerceMetricCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0 px-1.5 py-0 text-center">
      <span className="sam-text-xxs font-medium leading-none text-sam-muted">{label}</span>
      <div className="w-full min-w-0 sam-text-body-secondary font-semibold leading-tight text-sam-fg">{value}</div>
    </div>
  );
}

/** 배달 핵심 수치 — 매장 창·배달 안내 카드에서 공통 사용 */
export function StoreDetailCommerceMetrics({
  deliveryMeta,
  minOrderPhp,
  deliveryFeePhp,
  deliveryCourierLabel,
  deliveryAvailable,
}: {
  deliveryMeta: StoreDeliveryMeta;
  minOrderPhp: number | null;
  deliveryFeePhp: number | null;
  deliveryCourierLabel: string | null;
  deliveryAvailable: boolean;
}) {
  const { t } = useI18n();
  const minDd =
    minOrderPhp != null && minOrderPhp > 0 ? formatMoneyPhp(minOrderPhp) : `${formatMoneyPhp(0)}`;
  const feeDd =
    deliveryAvailable && deliveryFeePhp != null && deliveryFeePhp >= 0
      ? formatMoneyPhp(deliveryFeePhp)
      : deliveryAvailable
        ? t("store_inquiry_title")
        : "—";
  const weekdaysRaw = deliveryMeta.weekdaysLine?.trim() || "";
  const deliveryHoursRaw = deliveryMeta.deliveryHoursLine?.trim() || "";
  const businessRaw = weekdaysRaw || deliveryHoursRaw;
  const hoursBusiness = businessRaw ? compactStoreHoursRangeForDisplay(businessRaw) : "—";
  const pay = deliveryMeta.paymentMethodsLine?.trim() || "—";
  const freeLine =
    deliveryAvailable &&
    deliveryMeta.freeDeliveryOverPhp != null &&
    deliveryMeta.freeDeliveryOverPhp > 0
      ? t("store_free_delivery_over", { amount: formatMoneyPhp(deliveryMeta.freeDeliveryOverPhp) })
      : null;
  const courier = deliveryAvailable && deliveryCourierLabel?.trim() ? deliveryCourierLabel.trim() : null;

  /** 최소주문 · 배달비 · 결제 · 영업시간 — 한 행, 좁은 화면에서 가로 스크롤 */
  const metricsRow = (
    <div className="flex w-full min-w-[320px] items-stretch">
      <CommerceMetricCell label={t("store_min_order_short")} value={minDd} />
      <CommerceMetricVSeparator />
      <CommerceMetricCell label={t("store_delivery_fee_inquire_line")} value={feeDd} />
      <CommerceMetricVSeparator />
      <CommerceMetricCell
        label={t("store_payment_methods_label")}
        value={<span className="line-clamp-2 break-words">{pay}</span>}
      />
      <CommerceMetricVSeparator />
      <CommerceMetricCell
        label={t("store_hours_weekday")}
        value={
          <span className="line-clamp-2 break-words tabular-nums text-sam-fg">{hoursBusiness}</span>
        }
      />
    </div>
  );

  return (
    <>
      <div
        className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]"
        role="group"
        aria-label={t("store_delivery_order_summary_aria")}
      >
        <div className="border-b border-sam-border py-0">
          {metricsRow}
        </div>
      </div>
      {freeLine ? (
        <p className="mt-2.5 sam-text-helper font-medium text-emerald-800">{freeLine}</p>
      ) : null}
      {courier ? (
        <p className="mt-1 sam-text-helper text-sam-muted">
          <span className="font-medium text-sam-fg">{t("store_delivery_guide")}</span> · {courier}
        </p>
      ) : null}
    </>
  );
}

export function StoreDetailCommerceStrip({
  storeSlug,
  deliveryMeta,
  minOrderPhp,
  deliveryFeePhp,
  deliveryCourierLabel,
  deliveryAvailable,
}: {
  storeSlug: string;
  deliveryMeta: StoreDeliveryMeta;
  minOrderPhp: number | null;
  deliveryFeePhp: number | null;
  deliveryCourierLabel: string | null;
  deliveryAvailable: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className={`${STORE_DETAIL_GUTTER} mt-3 ${STORE_DETAIL_CARD} p-4`}>
      <StoreDetailSectionTitle level="h2">{t("store_delivery_order_guide_title")}</StoreDetailSectionTitle>
      <div className="-mt-1">
        <StoreDetailCommerceMetrics
          deliveryMeta={deliveryMeta}
          minOrderPhp={minOrderPhp}
          deliveryFeePhp={deliveryFeePhp}
          deliveryCourierLabel={deliveryCourierLabel}
          deliveryAvailable={deliveryAvailable}
        />
      </div>
      <p className="mt-3 sam-text-helper leading-snug text-sam-muted">
        {t("store_detail_info_address_hint_before")}{" "}
        <Link
          href={`/stores/${encodeURIComponent(storeSlug)}/info`}
          className="font-semibold text-signature underline decoration-signature/30 underline-offset-2"
        >
          {t("store_detail_info_tab_short")}
        </Link>
        {t("store_detail_info_address_hint_after")}
      </p>
    </div>
  );
}

export function StoreDetailInquiryActions({ phone }: { phone: string | null }) {
  const { t } = useI18n();
  const href =
    telHrefFromLoosePhPhone(phone) ?? (phone?.replace(/\s/g, "") ? `tel:${phone.replace(/\s/g, "")}` : "");
  const btn =
    "flex flex-1 items-center justify-center rounded-ui-rect border border-sam-border bg-background py-2.5 text-center sam-text-body font-semibold text-foreground shadow-sm active:bg-sam-primary-soft";
  const disabled =
    "flex flex-1 cursor-not-allowed items-center justify-center rounded-ui-rect border border-sam-border bg-sam-app py-2.5 text-center sam-text-body text-sam-meta";
  return (
    <div className={`${STORE_DETAIL_GUTTER} mt-3 ${STORE_DETAIL_CARD} p-4`}>
      <StoreDetailSectionTitle level="h2">{t("store_inquiry_title")}</StoreDetailSectionTitle>
      <div className="-mt-1 flex gap-2">
        {href ? (
          <a href={href} className={btn}>
            {t("store_phone_inquiry")}
          </a>
        ) : (
          <span className={disabled}>{t("store_phone_inquiry")}</span>
        )}
        <Link href="/chat" className={btn}>
          {t("store_chat_inquiry_menu")}
        </Link>
      </div>
    </div>
  );
}

export function StoreDetailPromoBanner({
  freeOverPhp,
  customText,
  embedded,
}: {
  freeOverPhp: number | null;
  customText: string;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const line =
    customText.trim() ||
    (freeOverPhp != null && freeOverPhp > 0
      ? t("store_free_delivery_threshold_line", { amount: formatMoneyPhp(freeOverPhp) })
      : "");
  if (!line) return null;
  const boxClass =
    "flex items-start gap-2.5 rounded-ui-rect border border-amber-200 bg-amber-50 px-3.5 py-3 sam-text-body-secondary font-normal leading-snug text-amber-950 shadow-sm";
  return (
    <div className={embedded ? `mt-3 ${boxClass}` : `${STORE_DETAIL_GUTTER} mt-3 ${boxClass}`}>
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-ui-rect bg-amber-200/80 sam-text-xxs font-bold text-amber-900">
        i
      </span>
      <p>{line}</p>
    </div>
  );
}
