"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MessengerBlockPeerConfirmModal({ open, busy = false, onCancel, onConfirm }: Props) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cm-block-peer-title"
        className="w-full max-w-sm rounded-ui-rect bg-white p-4 shadow-lg"
      >
        <p id="cm-block-peer-title" className="sam-text-body font-semibold text-[#1e3932]">
          {t("cm_social_block_confirm_title")}
        </p>
        <p className="mt-2 sam-text-helper text-[#1e3932]/80">{t("cm_social_block_confirm_body")}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-ui-rect border border-[#006241] bg-white px-4 py-2 sam-text-helper font-medium text-[#006241] disabled:opacity-50"
          >
            {t("cm_social_dismiss")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-ui-rect bg-[#006241] px-4 py-2 sam-text-helper font-medium text-white disabled:opacity-50"
          >
            {t("cm_social_block")}
          </button>
        </div>
      </div>
    </div>
  );
}
