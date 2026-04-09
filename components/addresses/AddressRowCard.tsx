"use client";

import type { ReactNode } from "react";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { ADDRESS_LABEL_KO } from "@/components/addresses/address-labels";
import { getLocationLabel } from "@/lib/products/form-options";
import { buildDeliveryDetailLines, buildTradePublicLine } from "@/lib/addresses/user-address-format";

function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "signature" }) {
  const cls =
    tone === "signature"
      ? "bg-signature/10 text-signature border-signature/20"
      : "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

export function AddressRowCard(props: {
  row: UserAddressDTO;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: (patch: Record<string, boolean>) => void;
  busyId: string | null;
}) {
  const { row, onEdit, onDelete, onSetDefault, busyId: globalBusy } = props;
  const rowBusy = globalBusy === row.id;
  const title = row.nickname?.trim() || ADDRESS_LABEL_KO[row.labelType];
  const publicLine = buildTradePublicLine(row);
  const detail = buildDeliveryDetailLines(row);
  const locLine =
    row.appRegionId && row.appCityId ? getLocationLabel(row.appRegionId, row.appCityId) : publicLine;

  return (
    <li className="rounded-ui-rect border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <input
          type="radio"
          name="addr-master"
          className="mt-1"
          checked={row.isDefaultMaster}
          onChange={() => onSetDefault({ isDefaultMaster: true })}
          disabled={globalBusy !== null}
          aria-label={`${title} 대표 주소로 지정`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[14px] font-semibold text-gray-900">{title}</span>
            <Badge>{ADDRESS_LABEL_KO[row.labelType]}</Badge>
            {row.isDefaultMaster ? <Badge tone="signature">대표</Badge> : null}
            {row.isDefaultLife ? <Badge tone="signature">생활기본</Badge> : null}
            {row.isDefaultTrade ? <Badge tone="signature">거래기본</Badge> : null}
            {row.isDefaultDelivery ? <Badge tone="signature">배달기본</Badge> : null}
          </div>
          <p className="mt-1 text-[12px] text-gray-600">{locLine}</p>
          {detail ? (
            <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[11px] text-gray-500">{detail}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={row.isDefaultLife || rowBusy}
              onClick={() => onSetDefault({ isDefaultLife: true })}
              className="rounded-ui-rect border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-700 disabled:opacity-40"
            >
              생활 기본
            </button>
            <button
              type="button"
              disabled={row.isDefaultTrade || rowBusy}
              onClick={() => onSetDefault({ isDefaultTrade: true })}
              className="rounded-ui-rect border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-700 disabled:opacity-40"
            >
              거래 기본
            </button>
            <button
              type="button"
              disabled={row.isDefaultDelivery || rowBusy}
              onClick={() => onSetDefault({ isDefaultDelivery: true })}
              className="rounded-ui-rect border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-700 disabled:opacity-40"
            >
              배달 기본
            </button>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-ui-rect border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-800"
          >
            수정
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-ui-rect border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700"
          >
            삭제
          </button>
        </div>
      </div>
    </li>
  );
}
