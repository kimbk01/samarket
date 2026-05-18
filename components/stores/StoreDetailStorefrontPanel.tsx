"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { StoreDetailPromoBanner } from "@/components/stores/StoreDetailDeliveryRows";
import {
  compactStoreHoursRangeForDisplay,
  type StoreDeliveryMeta,
} from "@/lib/stores/store-detail-meta";
import {
  formatStoreStorefrontDeliveryFeeLine,
  type CommerceExtrasFromHours,
} from "@/lib/stores/store-commerce-extras";
import { StorePublicNoticesList } from "@/components/stores/StorePublicNoticesList";
import { formatMoneyPhp } from "@/lib/utils/format";

export type StorePublicFulfillmentMode = "pickup" | "local_delivery";

type CommerceHint = {
  breakConfigured: boolean;
  breakRangeLabel: string;
  inBreak: boolean;
} | null;

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-sam-border-soft py-2.5 last:border-b-0">
      <p className="sam-text-xxs font-semibold uppercase tracking-wide text-sam-muted">{label}</p>
      <div className="mt-1 sam-text-body-secondary font-medium leading-snug text-sam-fg">{children}</div>
    </div>
  );
}

/**
 * 주문 화면 상단 블록 — 상단 스티키(주문상태·수령)와 겹치지 않게,
 * 한 줄 요약 + 접힘 안에는 `business_hours_json` 기반 **추가** 정보만 (중복 칩·4칸 지표 제거).
 */
export function StoreDetailStorefrontPanel({
  deliveryMeta,
  commerceExtras,
  deliveryAvailable,
  pickupAvailable: _pickupAvailable,
  isOpen: _isOpen,
  commerce,
  ownerManagementHref,
  storeInfoHref,
}: {
  deliveryMeta: StoreDeliveryMeta;
  commerceExtras: CommerceExtrasFromHours;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  isOpen: boolean;
  commerce: CommerceHint;
  ownerManagementHref?: string | null;
  storeInfoHref: string;
}) {
  const { t, language } = useI18n();
  void _pickupAvailable;
  void _isOpen;

  const minLine = useMemo(() => {
    const m = commerceExtras.minOrderPhp;
    if (m != null && m > 0) return `최소 ${formatMoneyPhp(m)}`;
    return "최소 없음";
  }, [commerceExtras.minOrderPhp]);
  const feeLine = useMemo(
    () => formatStoreStorefrontDeliveryFeeLine(commerceExtras, { deliveryAvailable }, language),
    [commerceExtras, deliveryAvailable, language]
  );

  const feeSummaryInline = useMemo(() => {
    if (!deliveryAvailable || commerceExtras.deliveryFeeMode !== "self_free_promo") {
      return <span>{feeLine}</span>;
    }
    const strike = commerceExtras.deliveryFeeStrikeReferencePhp;
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span className="font-semibold text-[#2563EB]">{t("store_free_delivery_applied")}</span>
        {strike != null && strike > 0 ? (
          <span className="text-sam-meta line-through">{formatMoneyPhp(strike)}</span>
        ) : null}
      </span>
    );
  }, [commerceExtras, deliveryAvailable, feeLine]);

  const prepLine = useMemo(() => `준비 ${commerceExtras.estPrepLabel}`, [commerceExtras.estPrepLabel]);

  const payShort = useMemo(() => {
    const p = deliveryMeta.paymentMethodsLine?.trim();
    if (p) return p.length > 28 ? `${p.slice(0, 26)}…` : p;
    return "결제 매장 확인";
  }, [deliveryMeta.paymentMethodsLine]);

  const weekdaysDisp = useMemo(() => {
    const raw = deliveryMeta.weekdaysLine?.trim();
    if (!raw) return "—";
    return compactStoreHoursRangeForDisplay(raw);
  }, [deliveryMeta.weekdaysLine]);

  const deliveryHoursDisp = useMemo(() => {
    const dh = deliveryMeta.deliveryHoursLine?.trim();
    const wk = deliveryMeta.weekdaysLine?.trim();
    if (!dh || (wk && dh === wk)) return null;
    return compactStoreHoursRangeForDisplay(dh);
  }, [deliveryMeta.deliveryHoursLine, deliveryMeta.weekdaysLine]);

  const payFull = deliveryMeta.paymentMethodsLine?.trim() || "매장에 문의해 주세요.";

  return (
    <section
      className="w-full border-b border-sam-border bg-sam-surface px-3 py-2 shadow-sm"
      aria-label={t("store_order_summary_aria")}
    >
      {ownerManagementHref ? (
        <p className="mb-2 text-center">
          <Link
            href={ownerManagementHref}
            className="sam-text-xxs font-semibold text-signature underline decoration-signature/30 underline-offset-2"
          >
            내 상점 관리
          </Link>
        </p>
      ) : null}

      <div
        className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]"
        role="group"
        aria-label={t("store_commerce_summary_aria")}
      >
        <p className="flex w-max min-w-full items-center gap-x-2 whitespace-nowrap py-1 sam-text-xxs font-medium text-sam-fg">
          <span className="text-sam-fg">{minLine}</span>
          <span className="text-sam-meta" aria-hidden>
            |
          </span>
          <span>{feeSummaryInline}</span>
          <span className="text-sam-meta" aria-hidden>
            |
          </span>
          <span>{prepLine}</span>
          <span className="text-sam-meta" aria-hidden>
            |
          </span>
          <span className="max-w-[38vw] truncate text-sam-muted" title={deliveryMeta.paymentMethodsLine}>
            {payShort}
          </span>
          {commerce?.breakConfigured ? (
            <>
              <span className="text-sam-meta" aria-hidden>
                |
              </span>
              <span className="text-amber-800">Break {commerce.breakRangeLabel}</span>
            </>
          ) : null}
        </p>
      </div>

      <details className="group mt-2 rounded-ui-rect border border-sam-border bg-sam-app/90">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 sam-text-body-secondary font-semibold text-sam-fg [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            매장 안내
            <span className="ml-1.5 sam-text-xxs font-normal text-sam-muted group-open:hidden">
              · 영업·결제·공지
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Link
              href={storeInfoHref}
              className="sam-text-xxs font-semibold text-signature underline decoration-signature/30 underline-offset-2"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              가게 정보
            </Link>
            <span className="sam-text-xxs font-normal text-sam-meta group-open:hidden">▼</span>
            <span className="hidden sam-text-xxs font-normal text-sam-meta group-open:inline">▲</span>
          </span>
        </summary>
        <div className="border-t border-sam-border bg-sam-surface px-3 pb-3 pt-1">
          <p className="mb-2 sam-text-xxs leading-relaxed text-sam-muted">
            {t("store_commerce_notice_html")}
            또는 상단 ⋯ 메뉴에서 열 수 있어요.
          </p>

          <DetailRow label="영업 시간">{weekdaysDisp}</DetailRow>
          {deliveryAvailable && deliveryHoursDisp ? (
            <DetailRow label="배달 운영 시간">{deliveryHoursDisp}</DetailRow>
          ) : null}
          <DetailRow label="결제 수단">
            <span className="whitespace-pre-wrap break-words">{payFull}</span>
          </DetailRow>
          <DetailRow label="조리·준비 안내">{commerceExtras.estPrepLabel}</DetailRow>
          {deliveryAvailable ? (
            <DetailRow label="배달 소요(추정)">
              고객 배달 주소 좌표가 있으면 앱에서 매장까지 오토바이 경로 기준으로 배달 구간을 자동 추정해,
              조리 시간과 합산한 예상 시간을 목록·장바구니에 표시합니다.
            </DetailRow>
          ) : null}

          <div className="pt-1">
            {commerceExtras.deliveryFeeMode !== "self_free_promo" ? (
              <StoreDetailPromoBanner
                freeOverPhp={deliveryMeta.freeDeliveryOverPhp}
                customText=""
                embedded
              />
            ) : null}
          </div>
          {deliveryAvailable && commerceExtras.deliveryFeeMode === "courier" && commerceExtras.deliveryCourierLabel ? (
            <p className="mt-2 sam-text-helper text-sam-muted">
              <span className="font-semibold text-sam-fg">{t("store_courier_cod")}</span> · {commerceExtras.deliveryCourierLabel}
            </p>
          ) : null}

          <StorePublicNoticesList lines={deliveryMeta.publicNotices} className="mt-3" />
          {deliveryMeta.deliveryNotice.trim() ? (
            <p className="mt-3 rounded-ui-rect border border-sam-border-soft bg-sam-app px-2.5 py-2 sam-text-xxs leading-relaxed whitespace-pre-wrap text-sam-muted">
              <span className="font-semibold text-sam-fg">{t("store_delivery_guide")}</span>
              <br />
              {deliveryMeta.deliveryNotice}
            </p>
          ) : null}
        </div>
      </details>
    </section>
  );
}
