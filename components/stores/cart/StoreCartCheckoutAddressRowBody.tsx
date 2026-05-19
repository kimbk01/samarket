"use client";

import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { getUserAddressDesignationPlainText } from "@/components/addresses/UserAddressDesignationTitle";
import { splitCheckoutAddressBodyParts } from "@/lib/addresses/ph-address-display";

const ADDR_BADGE_BASE =
  "inline-flex shrink-0 items-center rounded-[4px] border px-2 py-0.5 text-[10px] font-bold leading-snug";

function AddressBodyText(props: {
  primaryLines: string[];
  detailLine: string | null;
  extraLines: string[];
  emptyFallback?: string;
}) {
  const { primaryLines, detailLine, extraLines, emptyFallback } = props;
  const hasBody = primaryLines.length > 0 || detailLine || extraLines.length > 0;

  if (!hasBody) {
    return emptyFallback ? (
      <p className="mt-1 whitespace-pre-wrap sam-text-helper font-normal leading-relaxed text-sam-fg">
        {emptyFallback}
      </p>
    ) : null;
  }

  return (
    <div className="mt-1 space-y-1">
      {primaryLines.map((line, i) => (
        <p
          key={`${i}:${line}`}
          className="whitespace-pre-wrap sam-text-helper font-normal leading-relaxed text-sam-fg"
        >
          {line}
        </p>
      ))}
      {detailLine ? (
        <p className="whitespace-pre-wrap sam-text-helper font-bold leading-relaxed text-sam-fg">
          {detailLine}
        </p>
      ) : null}
      {extraLines.map((line, i) => (
        <p key={`${i}:${line}`} className="sam-text-xxs leading-snug text-sam-muted">
          {line}
        </p>
      ))}
    </div>
  );
}

/** 주소록 `AddressRowCard` 와 동일 뱃지·본문 규칙(장바구니 배송지 라디오) */
export function StoreCartCheckoutAddressRowBody(props: {
  row: UserAddressDTO | null;
  /** `labelType === "shop"` 일 때 매장명(있으면) */
  linkedSamarketStoreDisplayName?: string | null;
  /** 저장 주소 없이 프로필·checkout-contact 만 있을 때 */
  profileFallback?: {
    primaryLines: string[];
    detailLine: string | null;
  } | null;
  emptyFallback?: string;
}) {
  const { row, linkedSamarketStoreDisplayName, profileFallback, emptyFallback } = props;

  if (row) {
    const designationPlain = getUserAddressDesignationPlainText(row, {
      linkedSamarketStoreDisplayName,
    });
    const linkedStoreId = row.linkedStoreId?.trim() ?? "";
    const isStoreAddress = row.labelType === "shop" && Boolean(linkedStoreId);
    const { primaryLines, detailLine, extraLines } = splitCheckoutAddressBodyParts(row);

    return (
      <>
        <div className="flex min-h-[26px] flex-wrap items-center gap-1.5">
          <span
            className={`${ADDR_BADGE_BASE} border-sam-border bg-white text-sam-fg`}
            translate="no"
          >
            {designationPlain}
          </span>
          {row.isDefaultMaster ? (
            <span
              className={`${ADDR_BADGE_BASE} border-rose-400/70 bg-rose-50 text-rose-800`}
              translate="no"
            >
              Default Address
            </span>
          ) : null}
          {isStoreAddress ? (
            <span
              className={`${ADDR_BADGE_BASE} border-slate-400/55 bg-slate-200/90 text-slate-900`}
              translate="no"
            >
              Store Address
            </span>
          ) : null}
        </div>
        <AddressBodyText
          primaryLines={primaryLines}
          detailLine={detailLine}
          extraLines={extraLines}
          emptyFallback={emptyFallback}
        />
      </>
    );
  }

  if (profileFallback) {
    return (
      <AddressBodyText
        primaryLines={profileFallback.primaryLines}
        detailLine={profileFallback.detailLine}
        extraLines={[]}
        emptyFallback={emptyFallback}
      />
    );
  }

  return (
    <AddressBodyText
      primaryLines={[]}
      detailLine={null}
      extraLines={[]}
      emptyFallback={emptyFallback}
    />
  );
}
