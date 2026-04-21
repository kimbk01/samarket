"use client";

import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { ADDRESS_LABEL_KO } from "@/components/addresses/address-labels";
import {
  buildAddressListDetailLine,
  buildAddressManagementListPrimaryLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";
import { ADDR_BODY, ADDR_ROW_TITLE } from "@/lib/ui/address-flow-viber";

export function AddressRowCard(props: {
  row: UserAddressDTO;
  onEdit: () => void;
  onDelete: () => void;
  /** 본문 탭 — 대표 주소로 지정(거래·동네·배달 기본) */
  onSetAsRepresentative?: () => void;
  busyId: string | null;
}) {
  const { row, onEdit, onDelete, onSetAsRepresentative, busyId: globalBusy } = props;
  const rowBusy = globalBusy === row.id;
  const rawNick = row.nickname?.trim();
  const title =
    rawNick && rawNick.toLowerCase() !== "null" && rawNick.toLowerCase() !== "undefined"
      ? rawNick
      : ADDRESS_LABEL_KO[row.labelType];
  const sub = stripCountryFromAddressDisplayLine(
    buildAddressManagementListPrimaryLine(row),
    row.countryName,
  );
  const detailLine = buildAddressListDetailLine(row, sub);

  return (
    <li className="flex items-start gap-2 px-1 py-3.5 sm:gap-3 sm:px-2">
      <button
        type="button"
        disabled={rowBusy}
        onClick={() => onSetAsRepresentative?.()}
        className="min-w-0 flex-1 rounded-ui-rect px-0 py-0 pr-1 text-left disabled:opacity-50 sm:pr-0"
        aria-label={
          row.isDefaultMaster
            ? `${title}, 현재 대표 주소, ${sub}${detailLine ? `, 상세주소 ${detailLine}` : ""}`
            : `${title}, 탭하면 대표 주소로 지정, ${sub}${detailLine ? `, 상세주소 ${detailLine}` : ""}`
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={ADDR_ROW_TITLE}>{title}</span>
          {row.isDefaultMaster ? (
            <span className="rounded-full bg-signature px-2 py-0.5 sam-text-xxs font-bold text-white shadow-sm">
              대표
            </span>
          ) : (
            <span className="sam-text-xxs font-medium text-sam-muted">탭하여 대표</span>
          )}
        </div>
        <p className={`mt-0.5 ${ADDR_BODY} sam-text-body-secondary`}>{sub || "—"}</p>
        {detailLine ? (
          <div className="mt-2 flex min-w-0 max-w-full flex-nowrap items-end gap-2">
            <span className="shrink-0 pb-0.5 sam-text-helper font-semibold text-signature/90">상세주소</span>
            <span
              className="min-w-0 flex-1 border-b border-sam-primary-border/55 pb-0.5 text-left sam-text-body-secondary text-sam-fg"
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
          className="flex h-9 w-9 items-center justify-center rounded-ui-rect text-sam-muted transition-colors hover:bg-sam-primary-soft/50 hover:text-signature disabled:opacity-40"
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
          className="flex h-9 w-9 items-center justify-center rounded-ui-rect text-sam-muted transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
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
