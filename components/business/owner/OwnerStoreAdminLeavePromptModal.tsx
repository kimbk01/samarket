"use client";

import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * 매장 어드민 «기본 정보»·«매장 설정» — 미저장 이탈 시.
 * Overlay SSOT via OwnerStoreAdminConfirmModal → DibayDialog (no local styles).
 * 「저장 안 함」: 폼 복구 후 `onDiscard` · 「저장」: 저장 후 `onConfirmSave` · 배경·Esc·뒤로가기: `onDismiss`(창만 닫고 화면 유지).
 */
export function OwnerStoreAdminLeavePromptModal({
  open,
  titleId,
  leaveSaving,
  disableActions,
  onDiscard,
  onDismiss,
  onConfirmSave,
}: {
  open: boolean;
  titleId: string;
  leaveSaving: boolean;
  disableActions: boolean;
  onDiscard: () => void;
  onDismiss: () => void;
  onConfirmSave: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <OwnerStoreAdminConfirmModal
      open={open}
      titleId={titleId}
      title={t("popup_q_save_changes")}
      cancelLabel={t("popup_btn_dont_save")}
      confirmLabel={t("common_save")}
      confirmBusyLabel={t("common_processing")}
      busy={leaveSaving}
      disableActions={disableActions}
      confirmTone="primary"
      onCancel={onDiscard}
      onDismiss={onDismiss}
      onConfirm={onConfirmSave}
    />
  );
}
