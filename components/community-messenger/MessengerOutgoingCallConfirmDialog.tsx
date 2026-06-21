"use client";

import { useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  COMMUNITY_BUTTON_PRIMARY_CLASS,
  COMMUNITY_BUTTON_SECONDARY_CLASS,
  COMMUNITY_MODAL_PANEL_CLASS,
  COMMUNITY_OVERLAY_BACKDROP_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";

/**
 * 발신 전 확인 — 취소 / 통화 2버튼. `busy` 시 연결 진행 중임을 표시한다.
 */
export type MessengerOutgoingCallConfirmDialogProps = {
  open: boolean;
  peerLabel: string;
  kind: "voice" | "video";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MessengerOutgoingCallConfirmDialog(props: MessengerOutgoingCallConfirmDialogProps) {
  const { t } = useI18n();
  const { open, peerLabel, kind, busy = false, onCancel, onConfirm } = props;

  const title = kind === "video" ? t("cm_ui_video_call") : t("cm_ui_voice_call");
  const dialogLabel = `${peerLabel.trim() || t("common_partner")} ${title}`;
  const peer = peerLabel.trim() || t("cm_ui_other_party");

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
      className="fixed inset-0 z-[80] flex items-center justify-center px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="outgoing-call-confirm-title"
      aria-busy={busy}
      aria-label={dialogLabel}
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
          <h2 id="outgoing-call-confirm-title" className="text-[16px] font-bold tracking-tight text-[#1F2430]">
            {title}
          </h2>
          <p className="mt-1 text-[13px] font-normal text-[#6B7280]">{peer}</p>
          <p className="mt-2 text-[14px] font-normal leading-[1.5] text-[#1F2430]">{t("cm_ui_start_call_question")}</p>
        </div>
        <div className="flex gap-2 border-t border-[#E5E7EB] px-4 pb-4 pt-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className={`flex-1 ${COMMUNITY_BUTTON_SECONDARY_CLASS}`}
          >
            {t("common_cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`flex-1 ${COMMUNITY_BUTTON_PRIMARY_CLASS}`}
          >
            {t("cm_ui_call")}
          </button>
        </div>
      </div>
    </div>
  );
}
