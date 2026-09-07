"use client";

/**
 * Admin mutation confirmation — wraps DibayConfirmDialog + optional reason.
 * CUT R1: mutations only; never use for read-only navigation.
 */

import { useEffect, useState } from "react";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import type { AdminMutationConfirmTone } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";

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
  pending = false,
  onCancel,
  onConfirm,
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
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const canConfirm = !reasonRequired || reason.trim().length > 0;

  return (
    <DibayDialog
      open={open}
      onClose={pending ? undefined : onCancel}
      dismissible={!pending}
      title={title}
      description={description}
      ariaLabel={title}
    >
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
