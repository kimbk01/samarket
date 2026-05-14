"use client";

import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { getUserAddressDesignationPlainText } from "@/components/addresses/UserAddressDesignationTitle";
import {
  buildAddressListDetailLine,
  buildAddressManagementListPrimaryLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";
import { formatPhAddressCardOneLine, formatPhAddressCardOneLinePlain } from "@/lib/addresses/ph-address-display";
import { ADDR_BODY } from "@/lib/ui/address-flow-viber";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";

const ADDR_BADGE_BASE =
  "inline-flex shrink-0 items-center rounded-[4px] border px-2 py-0.5 text-[10px] font-bold leading-snug";

/** 본문 설명 줄 — 기본 secondary(13px)보다 1px 작게 */
const ADDR_LIST_ADDRESS_TEXT = `${ADDR_BODY} text-[12px] leading-snug text-sam-muted`;

export function AddressRowCard(props: {
  row: UserAddressDTO;
  onEdit: () => void;
  onDelete: () => void;
  /** 본문 탭 — 대표 주소로 지정(거래·동네·배달 기본). 매장 연결 주소는 부모에서 넘기지 않는다. */
  onSetAsRepresentative?: () => void;
  busyId: string | null;
  containerClassName?: string;
  /** 승인 매장 id → `store_name` (Store Address 뱃지·헤더 `매장 · …` 에 사용) */
  approvedStoresById?: ReadonlyMap<string, string>;
}) {
  const { row, onEdit, onDelete, onSetAsRepresentative, busyId: globalBusy, containerClassName, approvedStoresById } = props;
  const rowBusy = globalBusy === row.id;
  const isPh = (row.countryCode ?? "PH").trim().toUpperCase() === "PH";
  const linkedStoreId = row.linkedStoreId?.trim() ?? "";
  const samarketStoreDisplayName =
    row.labelType === "shop" && linkedStoreId
      ? (approvedStoresById?.get(linkedStoreId)?.trim() ?? "")
      : "";
  const isStoreAddress =
    row.labelType === "shop" && !!linkedStoreId && (approvedStoresById?.has(linkedStoreId) ?? false);
  const isShopLinked = row.labelType === "shop" && Boolean(linkedStoreId);

  const phOpts = {
    suppressGateBuildingIfMatchesSamarketStore: samarketStoreDisplayName || null,
  };
  const phOne = isPh ? formatPhAddressCardOneLine(row, phOpts) : null;

  const sub = isPh
    ? formatPhAddressCardOneLinePlain(row, phOpts)
    : stripCountryFromAddressDisplayLine(
        buildAddressManagementListPrimaryLine(row),
        row.countryName,
      );
  const detailLine = isPh ? null : buildAddressListDetailLine(row, sub);

  const designationPlain = getUserAddressDesignationPlainText(row, {
    linkedSamarketStoreDisplayName: samarketStoreDisplayName || null,
  });

  const recipientName = row.recipientName?.trim() ?? "";
  const phoneRaw = row.phoneNumber?.trim() ?? "";
  const showRecipientRow = Boolean(recipientName || phoneRaw);

  const headKind = isShopLinked ? "store" : row.isDefaultMaster ? "master" : "general";

  const primaryClass =
    "min-w-0 flex-1 rounded-sam-sm px-0 py-0 pr-1 text-left sm:pr-0" +
    (onSetAsRepresentative ? "" : " cursor-default");

  const ariaPrimary = onSetAsRepresentative
    ? row.isDefaultMaster
      ? `${designationPlain}, 현재 대표 주소, ${sub}${detailLine ? `, 상세주소 ${detailLine}` : ""}`
      : `${designationPlain}, 탭하면 대표 주소로 지정, ${sub}${detailLine ? `, 상세주소 ${detailLine}` : ""}`
    : `${designationPlain}, 매장 연결 주소${row.isDefaultMaster ? ", 현재 대표 주소" : ""}, ${sub}${detailLine ? `, 상세주소 ${detailLine}` : ""}`;

  const primaryInner = (
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
        {onSetAsRepresentative && !row.isDefaultMaster && !isStoreAddress ? (
          <span
            className={`${ADDR_BADGE_BASE} border-dashed border-sam-border/90 bg-sam-app font-semibold text-sam-muted`}
            translate="no"
          >
            탭하여 대표
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

      {detailLine ? (
        <div className="mt-2 flex min-w-0 max-w-full flex-nowrap items-end gap-2">
          <span className="shrink-0 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-sam-primary">
            상세주소
          </span>
          <span
            className="min-w-0 flex-1 border-b border-sam-primary-border/55 pb-0.5 text-left text-[12px] font-bold text-sam-fg"
            translate="no"
          >
            {detailLine}
          </span>
        </div>
      ) : null}
    </>
  );

  return (
    <li className={`flex items-start gap-2 px-1 py-3.5 sm:gap-3 sm:px-2 ${containerClassName ?? ""}`}>
      {onSetAsRepresentative ? (
        <button
          type="button"
          disabled={rowBusy}
          onClick={() => onSetAsRepresentative()}
          className={`${primaryClass} disabled:opacity-50`}
          aria-label={ariaPrimary}
        >
          {primaryInner}
        </button>
      ) : (
        <div className={primaryClass} role="group" aria-label={ariaPrimary}>
          {primaryInner}
        </div>
      )}
      <div className="flex shrink-0 items-start justify-end gap-0 self-start pt-0.5">
        <button
          type="button"
          onClick={onEdit}
          disabled={rowBusy}
          className="sam-header-action flex h-10 w-10 items-center justify-center text-sam-muted transition-colors hover:text-sam-primary disabled:opacity-40"
          aria-label="수정"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.83L17.33 5.5a2 2 0 0 0-2.83 0L4 15.5V20z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={rowBusy}
          className="sam-header-action flex h-10 w-10 items-center justify-center text-sam-muted transition-colors hover:text-sam-danger disabled:opacity-40"
          aria-label="삭제"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </li>
  );
}
