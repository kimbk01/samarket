"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { getUserAddressDesignationPlainText } from "@/components/addresses/UserAddressDesignationTitle";
import {
  buildAddressListDetailLine,
  buildAddressManagementListPrimaryLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";
import { formatPhAddressCardOneLinePlain } from "@/lib/addresses/ph-address-display";
import { AddressListRowBody } from "@/components/addresses/AddressListRowBody";

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
  const { t } = useI18n();
  const rowBusy = globalBusy === row.id;
  const isPh = (row.countryCode ?? "PH").trim().toUpperCase() === "PH";
  const linkedStoreId = row.linkedStoreId?.trim() ?? "";
  const samarketStoreDisplayName =
    row.labelType === "shop" && linkedStoreId
      ? (approvedStoresById?.get(linkedStoreId)?.trim() ?? "")
      : "";
  const phOpts = {
    suppressGateBuildingIfMatchesSamarketStore: samarketStoreDisplayName || null,
  };

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

  const detailPart = detailLine ? t("addr_ui_aria_detail_part", { detail: detailLine }) : "";
  const ariaPrimary = onSetAsRepresentative
    ? row.isDefaultMaster
      ? `${designationPlain}, ${t("addr_ui_aria_current_master")}, ${sub}${detailPart}`
      : `${designationPlain}, ${t("addr_ui_aria_tap_master")}, ${sub}${detailPart}`
    : `${designationPlain}, ${t("addr_ui_aria_store_linked")}${row.isDefaultMaster ? `, ${t("addr_ui_aria_current_master")}` : ""}, ${sub}${detailPart}`;

  const primaryClass =
    "min-w-0 flex-1 rounded-sam-sm px-0 py-0 pr-1 text-left sm:pr-0" +
    (onSetAsRepresentative ? "" : " cursor-default");

  const primaryInner = (
    <AddressListRowBody
      row={row}
      approvedStoresById={approvedStoresById}
      showTapRepresentative={Boolean(onSetAsRepresentative)}
    />
  );

  return (
    <li className={`flex items-start gap-2 px-1 py-3.5 sm:gap-3 sm:px-2 ${containerClassName ?? ""}`}>
      {onSetAsRepresentative ?
        <button
          type="button"
          disabled={rowBusy}
          onClick={() => onSetAsRepresentative()}
          className={`${primaryClass} disabled:opacity-50`}
          aria-label={ariaPrimary}
        >
          {primaryInner}
        </button>
      : <div className={primaryClass} role="group" aria-label={ariaPrimary}>
          {primaryInner}
        </div>
      }
      <div className="flex shrink-0 items-start justify-end gap-0 self-start pt-0.5">
        <button
          type="button"
          onClick={onEdit}
          disabled={rowBusy}
          className="sam-header-action flex h-10 w-10 items-center justify-center text-sam-muted transition-colors hover:text-sam-primary disabled:opacity-40"
          aria-label={t("common_edit")}
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
          aria-label={t("common_delete")}
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
