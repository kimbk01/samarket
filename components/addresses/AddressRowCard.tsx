"use client";

import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { ADDRESS_LABEL_KO } from "@/components/addresses/address-labels";
import {
  buildAddressListDetailLine,
  buildTradePublicLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";

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
  const sub = stripCountryFromAddressDisplayLine(buildTradePublicLine(row), row.countryName);
  const detailLine = buildAddressListDetailLine(row, sub);

  return (
    <li className="flex items-start gap-3 py-4">
      <button
        type="button"
        disabled={rowBusy}
        onClick={() => onSetAsRepresentative?.()}
        className="min-w-0 flex-1 rounded-ui-rect px-0 py-0 text-left disabled:opacity-50"
        aria-label={
          row.isDefaultMaster
            ? `${title}, 현재 대표 주소, ${sub}${detailLine ? `. ${detailLine}` : ""}`
            : `${title}, 탭하면 대표 주소로 지정, ${sub}${detailLine ? `. ${detailLine}` : ""}`
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[15px] font-semibold text-gray-900">{title}</span>
          {row.isDefaultMaster ? (
            <span className="rounded-full bg-signature/10 px-2 py-0.5 text-[10px] font-semibold text-signature">
              대표
            </span>
          ) : (
            <span className="text-[10px] font-medium text-gray-400">탭하여 대표</span>
          )}
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-gray-500">{sub || "—"}</p>
        {detailLine ? (
          <p
            className="mt-1 text-[13px] leading-snug text-gray-600"
            translate="no"
          >
            ({detailLine})
          </p>
        ) : null}
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onEdit}
          disabled={rowBusy}
          className="flex h-10 w-10 items-center justify-center rounded-ui-rect text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          aria-label="수정"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
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
          className="flex h-10 w-10 items-center justify-center rounded-ui-rect text-gray-500 hover:bg-gray-50 hover:text-red-700 disabled:opacity-40"
          aria-label="삭제"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
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
