"use client";

import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";

/**
 * 매장 어드민 «기본 정보»·«매장 설정» — 미저장 이탈 시.
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
  return (
    <OwnerStoreAdminConfirmModal
      open={open}
      titleId={titleId}
      title="변경된 내용을 저장 하시겠습니까?"
      cancelLabel="취소"
      confirmLabel="확인"
      confirmBusyLabel="처리 중…"
      busy={leaveSaving}
      disableActions={disableActions}
      confirmTone="primary"
      onCancel={onDiscard}
      onConfirm={onConfirmSave}
    />
  );
}
