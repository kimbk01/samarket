"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog } from "@/components/ui/dibay-overlay";
import type { DibayOverlayAction } from "@/components/ui/dibay-overlay";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { AddressListRowBody } from "@/components/addresses/AddressListRowBody";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

/** 주소 구분(House 등) 중복 시 — 기존 주소·뱃지 + 변경 확인 */
export function AddressDesignationDupConfirmModal(props: {
  open: boolean;
  busy?: boolean;
  conflictRow: UserAddressDTO | null;
  approvedStoresById?: ReadonlyMap<string, string>;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const { open, busy = false, conflictRow, approvedStoresById, onCancel, onConfirm } = props;
  const { t } = useI18n();

  const actions: DibayOverlayAction[] = [
    {
      key: "cancel",
      label: t("common_cancel"),
      roleTone: "secondary",
      onClick: onCancel,
      disabled: busy,
    },
    {
      key: "confirm",
      label: busy ? t("common_processing") : t("addr_ui_confirm_designation_change"),
      roleTone: "primary",
      onClick: () => void onConfirm(),
      disabled: busy,
    },
  ];

  return (
    <DibayDialog
      open={open && !!conflictRow}
      onClose={busy ? undefined : onCancel}
      dismissible={!busy}
      title={t("addr_ui_designation_dup_title")}
      actions={actions}
      actionsLayout="row"
    >
      {conflictRow ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-[var(--overlay-border)] bg-[var(--overlay-secondary,#F5F7F6)] px-3 py-2.5">
            <AddressListRowBody
              row={conflictRow}
              approvedStoresById={approvedStoresById}
              preferFullAddressLine
            />
          </div>
          <p className={`${OverlayUi.body} !mt-0 text-center font-medium`}>
            {t("addr_ui_designation_dup_confirm")}
          </p>
        </div>
      ) : null}
    </DibayDialog>
  );
}
