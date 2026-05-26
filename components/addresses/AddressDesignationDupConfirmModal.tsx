"use client";

import { BodyPortal } from "@/components/layout/BodyPortal";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { AddressListRowBody } from "@/components/addresses/AddressListRowBody";

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

  if (!open || !conflictRow) return null;

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[1px]"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) onCancel();
        }}
      >
        <div
          className="w-full max-w-sm overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-xl"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="addr-designation-dup-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="owner-store-admin-dash-section__header px-4 py-3">
            <h3 id="addr-designation-dup-title" className="text-[15px] font-bold leading-snug text-sam-fg">
              {t("addr_ui_designation_dup_title")}
            </h3>
          </div>
          <div className="space-y-4 px-4 py-4">
            <div className="rounded-lg border border-sam-border bg-sam-app px-3 py-2.5">
              <AddressListRowBody
                row={conflictRow}
                approvedStoresById={approvedStoresById}
                preferFullAddressLine
              />
            </div>
            <p className="text-center sam-text-body font-medium leading-relaxed text-sam-fg">
              {t("addr_ui_designation_dup_confirm")}
            </p>
          </div>
          <div className="flex gap-2 border-t border-sam-border px-4 py-3">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="min-h-[44px] flex-1 rounded-ui-rect border border-sam-border bg-sam-surface sam-text-body font-semibold text-sam-fg disabled:opacity-50"
            >
              {t("common_cancel")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onConfirm()}
              className="min-h-[44px] flex-1 rounded-ui-rect bg-signature sam-text-body font-semibold text-white shadow-sm hover:opacity-95 active:opacity-90 disabled:opacity-50"
            >
              {busy ? t("common_processing") : t("addr_ui_confirm_designation_change")}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
