"use client";

import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { ADDRESS_LABEL_KO } from "@/components/addresses/address-labels";
import { buildTradePublicLine } from "@/lib/addresses/user-address-format";

export function AddressRowCard(props: {
  row: UserAddressDTO;
  onEdit: () => void;
  onDelete: () => void;
  busyId: string | null;
}) {
  const { row, onEdit, onDelete, busyId: globalBusy } = props;
  const rowBusy = globalBusy === row.id;
  const title = row.nickname?.trim() || ADDRESS_LABEL_KO[row.labelType];
  const sub = buildTradePublicLine(row);

  return (
    <li className="flex items-start gap-3 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-gray-900">{title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-gray-500">{sub || "—"}</p>
      </div>
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
