"use client";

import { useEffect, useRef } from "react";
import { Phone } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";

/** call_stub pointerup 직후 ghost click이 backdrop onCancel을 치는 touch-through 방지 */
const BACKDROP_DISMISS_GUARD_MS = 350;

/**
 * 1:1 발신 전 확인 — DIBAY Confirm SSOT [취소 | 통화].
 */
export type MessengerOutgoingCallConfirmDialogProps = {
  open: boolean;
  /** 접근성 라벨용. UI에는 표시하지 않음. */
  peerLabel: string;
  kind: "voice" | "video";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MessengerOutgoingCallConfirmDialog(props: MessengerOutgoingCallConfirmDialogProps) {
  const { t, safeT } = useI18n();
  const { open, peerLabel, kind, busy = false, onCancel, onConfirm } = props;

  const title =
    kind === "video"
      ? safeT("cm_ui_face_talk_label", { fallbackKo: "영상통화", fallbackEn: "Video Call" })
      : safeT("cm_ui_voice_talk_label", { fallbackKo: "음성통화", fallbackEn: "Voice Call" });
  const openedAtRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    openedAtRef.current = Date.now();
  }, [open]);

  const isBackdropDismissGuarded = () => Date.now() - openedAtRef.current < BACKDROP_DISMISS_GUARD_MS;

  const handleCancel = () => {
    if (busy) return;
    if (isBackdropDismissGuarded()) return;
    onCancel();
  };

  const handleConfirm = () => {
    if (busy) return;
    onConfirm();
  };

  return (
    <DibayConfirmDialog
      open={open}
      title={title}
      description={t("cm_ui_start_call_question")}
      cancelLabel={t("common_cancel")}
      confirmLabel={t("cm_ui_call")}
      confirmIcon={<Phone size={18} strokeWidth={2.4} aria-hidden />}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
      confirmTone="primary"
      blocking={false}
      busy={busy}
      ariaLabel={`${peerLabel.trim() || t("common_partner")} ${title}`}
    />
  );
}
