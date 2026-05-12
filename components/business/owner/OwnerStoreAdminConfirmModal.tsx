"use client";

import { BodyPortal } from "@/components/layout/BodyPortal";

export type OwnerStoreAdminConfirmTone = "primary" | "danger";

/**
 * 매장 어드민 공통 확인 대화상자 — 이탈 가드·저장 확인·삭제 등 동일 셸·버튼 톤.
 * (`OwnerStoreAdminLeavePromptModal` 이 내부에서 사용)
 */
export function OwnerStoreAdminConfirmModal({
  open,
  titleId,
  title,
  description,
  cancelLabel = "취소",
  confirmLabel = "확인",
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
  if (!open) return null;

  const confirmCls =
    confirmTone === "danger"
      ? "min-h-[44px] flex-1 rounded-ui-rect bg-red-600 sam-text-body font-medium text-white shadow-sm hover:opacity-95 active:opacity-90 disabled:opacity-50"
      : "min-h-[44px] flex-1 rounded-ui-rect bg-signature sam-text-body font-medium text-white shadow-sm hover:opacity-95 active:opacity-90 disabled:opacity-50";

  const disabled = disableActions || busy;
  const confirmText =
    busy ? (confirmBusyLabel?.trim() ? confirmBusyLabel : "처리 중…") : confirmLabel;

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="w-full max-w-sm rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-xl">
          <p id={titleId} className="sam-text-body font-semibold text-sam-fg">
            {title}
          </p>
          {description ?
            <p className="mt-2 whitespace-pre-wrap sam-text-body-secondary leading-snug text-sam-fg">
              {description}
            </p>
          : null}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="min-h-[44px] flex-1 rounded-ui-rect border border-sam-border bg-sam-surface sam-text-body font-medium text-sam-fg"
              onClick={onCancel}
              disabled={disabled}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={confirmCls}
              onClick={() => void onConfirm()}
              disabled={disabled}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
