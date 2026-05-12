"use client";

import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  getUserAddressDesignationPlainText,
  UserAddressDesignationTitle,
} from "@/components/addresses/UserAddressDesignationTitle";
import {
  buildAddressListDetailLine,
  buildAddressManagementListPrimaryLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";
import { formatPhAddressCardOneLine, formatPhAddressCardOneLinePlain } from "@/lib/addresses/ph-address-display";
import { ADDR_BODY, ADDR_ROW_TITLE } from "@/lib/ui/address-flow-viber";

export function AddressRowCard(props: {
  row: UserAddressDTO;
  onEdit: () => void;
  onDelete: () => void;
  /** 본문 탭 — 대표 주소로 지정(거래·동네·배달 기본) */
  onSetAsRepresentative?: () => void;
  busyId: string | null;
  containerClassName?: string;
}) {
  const { row, onEdit, onDelete, onSetAsRepresentative, busyId: globalBusy, containerClassName } = props;
  const rowBusy = globalBusy === row.id;
  const titlePlain = getUserAddressDesignationPlainText(row);
  const isPh = (row.countryCode ?? "PH").trim().toUpperCase() === "PH";
  const phOne = isPh ? formatPhAddressCardOneLine(row) : null;

  const sub = isPh
    ? formatPhAddressCardOneLinePlain(row)
    : stripCountryFromAddressDisplayLine(
        buildAddressManagementListPrimaryLine(row),
        row.countryName,
      );
  const detailLine = isPh ? null : buildAddressListDetailLine(row, sub);

  return (
    <li className={`flex items-start gap-2 px-1 py-3.5 sm:gap-3 sm:px-2 ${containerClassName ?? ""}`}>
      <button
        type="button"
        disabled={rowBusy}
        onClick={() => onSetAsRepresentative?.()}
        className="min-w-0 flex-1 rounded-sam-sm px-0 py-0 pr-1 text-left disabled:opacity-50 sm:pr-0"
        aria-label={
          row.isDefaultMaster
            ? `${titlePlain}, 현재 대표 주소, ${sub}${detailLine ? `, 상세주소 ${detailLine}` : ""}`
            : `${titlePlain}, 탭하면 대표 주소로 지정, ${sub}${detailLine ? `, 상세주소 ${detailLine}` : ""}`
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <UserAddressDesignationTitle row={row} className={ADDR_ROW_TITLE} />
          {row.isDefaultMaster ? (
            <span className="rounded-full bg-sam-primary px-2 py-0.5 sam-text-xxs font-bold text-white">
              대표
            </span>
          ) : (
            <span className="sam-text-xxs font-medium text-sam-muted">탭하여 대표</span>
          )}
        </div>
        <p className={`mt-0.5 ${ADDR_BODY} sam-text-body-secondary`}>
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
        </p>
        {detailLine ? (
          <div className="mt-2 flex min-w-0 max-w-full flex-nowrap items-end gap-2">
            <span className="shrink-0 pb-0.5 sam-text-helper font-semibold text-sam-primary">상세주소</span>
            <span
              className="min-w-0 flex-1 border-b border-sam-primary-border/55 pb-0.5 text-left sam-text-body font-bold text-sam-fg"
              translate="no"
            >
              {detailLine}
            </span>
          </div>
        ) : null}
      </button>
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
