"use client";

/**
 * CONTRACT — 내정보 주소관리·배달 홈 주소 시트·마이페이지 시트 공통 본문.
 * PH 표기: `formatAddressBookLine` = compact continuous address string
 *   (detail bold + rest, country excluded, natural wrap — NOT forced single visual row)
 * 핀: `AddressKindHeadPin` gold teardrop 통일.
 * DO NOT: nowrap / truncate / line-clamp / field별 `<br>` · 시트마다 별도 포맷.
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { getUserAddressDesignationPlainText } from "@/components/addresses/UserAddressDesignationTitle";
import { buildAddressListDetailLine } from "@/lib/addresses/user-address-format";
import {
  formatUserAddressListPlainLine,
  isPhUserAddressRow,
} from "@/lib/addresses/format-user-address-list-line";
import { ADDR_BODY, ADDR_LIST_BADGE_BASE } from "@/lib/ui/address-flow-viber";
import {
  addressDesignationBadgeClass,
  addressMasterBadgeClass,
  addressStoreLinkedBadgeClass,
  addressTapRepresentativeBadgeClass,
} from "@/lib/ui/address-list-starbucks-styles";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import { AddressUserRowLineText } from "@/components/addresses/AddressPhCardLineText";

const ADDR_LIST_ADDRESS_TEXT = `${ADDR_BODY} text-[12px] leading-snug text-sam-muted`;

export function AddressListRowBody({
  row,
  approvedStoresById,
  showDefaultDeliveryBadge = false,
  showTapRepresentative = false,
  addressMainClassName,
  preferFullAddressLine = false,
  badgeStyle = "legacy",
}: {
  row: UserAddressDTO;
  approvedStoresById?: ReadonlyMap<string, string>;
  showDefaultDeliveryBadge?: boolean;
  showTapRepresentative?: boolean;
  addressMainClassName?: string;
  /** 비PH — 상세 줄을 본문에 합쳐 한 줄로 */
  preferFullAddressLine?: boolean;
  badgeStyle?: "legacy" | "starbucks";
}) {
  const { t } = useI18n();
  const isPh = isPhUserAddressRow(row);
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

  const sub = formatUserAddressListPlainLine(row, phOpts);
  const detailLine =
    preferFullAddressLine || isPh ? null : buildAddressListDetailLine(row, sub);

  const designationPlain = getUserAddressDesignationPlainText(row, {
    linkedSamarketStoreDisplayName: samarketStoreDisplayName || null,
  });

  const recipientName = row.recipientName?.trim() ?? "";
  const phoneRaw = row.phoneNumber?.trim() ?? "";
  const showRecipientRow = Boolean(recipientName || phoneRaw);

  const headKind = isShopLinked ? "store" : row.isDefaultMaster ? "master" : "general";
  const mainTextClass = addressMainClassName ?? "text-sam-fg";
  const useStarbucksBadges = badgeStyle === "starbucks";

  const designationBadgeClass = useStarbucksBadges
    ? addressDesignationBadgeClass(row.labelType)
    : `${ADDR_LIST_BADGE_BASE} border-sam-border bg-white text-sam-fg`;

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
        <span className={designationBadgeClass} translate="no">
          {designationPlain}
        </span>
        {showDefaultDeliveryBadge && row.isDefaultDelivery ?
          <span
            className={
              useStarbucksBadges
                ? `${ADDR_LIST_BADGE_BASE} border-[#00704A]/30 bg-[#D4E9E2] text-[#00704A]`
                : `${ADDR_LIST_BADGE_BASE} border-rose-400/70 bg-rose-50 text-rose-800`
            }
            translate="no"
          >
            {t("addr_ui_default_delivery")}
          </span>
        : null}
        {row.isDefaultMaster ?
          <span
            className={
              useStarbucksBadges
                ? addressMasterBadgeClass()
                : `${ADDR_LIST_BADGE_BASE} border-rose-400/70 bg-rose-50 text-rose-800`
            }
            translate="no"
          >
            {t("addr_ui_badge_default_address")}
          </span>
        : null}
        {isStoreAddress ?
          <span
            className={
              useStarbucksBadges
                ? addressStoreLinkedBadgeClass()
                : `${ADDR_LIST_BADGE_BASE} border-slate-400/55 bg-slate-200/90 text-slate-900`
            }
            translate="no"
          >
            {t("addr_ui_badge_store_address")}
          </span>
        : null}
        {showTapRepresentative && !row.isDefaultMaster && !isStoreAddress ?
          <span
            className={
              useStarbucksBadges
                ? addressTapRepresentativeBadgeClass()
                : `${ADDR_LIST_BADGE_BASE} border-dashed border-sam-border/90 bg-sam-app font-semibold text-sam-muted`
            }
            translate="no"
          >
            {t("addr_ui_tap_representative")}
          </span>
        : null}
      </div>

      <div className={`mt-1.5 flex gap-2 ${ADDR_LIST_ADDRESS_TEXT}`}>
        <AddressKindHeadPin kind={headKind} className="pt-0.5" />
        <div className={`min-w-0 flex-1 break-words ${mainTextClass}`}>
          <AddressUserRowLineText
            row={row}
            opts={phOpts}
            mainTextClassName={mainTextClass}
            detailClassName="font-bold text-sam-fg"
          />
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
