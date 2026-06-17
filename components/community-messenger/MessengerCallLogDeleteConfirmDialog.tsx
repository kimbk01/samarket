"use client";

import { useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  COMMUNITY_BUTTON_PRIMARY_CLASS,
  COMMUNITY_BUTTON_SECONDARY_CLASS,
  COMMUNITY_MODAL_PANEL_CLASS,
  COMMUNITY_OVERLAY_BACKDROP_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";

type Props = {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** 통화 기록 삭제 확인 — 발신 확인과 동일 모달 스타일 */
export function MessengerCallLogDeleteConfirmDialog({ open, busy = false, onCancel, onConfirm }: Props) {
  const { t, safeT } = useI18n();
  const body = safeT("cm_ui_confirm_delete_call_log", {
    fallbackKo: "이 통화 기록을 삭제할까요?",
    fallbackEn: "Delete this call log?",
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="call-log-delete-confirm-title"
      aria-busy={busy}
    >
      <button
        type="button"
        className={COMMUNITY_OVERLAY_BACKDROP_CLASS}
        aria-label={t("nav_close")}
        onClick={() => {
          if (!busy) onCancel();
        }}
      />
      <div
        className={`relative z-50 w-full max-w-[320px] overflow-hidden ${COMMUNITY_MODAL_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-6 pb-5 text-center">
          <h2 id="call-log-delete-confirm-title" className="text-[16px] font-bold tracking-tight text-[#1F2430]">
            {t("common_delete")}
          </h2>
          <p className="mt-3 text-[14px] font-normal leading-[1.5] text-[#1F2430]">{body}</p>
        </div>
        <div className="flex gap-2 border-t border-[#E5E7EB] px-4 pb-4 pt-3">
          <button type="button" disabled={busy} onClick={onCancel} className={`flex-1 ${COMMUNITY_BUTTON_SECONDARY_CLASS}`}>
            {t("common_cancel")}
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className={`flex-1 ${COMMUNITY_BUTTON_PRIMARY_CLASS}`}>
            {t("common_delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
