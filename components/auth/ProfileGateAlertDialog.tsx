"use client";

import type { ReactNode } from "react";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

/** Press feedback — overlay SSOT scale 0.98 (kept for external callers). */
export const PROFILE_GATE_PRESS =
  "touch-manipulation select-none transition-[transform,opacity] duration-100 will-change-transform active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

export const profileGatePrimaryBtnClass = OverlayUi.btn.primary;
export const profileGateSecondaryBtnClass = OverlayUi.btn.secondary;

type ProfileGateAlertDialogProps = {
  open: boolean;
  titleId: string;
  descId: string;
  title: ReactNode;
  description: ReactNode;
  primaryLabel: ReactNode;
  onPrimary: () => void;
  secondaryLabel: ReactNode;
  onSecondary: () => void;
};

export function ProfileGateAlertDialog({
  open,
  titleId: _titleId,
  descId: _descId,
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: ProfileGateAlertDialogProps) {
  return (
    <DibayDialog open={open} onClose={onSecondary} dismissible title={title} description={description}>
      <div className={OverlayUi.actionsStack}>
        <DibayOverlayButton roleTone="primary" onClick={onPrimary}>
          {primaryLabel}
        </DibayOverlayButton>
        <DibayOverlayButton roleTone="secondary" onClick={onSecondary}>
          {secondaryLabel}
        </DibayOverlayButton>
      </div>
    </DibayDialog>
  );
}
