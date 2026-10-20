"use client";

/**
 * CONTRACT — 내정보 주소관리·배달 홈 주소 시트·마이페이지 시트 공통 본문.
 * PH 표기: `formatAddressBookLine` = compact continuous address string
 *   (detail bold + rest, country excluded, natural wrap — NOT forced single visual row)
 * 핀: `AddressKindHeadPin` signature green teardrop 통일.
 * DO NOT: nowrap / truncate / line-clamp / field별 `<br>` · 시트마다 별도 포맷.
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { buildAddressListDetailLine } from "@/lib/addresses/user-address-format";
import {
  formatUserAddressListPlainLine,
  isPhUserAddressRow,
} from "@/lib/addresses/format-user-address-list-line";
import { ADDR_BODY, ADDR_LIST_BADGE_BASE } from "@/lib/ui/address-flow-viber";
import {
  displayInputFromDto,
  resolveCanonicalDisplayLines,
} from "@/lib/addresses/canonical-address-display";
import {
  addressDesignationBadgeClass,
  addressMasterBadgeClass,
  addressStoreLinkedBadgeClass,
} from "@/lib/ui/address-list-starbucks-styles";
import type { MessageKey } from "@/lib/i18n/messages";

/** 주소 라벨 뱃지 글자 — 집 · 회사 · 기타 · 매장 (S06 행 표시) */
const ADDRESS_LABEL_KIND_KEYS: Record<UserAddressDTO["labelType"], MessageKey> = {
  home: "addr_ui_kind_home",
  office: "addr_ui_kind_office",
  shop: "addr_ui_kind_shop",
  other: "mypage_s07_label_other",
};
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";

const ADDR_LIST_ADDRESS_TEXT = `${ADDR_BODY} sam-text-body-secondary leading-snug text-sam-muted`;

export function AddressListRowBody({
  row,
  approvedStoresById,
  addressMainClassName,
  preferFullAddressLine = false,
  badgeStyle = "legacy",
}: {
  row: UserAddressDTO;
  approvedStoresById?: ReadonlyMap<string, string>;
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
  const bookLines = resolveCanonicalDisplayLines(
    displayInputFromDto(
      row,
      {
        home: t("addr_v2_label_home"),
        office: t("addr_v2_label_office"),
        shop: t("addr_ui_kind_shop"),
      },
      samarketStoreDisplayName || null,
    ),
  );
  const detailLine =
    preferFullAddressLine || isPh ? null : buildAddressListDetailLine(row, sub);

  const recipientName = row.recipientName?.trim() ?? "";
  const phoneRaw = row.phoneNumber?.trim() ?? "";
  const showRecipientRow = Boolean(recipientName || phoneRaw);

  const headKind = isShopLinked ? "store" : row.isDefaultMaster ? "master" : "general";
  const mainTextClass = addressMainClassName ?? "text-sam-fg";
  const useStarbucksBadges = badgeStyle === "starbucks";

  return (
    <>
      {showRecipientRow ?
        <p className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sam-text-xxs">
          {recipientName ?
            <span className="font-bold text-sam-fg">{recipientName}</span>
          : null}
          {phoneRaw ?
            <span className="font-medium text-sam-muted">{phoneRaw}</span>
          : null}
        </p>
      : null}

      <div className="flex min-h-[26px] flex-wrap items-center gap-1.5">
        {useStarbucksBadges && !isStoreAddress ?
          <span
            className={addressDesignationBadgeClass(row.labelType)}
            translate="no"
            data-testid="address-row-label"
          >
            {t(ADDRESS_LABEL_KIND_KEYS[row.labelType])}
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
            {t("addr_v2_current_address")}
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
      </div>

      <div className={`mt-1.5 flex gap-2 ${ADDR_LIST_ADDRESS_TEXT}`}>
        <AddressKindHeadPin kind={headKind} className="pt-0.5" />
        <div className={`min-w-0 flex-1 break-words ${mainTextClass}`}>
          {bookLines.detailLine ? (
            <p className="font-semibold leading-snug text-sam-fg">{bookLines.detailLine}</p>
          ) : null}
          {bookLines.title ? (
            <p className={`${bookLines.detailLine ? "mt-0.5" : ""} sam-text-body font-bold leading-snug text-sam-fg`}>
              {bookLines.title}
            </p>
          ) : null}
          {bookLines.addressLine ? (
            <p className="mt-0.5 leading-snug text-sam-muted">{bookLines.addressLine}</p>
          ) : null}
        </div>
      </div>

      {detailLine ?
        <div className="mt-2 flex min-w-0 max-w-full flex-nowrap items-end gap-2">
          <span className="shrink-0 pb-0.5 sam-text-xxs font-semibold uppercase tracking-wide text-sam-primary">
            {t("addr_ui_detail_address_label")}
          </span>
          <span
            className="min-w-0 flex-1 border-b border-sam-primary-border/55 pb-0.5 text-left sam-text-body-secondary font-bold text-sam-fg [overflow-wrap:anywhere]"
            translate="no"
          >
            {detailLine}
          </span>
        </div>
      : null}
    </>
  );
}
