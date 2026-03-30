"use client";

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
      <div className="min-h-0 flex-1 rounded-md bg-stone-300" />
    </div>
  );
}

/** 가로 셀 (구분선은 부모에서 VSeparator로 삽입) */
function CommerceMetricCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0 px-1.5 py-0 text-center">
      <span className="text-[11px] font-medium leading-none text-stone-500">{label}</span>
      <div className="w-full min-w-0 text-[13px] font-semibold leading-tight text-stone-900">{value}</div>
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
  const minDd =
    minOrderPhp != null && minOrderPhp > 0 ? formatMoneyPhp(minOrderPhp) : `${formatMoneyPhp(0)}`;
  const feeDd =
    deliveryAvailable && deliveryFeePhp != null && deliveryFeePhp >= 0
      ? formatMoneyPhp(deliveryFeePhp)
      : deliveryAvailable
        ? "문의"
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
      ? `${formatMoneyPhp(deliveryMeta.freeDeliveryOverPhp)}↑ 무료배달`
      : null;
  const courier = deliveryAvailable && deliveryCourierLabel?.trim() ? deliveryCourierLabel.trim() : null;

  /** 최소주문 · 배달비 · 결제 · 영업시간 — 한 행, 좁은 화면에서 가로 스크롤 */
  const metricsRow = (
    <div className="flex w-full min-w-[320px] items-stretch">
      <CommerceMetricCell label="최소주문" value={minDd} />
      <CommerceMetricVSeparator />
      <CommerceMetricCell label="배달비(안내)" value={feeDd} />
      <CommerceMetricVSeparator />
      <CommerceMetricCell
        label="결제"
        value={<span className="line-clamp-2 break-words">{pay}</span>}
      />
      <CommerceMetricVSeparator />
      <CommerceMetricCell
        label="영업시간"
        value={
          <span className="line-clamp-2 break-words tabular-nums text-stone-900">{hoursBusiness}</span>
        }
      />
    </div>
  );

  return (
    <>
      <div
        className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]"
        role="group"
        aria-label="배달·주문 요약"
      >
        <div className="border-b border-stone-200 py-0">
          {metricsRow}
        </div>
      </div>
      {freeLine ? (
        <p className="mt-2.5 text-[12px] font-medium text-emerald-800">{freeLine}</p>
      ) : null}
      {courier ? (
        <p className="mt-1 text-[12px] text-stone-600">
          <span className="font-medium text-stone-700">배달 안내</span> · {courier}
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
  return (
    <div className={`${STORE_DETAIL_GUTTER} mt-3 ${STORE_DETAIL_CARD} p-4`}>
      <StoreDetailSectionTitle level="h2">배달·주문 안내</StoreDetailSectionTitle>
      <div className="-mt-1">
        <StoreDetailCommerceMetrics
          deliveryMeta={deliveryMeta}
          minOrderPhp={minOrderPhp}
          deliveryFeePhp={deliveryFeePhp}
          deliveryCourierLabel={deliveryCourierLabel}
          deliveryAvailable={deliveryAvailable}
        />
      </div>
      <p className="mt-3 text-[12px] leading-snug text-stone-500">
        상세 주소·전단지는{" "}
        <Link
          href={`/stores/${encodeURIComponent(storeSlug)}/info`}
          className="font-semibold text-signature underline decoration-signature/30 underline-offset-2"
        >
          가게정보
        </Link>
        에서 확인할 수 있어요.
      </p>
    </div>
  );
}

export function StoreDetailInquiryActions({ phone }: { phone: string | null }) {
  const href =
    telHrefFromLoosePhPhone(phone) ?? (phone?.replace(/\s/g, "") ? `tel:${phone.replace(/\s/g, "")}` : "");
  const btn =
    "flex flex-1 items-center justify-center rounded-xl border border-stone-200 bg-[#fafafa] py-2.5 text-center text-[14px] font-semibold text-stone-900 shadow-sm active:bg-stone-100";
  const disabled =
    "flex flex-1 cursor-not-allowed items-center justify-center rounded-xl border border-stone-200 bg-stone-50 py-2.5 text-center text-[14px] text-stone-400";
  return (
    <div className={`${STORE_DETAIL_GUTTER} mt-3 ${STORE_DETAIL_CARD} p-4`}>
      <StoreDetailSectionTitle level="h2">문의</StoreDetailSectionTitle>
      <div className="-mt-1 flex gap-2">
        {href ? (
          <a href={href} className={btn}>
            전화 문의
          </a>
        ) : (
          <span className={disabled}>전화 문의</span>
        )}
        <Link href="/chat" className={btn}>
          채팅 문의
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
  const line =
    customText.trim() ||
    (freeOverPhp != null && freeOverPhp > 0
      ? `${formatMoneyPhp(freeOverPhp)} 이상 주문 시 배달비 무료(안내)`
      : "");
  if (!line) return null;
  const boxClass =
    "flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] font-normal leading-snug text-amber-950 shadow-sm";
  return (
    <div className={embedded ? `mt-3 ${boxClass}` : `${STORE_DETAIL_GUTTER} mt-3 ${boxClass}`}>
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-200/80 text-[11px] font-bold text-amber-900">
        i
      </span>
      <p>{line}</p>
    </div>
  );
}
