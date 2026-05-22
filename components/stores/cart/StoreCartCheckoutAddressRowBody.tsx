"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { getUserAddressDesignationPlainText } from "@/components/addresses/UserAddressDesignationTitle";
import {
  buildAddressListDetailLine,
  buildAddressManagementListPrimaryLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";
import { formatPhAddressCardOneLine } from "@/lib/addresses/ph-address-display";
import { ADDR_BODY } from "@/lib/ui/address-flow-viber";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";

const ADDR_BADGE_BASE =
  "inline-flex shrink-0 items-center rounded-[4px] border px-2 py-0.5 text-[10px] font-bold leading-snug";

/** 본문 설명 줄 — `AddressRowCard` 와 동일 */
const ADDR_LIST_ADDRESS_TEXT = `${ADDR_BODY} text-[12px] leading-snug text-sam-muted`;

function ProfileFallbackBody(props: {
  primaryLines: string[];
  detailLine: string | null;
  emptyFallback?: string;
}) {
  const { primaryLines, detailLine, emptyFallback } = props;
  const hasBody = primaryLines.length > 0 || detailLine;

  if (!hasBody) {
    return emptyFallback ? (
      <p className="mt-1 whitespace-pre-wrap sam-text-helper font-normal leading-relaxed text-sam-fg">
        {emptyFallback}
      </p>
    ) : null;
  }

  const detailAlreadyInPrimary =
    detailLine &&
    primaryLines.some(
      (line) =>
        line.toLowerCase() === detailLine.toLowerCase() ||
        line.toLowerCase().includes(detailLine.toLowerCase()),
    );

  return (
    <>
      <div className={`mt-1.5 flex gap-2 ${ADDR_LIST_ADDRESS_TEXT}`}>
        <AddressKindHeadPin kind="general" className="pt-0.5" />
        <div className="min-w-0 flex-1">
          {primaryLines.length > 0 ? (
            primaryLines.map((line, i) => (
              <p key={`${i}:${line}`} className="whitespace-pre-wrap text-sam-fg">
                {line}
              </p>
            ))
          ) : (
            <span className="text-sam-fg">—</span>
          )}
        </div>
      </div>
      {detailLine && !detailAlreadyInPrimary ? (
        <ProfileDetailLabeledLine detail={detailLine} />
      ) : null}
    </>
  );
}

function ProfileDetailLabeledLine({ detail }: { detail: string }) {
  const { t } = useI18n();
  return (
    <div className="mt-2 flex min-w-0 max-w-full flex-nowrap items-end gap-2">
      <span className="shrink-0 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-sam-primary">
        {t("addr_ui_detail_address_label")}
      </span>
      <span
        className="min-w-0 flex-1 border-b border-sam-primary-border/55 pb-0.5 text-left text-[12px] font-bold text-sam-fg"
        translate="no"
      >
        {detail}
      </span>
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
    const isPh = (row.countryCode ?? "PH").trim().toUpperCase() === "PH";
    const isShopLinked = row.labelType === "shop" && Boolean(linkedStoreId);

    const phOpts = {
      suppressGateBuildingIfMatchesSamarketStore: linkedSamarketStoreDisplayName?.trim() || null,
    };
    const phOne = isPh ? formatPhAddressCardOneLine(row, phOpts) : null;

    const sub = isPh
      ? null
      : stripCountryFromAddressDisplayLine(
          buildAddressManagementListPrimaryLine(row),
          row.countryName,
        );
    const detailLine = isPh ? null : buildAddressListDetailLine(row, sub ?? "");

    const recipientName = row.recipientName?.trim() ?? "";
    const phoneRaw = row.phoneNumber?.trim() ?? "";
    const showRecipientRow = Boolean(recipientName || phoneRaw);

    const headKind = isShopLinked ? "store" : row.isDefaultMaster ? "master" : "general";

    const hasPhStreet = Boolean(phOne?.gatePrefix || phOne?.streetBody);
    const hasNonPhBody = Boolean(sub && sub !== "—");
    const hasBody = hasPhStreet || hasNonPhBody || detailLine;

    if (!hasBody) {
      return emptyFallback ? (
        <p className="mt-1 whitespace-pre-wrap sam-text-helper font-normal leading-relaxed text-sam-fg">
          {emptyFallback}
        </p>
      ) : null;
    }

    return (
      <>
        {showRecipientRow ? (
          <p className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]">
            {recipientName ? <span className="font-bold text-sam-fg">{recipientName}</span> : null}
            {phoneRaw ? <span className="font-medium text-sam-muted">{phoneRaw}</span> : null}
          </p>
        ) : null}

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

        <div className={`mt-1.5 flex gap-2 ${ADDR_LIST_ADDRESS_TEXT}`}>
          <AddressKindHeadPin kind={headKind} className="pt-0.5" />
          <div className="min-w-0 flex-1">
            {isPh && phOne ? (
              <>
                {phOne.gatePrefix ? (
                  <strong className="font-bold text-sam-fg">{phOne.gatePrefix}</strong>
                ) : null}
                {phOne.gatePrefix && phOne.streetBody ? <span className="text-sam-fg">, </span> : null}
                {phOne.streetBody ? <span className="text-sam-fg">{phOne.streetBody}</span> : null}
                {!phOne.gatePrefix && !phOne.streetBody ? "—" : null}
              </>
            ) : (
              sub || "—"
            )}
          </div>
        </div>

        {detailLine ? <ProfileDetailLabeledLine detail={detailLine} /> : null}
      </>
    );
  }

  if (profileFallback) {
    return <ProfileFallbackBody {...profileFallback} emptyFallback={emptyFallback} />;
  }

  return emptyFallback ? (
    <p className="mt-1 whitespace-pre-wrap sam-text-helper font-normal leading-relaxed text-sam-fg">
      {emptyFallback}
    </p>
  ) : null;
}
