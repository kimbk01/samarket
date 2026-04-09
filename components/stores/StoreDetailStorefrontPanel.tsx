"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { StoreDetailPromoBanner } from "@/components/stores/StoreDetailDeliveryRows";
import {
  compactStoreHoursRangeForDisplay,
  type StoreDeliveryMeta,
} from "@/lib/stores/store-detail-meta";
import type { CommerceExtrasFromHours } from "@/lib/stores/store-commerce-extras";
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
    <div className="border-b border-stone-100 py-2.5 last:border-b-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <div className="mt-1 text-[13px] font-medium leading-snug text-stone-800">{children}</div>
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
  void _pickupAvailable;
  void _isOpen;

  const minLine = useMemo(() => {
    const m = commerceExtras.minOrderPhp;
    if (m != null && m > 0) return `최소 ${formatMoneyPhp(m)}`;
    return "최소 없음";
  }, [commerceExtras.minOrderPhp]);

  const feeLine = useMemo(() => {
    if (!deliveryAvailable) return "배달 불가";
    const f = commerceExtras.deliveryFeePhp;
    if (f != null && f >= 0) return `배달 ${formatMoneyPhp(f)}`;
    return "배달비 문의";
  }, [commerceExtras.deliveryFeePhp, deliveryAvailable]);

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
  const courier = commerceExtras.deliveryCourierLabel?.trim();
  const showAvgDel =
    deliveryMeta.avgDeliveryTimeLabel.trim() &&
    deliveryMeta.avgDeliveryTimeLabel.trim() !== commerceExtras.estPrepLabel.trim();

  return (
    <section
      className="w-full border-b border-stone-200 bg-white px-3 py-2 shadow-sm"
      aria-label="주문 요약"
    >
      {ownerManagementHref ? (
        <p className="mb-2 text-center">
          <Link
            href={ownerManagementHref}
            className="text-[11px] font-semibold text-signature underline decoration-signature/30 underline-offset-2"
          >
            내 상점 관리
          </Link>
        </p>
      ) : null}

      <div
        className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]"
        role="group"
        aria-label="최소주문·배달·준비·결제 요약"
      >
        <p className="flex w-max min-w-full items-center gap-x-2 whitespace-nowrap py-1 text-[11px] font-medium text-stone-700">
          <span className="text-stone-900">{minLine}</span>
          <span className="text-stone-300" aria-hidden>
            |
          </span>
          <span>{feeLine}</span>
          <span className="text-stone-300" aria-hidden>
            |
          </span>
          <span>{prepLine}</span>
          <span className="text-stone-300" aria-hidden>
            |
          </span>
          <span className="max-w-[38vw] truncate text-stone-600" title={deliveryMeta.paymentMethodsLine}>
            {payShort}
          </span>
          {commerce?.breakConfigured ? (
            <>
              <span className="text-stone-300" aria-hidden>
                |
              </span>
              <span className="text-amber-800">Break {commerce.breakRangeLabel}</span>
            </>
          ) : null}
        </p>
      </div>

      <details className="group mt-2 rounded-ui-rect border border-stone-200 bg-stone-50/90">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[13px] font-semibold text-stone-800 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            매장 안내
            <span className="ml-1.5 text-[11px] font-normal text-stone-500 group-open:hidden">
              · 영업·결제·공지
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Link
              href={storeInfoHref}
              className="text-[11px] font-semibold text-signature underline decoration-signature/30 underline-offset-2"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              가게 정보
            </Link>
            <span className="text-[11px] font-normal text-stone-400 group-open:hidden">▼</span>
            <span className="hidden text-[11px] font-normal text-stone-400 group-open:inline">▲</span>
          </span>
        </summary>
        <div className="border-t border-stone-200 bg-white px-3 pb-3 pt-1">
          <p className="mb-2 text-[11px] leading-relaxed text-stone-500">
            매장에 등록된 영업·결제·공지입니다. 주소·지도는 우측 <strong className="text-stone-600">가게 정보</strong>
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
          {showAvgDel ? (
            <DetailRow label="배달 소요 안내(참고)">{deliveryMeta.avgDeliveryTimeLabel.trim()}</DetailRow>
          ) : null}

          <div className="pt-1">
            <StoreDetailPromoBanner
              freeOverPhp={deliveryMeta.freeDeliveryOverPhp}
              customText=""
              embedded
            />
          </div>
          {deliveryAvailable && courier ? (
            <p className="mt-2 text-[12px] text-stone-600">
              <span className="font-semibold text-stone-700">배달 담당</span> · {courier}
            </p>
          ) : null}

          <StorePublicNoticesList lines={deliveryMeta.publicNotices} className="mt-3" />
          {deliveryMeta.deliveryNotice.trim() ? (
            <p className="mt-3 rounded-ui-rect border border-stone-100 bg-stone-50 px-2.5 py-2 text-[11px] leading-relaxed whitespace-pre-wrap text-stone-600">
              <span className="font-semibold text-stone-800">배달 안내</span>
              <br />
              {deliveryMeta.deliveryNotice}
            </p>
          ) : null}
        </div>
      </details>
    </section>
  );
}
