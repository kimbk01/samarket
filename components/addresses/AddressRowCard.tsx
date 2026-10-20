"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayActionSheet } from "@/components/ui/dibay-overlay/DibayActionSheet";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { getUserAddressDesignationPlainText } from "@/components/addresses/UserAddressDesignationTitle";
import { buildAddressListDetailLine } from "@/lib/addresses/user-address-format";
import {
  formatUserAddressListPlainLine,
  isPhUserAddressRow,
} from "@/lib/addresses/format-user-address-list-line";
import { AddressListRowBody } from "@/components/addresses/AddressListRowBody";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  addressListRowSurfaceClass,
  resolveAddressListRowSurface,
} from "@/lib/ui/address-list-starbucks-styles";

export function AddressRowCard(props: {
  row: UserAddressDTO;
  onEdit: () => void;
  onDelete: () => void;
  /** ⋯ 액션시트 [대표로 설정] — 매장 연결 주소는 부모에서 넘기지 않는다(대표 지정 불가). 대표 행은 숨김. */
  onSetAsRepresentative?: () => void;
  /**
   * 행 본문 탭 (S06) — 호출 컨텍스트가 있으면 그 주소 선택, 없으면 수정. 생략 시 본문은 탭 불가.
   */
  onPrimaryTap?: () => void;
  busyId: string | null;
  containerClassName?: string;
  /** 승인 매장 id → `store_name` (Store Address 뱃지·헤더 `매장 · …` 에 사용) */
  approvedStoresById?: ReadonlyMap<string, string>;
}) {
  const {
    row,
    onEdit,
    onDelete,
    onSetAsRepresentative,
    onPrimaryTap,
    busyId: globalBusy,
    containerClassName,
    approvedStoresById,
  } = props;
  const { t } = useI18n();
  const [actionsOpen, setActionsOpen] = useState(false);
  /** 목록 단위 잠금 (CTA-003) — 어떤 행이든 변경 중이면 모든 행 비활성 */
  const rowBusy = globalBusy != null;
  const linkedStoreId = row.linkedStoreId?.trim() ?? "";
  const samarketStoreDisplayName =
    row.labelType === "shop" && linkedStoreId
      ? (approvedStoresById?.get(linkedStoreId)?.trim() ?? "")
      : "";
  const phOpts = {
    suppressGateBuildingIfMatchesSamarketStore: samarketStoreDisplayName || null,
  };

  const sub = formatUserAddressListPlainLine(row, phOpts);
  const detailLine = isPhUserAddressRow(row) ? null : buildAddressListDetailLine(row, sub);

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
    "min-w-0 flex-1 rounded-ui-rect px-0 py-0 pr-1 text-left sm:pr-0" +
    (onPrimaryTap ? "" : " cursor-default");

  const primaryInner = (
    <AddressListRowBody
      row={row}
      approvedStoresById={approvedStoresById}
      badgeStyle="starbucks"
    />
  );

  const rowSurface = resolveAddressListRowSurface(row);
  const rowSurfaceClass = addressListRowSurfaceClass(rowSurface);
  const liClass = [
    "flex items-start gap-2 px-2 py-3 sm:gap-3 sm:px-3",
    rowSurfaceClass,
    containerClassName ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const actionItems = [
    ...(onSetAsRepresentative && !row.isDefaultMaster
      ? [{ key: "master", label: t("mypage_s06_action_set_master"), onClick: onSetAsRepresentative }]
      : []),
    { key: "edit", label: t("common_edit"), onClick: onEdit },
    { key: "delete", label: t("common_delete"), onClick: onDelete, danger: true },
  ];

  return (
    <li className={liClass} data-testid="address-row">
      {onPrimaryTap ?
        <button
          type="button"
          disabled={rowBusy}
          onClick={() => onPrimaryTap()}
          className={`${primaryClass} transition-colors active:bg-sam-pressed-surface disabled:opacity-50 ${Sam.focusRing}`}
          aria-label={ariaPrimary}
        >
          {primaryInner}
        </button>
      : <div className={primaryClass} role="group" aria-label={ariaPrimary}>
          {primaryInner}
        </div>
      }
      <div className="flex shrink-0 items-start justify-end self-start">
        <button
          type="button"
          onClick={() => setActionsOpen(true)}
          disabled={rowBusy}
          data-testid="address-row-more"
          className={`sam-header-action flex h-12 w-12 items-center justify-center text-sam-muted transition-colors hover:text-sam-primary disabled:opacity-40 ${Sam.focusRing}`}
          aria-label={t("mypage_s06_row_more_aria")}
          aria-haspopup="dialog"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
        </button>
      </div>
      {actionsOpen ? (
        <DibayActionSheet
          open
          onClose={() => setActionsOpen(false)}
          title={designationPlain}
          cancelLabel={t("common_cancel")}
          items={actionItems}
          anchor="device-bottom"
        />
      ) : null}
    </li>
  );
}
