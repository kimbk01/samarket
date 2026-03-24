"use client";

import Link from "next/link";
import {
  StoreDetailCommerceMetrics,
  StoreDetailPromoBanner,
} from "@/components/stores/StoreDetailDeliveryRows";
import type { StoreDeliveryMeta } from "@/lib/stores/store-detail-meta";
import type { CommerceExtrasFromHours } from "@/lib/stores/store-commerce-extras";
import { StorePublicNoticesList } from "@/components/stores/StorePublicNoticesList";

type CommerceHint = {
  breakConfigured: boolean;
  breakRangeLabel: string;
  inBreak: boolean;
} | null;

export function StoreDetailStorefrontPanel({
  deliveryMeta,
  commerceExtras,
  deliveryAvailable,
  pickupAvailable,
  isOpen,
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
  return (
    <section
      className="mt-1 w-full rounded-none border-b border-stone-200 bg-white px-4 pt-2 pb-4 shadow-sm"
      aria-label="매장 요약"
    >
      {ownerManagementHref ? (
        <p className="mb-2 text-center">
          <Link
            href={ownerManagementHref}
            className="text-[12px] font-semibold text-signature underline decoration-signature/30 underline-offset-2"
          >
            내 상점 관리
          </Link>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-2">
        <span
          className={`inline-flex rounded-none px-2.5 py-1 text-[12px] font-semibold ${
            isOpen ? "bg-emerald-100 text-emerald-900" : "bg-stone-200 text-stone-700"
          }`}
        >
          {isOpen ? "영업 중" : "준비 중"}
        </span>
        <span className="inline-flex rounded-none border border-stone-200 bg-white px-2.5 py-1 text-[12px] font-medium text-stone-800">
          {deliveryAvailable ? "배달" : "배달 불가"}
        </span>
        <span className="inline-flex rounded-none border border-stone-200 bg-white px-2.5 py-1 text-[12px] font-medium text-stone-800">
          {pickupAvailable ? "포장 픽업" : "포장 픽업 불가"}
        </span>
        {commerce?.breakConfigured ? (
          <span className="inline-flex rounded-none border border-violet-200 bg-violet-50 px-2.5 py-1 text-[12px] font-medium text-violet-900">
            Break {commerce.breakRangeLabel}
          </span>
        ) : null}
        <Link
          href={storeInfoHref}
          className="shrink-0 text-[12px] font-semibold text-stone-800 underline decoration-stone-300 underline-offset-2 active:text-stone-600"
        >
          {'가게 정보 >'}
        </Link>
      </div>

      <div className="mt-2 border-t border-stone-100 pt-2">
        <StoreDetailCommerceMetrics
          deliveryMeta={deliveryMeta}
          minOrderPhp={commerceExtras.minOrderPhp}
          deliveryFeePhp={commerceExtras.deliveryFeePhp}
          deliveryCourierLabel={commerceExtras.deliveryCourierLabel}
          deliveryAvailable={deliveryAvailable}
        />
      </div>

      <StoreDetailPromoBanner
        freeOverPhp={deliveryMeta.freeDeliveryOverPhp}
        customText=""
        embedded
      />

      <StorePublicNoticesList lines={deliveryMeta.publicNotices} className="mt-3" />

      {deliveryMeta.deliveryNotice.trim() ? (
        <details className="mt-3 rounded-none border border-stone-200 bg-white px-3 py-2 text-stone-800 shadow-sm">
          <summary className="cursor-pointer py-2 text-[13px] font-semibold">배달·지역 상세 안내</summary>
          <p className="border-t border-stone-100 pb-3 pt-2 text-[12px] font-normal leading-relaxed whitespace-pre-wrap text-stone-600">
            {deliveryMeta.deliveryNotice}
          </p>
        </details>
      ) : null}
    </section>
  );
}
