"use client";

import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * 매장 어드민 «기본 정보»·«매장 설정» — 미저장 이탈 시.
 * Overlay SSOT via OwnerStoreAdminConfirmModal → DibayDialog (no local styles).
 * 취소: 폼 복구 후 `onDiscard` · 확인: 저장 후 `onConfirmSave`.
 */
export function OwnerStoreAdminLeavePromptModal({
  open,
  titleId,
  leaveSaving,
  disableActions,
  onDiscard,
  onConfirmSave,
}: {
  open: boolean;
  titleId: string;
  leaveSaving: boolean;
  disableActions: boolean;
  onDiscard: () => void;
  onConfirmSave: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <OwnerStoreAdminConfirmModal
      open={open}
      titleId={titleId}
      title={t("business_phase7_125")}
      cancelLabel={t("common_cancel")}
      confirmLabel={t("common_confirm")}
      confirmBusyLabel={t("common_processing")}
      busy={leaveSaving}
      disableActions={disableActions}
      confirmTone="primary"
      onCancel={onDiscard}
      onConfirm={onConfirmSave}
    />
  );
}
