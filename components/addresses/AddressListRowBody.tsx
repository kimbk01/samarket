"use client";

/**
 * CONTRACT — 내정보 주소관리·배달 홈 주소 시트 공통 본문.
 * DO NOT: 시트 전용 뱃지(pill)·browse mock 주소 한 줄 — 여기만 수정해 양쪽 동기화.
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { getUserAddressDesignationPlainText } from "@/components/addresses/UserAddressDesignationTitle";
import {
  buildAddressListDetailLine,
  buildAddressManagementListPrimaryLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";
import { formatPhAddressCardOneLine, formatPhAddressCardOneLinePlain } from "@/lib/addresses/ph-address-display";
import { ADDR_BODY, ADDR_LIST_BADGE_BASE } from "@/lib/ui/address-flow-viber";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";

const ADDR_LIST_ADDRESS_TEXT = `${ADDR_BODY} text-[12px] leading-snug text-sam-muted`;

export function AddressListRowBody({
  row,
  approvedStoresById,
  showDefaultDeliveryBadge = false,
  showTapRepresentative = false,
  addressMainClassName,
  preferFullAddressLine = false,
}: {
  row: UserAddressDTO;
  approvedStoresById?: ReadonlyMap<string, string>;
  /** 배달 홈 주소 시트 — `isDefaultDelivery` 뱃지 */
  showDefaultDeliveryBadge?: boolean;
  /** 내정보 — 대표 주소 탭 힌트 뱃지 */
  showTapRepresentative?: boolean;
  /** 배달 시트 등 — 본문 주소 색 오버라이드 */
  addressMainClassName?: string;
  /** 배달 홈 주소 시트 — 카드 한 줄 대신 주소관리 전체 한 줄 */
  preferFullAddressLine?: boolean;
}) {
  const { t } = useI18n();
  const isPh = (row.countryCode ?? "PH").trim().toUpperCase() === "PH";
  const linkedStoreId = row.linkedStoreId?.trim() ?? "";
  const samarketStoreDisplayName =
    row.labelType === "shop" && linkedStoreId ?
      (approvedStoresById?.get(linkedStoreId)?.trim() ?? "")
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
  const detailLine =
    preferFullAddressLine ? null : isPh ? null : buildAddressListDetailLine(row, sub);
  const fullAddressLine = preferFullAddressLine ? buildAddressManagementListPrimaryLine(row) : null;

  const designationPlain = getUserAddressDesignationPlainText(row, {
    linkedSamarketStoreDisplayName: samarketStoreDisplayName || null,
  });

  const recipientName = row.recipientName?.trim() ?? "";
  const phoneRaw = row.phoneNumber?.trim() ?? "";
  const showRecipientRow = Boolean(recipientName || phoneRaw);

  const headKind = isShopLinked ? "store" : row.isDefaultMaster ? "master" : "general";
  const mainTextClass = addressMainClassName ?? "text-sam-fg";

  return (
    <>
      {showRecipientRow ?
        <p className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]">
          {recipientName ?
            <span className="font-bold text-sam-fg">{recipientName}</span>
          : null}
          {phoneRaw ?
            <span className="font-medium text-sam-muted">{phoneRaw}</span>
          : null}
        </p>
      : null}

      <div className="flex min-h-[26px] flex-wrap items-center gap-1.5">
        <span
          className={`${ADDR_LIST_BADGE_BASE} border-sam-border bg-white text-sam-fg`}
          translate="no"
        >
          {designationPlain}
        </span>
        {showDefaultDeliveryBadge && row.isDefaultDelivery ?
          <span
            className={`${ADDR_LIST_BADGE_BASE} border-rose-400/70 bg-rose-50 text-rose-800`}
            translate="no"
          >
            {t("addr_ui_default_delivery")}
          </span>
        : null}
        {row.isDefaultMaster ?
          <span
            className={`${ADDR_LIST_BADGE_BASE} border-rose-400/70 bg-rose-50 text-rose-800`}
            translate="no"
          >
            Default Address
          </span>
        : null}
        {isStoreAddress ?
          <span
            className={`${ADDR_LIST_BADGE_BASE} border-slate-400/55 bg-slate-200/90 text-slate-900`}
            translate="no"
          >
            Store Address
          </span>
        : null}
        {showTapRepresentative && !row.isDefaultMaster && !isStoreAddress ?
          <span
            className={`${ADDR_LIST_BADGE_BASE} border-dashed border-sam-border/90 bg-sam-app font-semibold text-sam-muted`}
            translate="no"
          >
            {t("addr_ui_tap_representative")}
          </span>
        : null}
      </div>

      <div className={`mt-1.5 flex gap-2 ${ADDR_LIST_ADDRESS_TEXT}`}>
        <AddressKindHeadPin kind={headKind} className="pt-0.5" />
        <div className={`min-w-0 flex-1 break-words ${mainTextClass}`}>
          {preferFullAddressLine ?
            fullAddressLine || "—"
          : isPh && phOne ?
            <>
              {phOne.gatePrefix ?
                <strong className="font-bold text-sam-fg">{phOne.gatePrefix}</strong>
              : null}
              {phOne.gatePrefix && phOne.streetBody ?
                <span className={mainTextClass}>, </span>
              : null}
              {phOne.streetBody ?
                <span className={mainTextClass}>{phOne.streetBody}</span>
              : null}
              {!phOne.gatePrefix && !phOne.streetBody ?
                "—"
              : null}
            </>
          : sub || "—"}
        </div>
      </div>

      {detailLine ?
        <div className="mt-2 flex min-w-0 max-w-full flex-nowrap items-end gap-2">
          <span className="shrink-0 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-sam-primary">
            {t("addr_ui_detail_address_label")}
          </span>
          <span
            className="min-w-0 flex-1 border-b border-sam-primary-border/55 pb-0.5 text-left text-[12px] font-bold text-sam-fg"
            translate="no"
          >
            {detailLine}
          </span>
        </div>
      : null}
    </>
  );
}
