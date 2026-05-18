"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function RejectOrderModal({
  open,
  title,
  warnAccepted,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title?: string;
  /** 접수 후 거절 경고 문구 */
  warnAccepted?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const resolvedTitle = title ?? t("business_phase7_261");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-[length:var(--ui-radius-rect)] border border-sam-border bg-sam-surface p-4 shadow-[0_8px_24px_rgba(31,36,48,0.14)] sm:rounded-ui-rect">
        <h2 className="text-[16px] font-bold leading-[1.35] text-sam-fg">{resolvedTitle}</h2>
        {warnAccepted ? (
          <p className="mt-2 rounded-ui-rect bg-amber-50 px-3 py-2 text-[13px] font-normal text-amber-950 ring-1 ring-amber-200">
            {t("store_owner_reject_after_accept_warn")}
          </p>
        ) : null}
        <label className="mt-3 block text-[13px] font-semibold text-sam-fg">{t("business_phase7_008")}</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="sam-textarea mt-1 min-h-[96px]"
          placeholder={t("business_phase7_209")}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setText("");
              onClose();
            }}
            className="sam-btn-secondary px-4"
          >
            {t("common_close")}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!text.trim()) return;
              onConfirm(text.trim());
              setText("");
              onClose();
            }}
            className="sam-btn-danger px-4"
          >
            {t("store_owner_reject_confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
