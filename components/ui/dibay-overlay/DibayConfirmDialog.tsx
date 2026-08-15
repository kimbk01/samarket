"use client";

import type { ReactNode } from "react";
import { DibayDialog } from "./DibayDialog";
import type { DibayOverlayAction } from "./DibayOverlayActions";

export type DibayConfirmDialogProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  cancelLabel: ReactNode;
  confirmLabel: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  /** primary (default) | destructive */
  confirmTone?: "primary" | "destructive";
  /** When true, backdrop/Escape do not dismiss. */
  blocking?: boolean;
  busy?: boolean;
  confirmIcon?: ReactNode;
  zIndexClass?: string;
  ariaLabel?: string;
};

/**
 * Canonical center confirm — [취소][확인] horizontal order.
 */
export function DibayConfirmDialog({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  confirmTone = "primary",
  blocking = false,
  busy = false,
  confirmIcon,
  zIndexClass,
  ariaLabel,
}: DibayConfirmDialogProps) {
  const actions: DibayOverlayAction[] = [
    {
      key: "cancel",
      label: cancelLabel,
      roleTone: "secondary",
      onClick: onCancel,
      disabled: busy,
    },
    {
      key: "confirm",
      label: (
        <>
          {confirmIcon}
          {confirmLabel}
        </>
      ),
      roleTone: confirmTone === "destructive" ? "destructive" : "primary",
      onClick: onConfirm,
      disabled: busy,
      loading: busy,
    },
  ];

  return (
    <DibayDialog
      open={open}
      onClose={blocking ? undefined : onCancel}
      dismissible={!blocking}
      title={title}
      description={description}
      actions={actions}
      actionsLayout="row"
      zIndexClass={zIndexClass}
      ariaLabel={ariaLabel}
    />
  );
}

/** Single full-width primary OK — Info dialog. */
export function DibayInfoDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  zIndexClass,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => void;
  zIndexClass?: string;
}) {
  const actions: DibayOverlayAction[] = [
    {
      key: "ok",
      label: confirmLabel,
      roleTone: "primary",
      onClick: onConfirm,
    },
  ];

  return (
    <DibayDialog
      open={open}
      onClose={onConfirm}
      dismissible
      title={title}
      description={description}
      actions={actions}
      actionsLayout="stack"
      zIndexClass={zIndexClass}
    />
  );
}
