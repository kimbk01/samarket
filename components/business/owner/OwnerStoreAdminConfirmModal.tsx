"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog } from "@/components/ui/dibay-overlay";
import type { DibayOverlayAction } from "@/components/ui/dibay-overlay";

export type OwnerStoreAdminConfirmTone = "primary" | "danger";

/**
 * 매장 어드민 공통 확인 대화상자 — 이탈 가드·저장 확인·삭제 등 동일 셸·버튼 톤.
 * (`OwnerStoreAdminLeavePromptModal` 이 내부에서 사용)
 */
export function OwnerStoreAdminConfirmModal({
  open,
  titleId: _titleId,
  title,
  description,
  cancelLabel,
  confirmLabel,
  confirmBusyLabel,
  busy = false,
  disableActions = false,
  confirmTone = "primary",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  titleId: string;
  title: string;
  description?: string | null;
  cancelLabel?: string;
  confirmLabel?: string;
  /** `busy` 일 때 확인 버튼에만 표시(미주입 시 "처리 중…") */
  confirmBusyLabel?: string;
  busy?: boolean;
  disableActions?: boolean;
  confirmTone?: OwnerStoreAdminConfirmTone;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const resolvedCancelLabel = cancelLabel ?? t("common_cancel");
  const resolvedConfirmLabel = confirmLabel ?? t("common_confirm");
  const resolvedConfirmBusyLabel = confirmBusyLabel ?? t("common_processing");
  const disabled = disableActions || busy;

  const actions: DibayOverlayAction[] = [
    {
      key: "cancel",
      label: resolvedCancelLabel,
      roleTone: "secondary",
      onClick: onCancel,
      disabled,
    },
    {
      key: "confirm",
      label: busy ? resolvedConfirmBusyLabel : resolvedConfirmLabel,
      roleTone: confirmTone === "danger" ? "destructive" : "primary",
      onClick: () => void onConfirm(),
      disabled,
    },
  ];

  return (
    <DibayDialog
      open={open}
      onClose={disabled ? undefined : onCancel}
      dismissible={!disabled}
      title={title}
      description={description ?? undefined}
      actions={actions}
      actionsLayout="row"
    />
  );
}
