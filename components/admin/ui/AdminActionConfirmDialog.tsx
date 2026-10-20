"use client";

/**
 * Admin mutation confirmation — wraps DibayConfirmDialog + optional reason.
 * CUT R1: mutations only; never use for read-only navigation.
 */

import { useEffect, useState, type ReactNode } from "react";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import type { AdminMutationConfirmTone } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";
import { canConfirmAdminAction } from "@/lib/admin/operator-ux/admin-typed-confirm";

export function AdminActionConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  reasonRequired = false,
  reasonLabel,
  reasonPlaceholder,
  reasonMinLength,
  confirmMatchText,
  confirmMatchLabel,
  pending = false,
  onCancel,
  onConfirm,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: AdminMutationConfirmTone;
  reasonRequired?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** 사유 최소 글자 수 (reasonRequired 일 때, 기본 1). */
  reasonMinLength?: number;
  /**
   * 지정하면 관리자가 이 값을 그대로 다시 입력해야 확인 버튼이 켜진다 (실지급·소멸 등).
   * 공백·쉼표·대소문자는 무시한다. 미지정 시 기존 동작 그대로.
   */
  confirmMatchText?: string;
  confirmMatchLabel?: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  /** Optional extra body (e.g. fact lines) rendered above the reason field. */
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) {
      setReason("");
      setTyped("");
    }
  }, [open]);

  const canConfirm = canConfirmAdminAction({
    reasonRequired,
    reason,
    reasonMinLength,
    confirmMatchText,
    typed,
  });

  return (
    <DibayDialog
      open={open}
      onClose={pending ? undefined : onCancel}
      dismissible={!pending}
      title={title}
      description={description}
      ariaLabel={title}
    >
      {children}
      {reasonRequired ? (
        <label className={`mt-3 block ${OverlayUi.caption}`}>
          {reasonLabel || "사유"}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            disabled={pending}
            className="mt-1 w-full rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] px-3 py-2 text-sm text-[color:var(--overlay-fg)]"
            placeholder={reasonPlaceholder}
            data-admin-action-confirm-reason="1"
          />
        </label>
      ) : null}
      {confirmMatchText != null ? (
        <label className={`mt-3 block ${OverlayUi.caption}`}>
          {confirmMatchLabel || `확인을 위해 「${confirmMatchText}」 를 그대로 입력하세요`}
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={pending}
            autoComplete="off"
            className="mt-1 w-full rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] px-3 py-2 text-sm text-[color:var(--overlay-fg)]"
            placeholder={confirmMatchText}
            data-admin-action-confirm-match="1"
          />
        </label>
      ) : null}
      <div className={`${OverlayUi.actionsRow} mt-4`}>
        <DibayOverlayButton roleTone="secondary" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </DibayOverlayButton>
        <DibayOverlayButton
          roleTone={tone === "danger" ? "destructive" : "primary"}
          disabled={pending || !canConfirm}
          loading={pending}
          onClick={() => {
            if (!canConfirm || pending) return;
            onConfirm(reason.trim());
          }}
          data-admin-action-confirm-submit="1"
        >
          {confirmLabel}
        </DibayOverlayButton>
      </div>
    </DibayDialog>
  );
}
