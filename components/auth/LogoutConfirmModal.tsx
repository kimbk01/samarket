"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OVERLAY_COLOR, OverlayUi } from "@/lib/ui/dibay-overlay-contract";

type LogoutConfirmModalProps = {
  open: boolean;
  submitting: boolean;
  error: string | null;
  title?: string;
  body?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * 설정 등에서 사용자가 로그아웃을 눌렀을 때만 표시되는 확인 모달.
 */
export function LogoutConfirmModal({
  open,
  submitting,
  error,
  title,
  body,
  onCancel,
  onConfirm,
}: LogoutConfirmModalProps) {
  const { t } = useI18n();

  return (
    <DibayDialog
      open={open}
      onClose={submitting ? undefined : onCancel}
      dismissible={!submitting}
      title={title ?? t("auth_logout_confirm_title")}
      description={body ?? t("auth_logout_confirm_body")}
    >
      {error ? (
        <p className={OverlayUi.body} style={{ color: OVERLAY_COLOR.danger }}>
          {error}
        </p>
      ) : null}
      <div className={OverlayUi.actionsRow}>
        <DibayOverlayButton roleTone="secondary" onClick={onCancel} disabled={submitting}>
          {t("common_cancel")}
        </DibayOverlayButton>
        <DibayOverlayButton
          roleTone="destructive"
          data-testid="auth_logout_submit"
          onClick={() => void onConfirm()}
          disabled={submitting}
        >
          {submitting ? t("auth_logout_submitting") : t("auth_logout_submit")}
        </DibayOverlayButton>
      </div>
    </DibayDialog>
  );
}
