"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { DibayDialog } from "./DibayDialog";
import type { DibayOverlayAction } from "./DibayOverlayActions";

export type DibayPromptDialogProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  defaultValue?: string;
  placeholder?: string;
  cancelLabel: ReactNode;
  confirmLabel: ReactNode;
  onCancel: () => void;
  onConfirm: (value: string) => void;
  confirmTone?: "primary" | "destructive";
  /** When true, empty trimmed value disables confirm. */
  required?: boolean;
  busy?: boolean;
  zIndexClass?: string;
  ariaLabel?: string;
};

/**
 * Center prompt — text input + [취소][확인]. Replaces window.prompt for app-owned UX.
 */
export function DibayPromptDialog({
  open,
  title,
  description,
  defaultValue = "",
  placeholder,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  confirmTone = "primary",
  required = false,
  busy = false,
  zIndexClass,
  ariaLabel,
}: DibayPromptDialogProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 40);
    return () => window.clearTimeout(t);
  }, [open, defaultValue]);

  const trimmed = value.trim();
  const confirmDisabled = busy || (required && trimmed.length === 0);

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
      label: confirmLabel,
      roleTone: confirmTone === "destructive" ? "destructive" : "primary",
      onClick: () => onConfirm(value),
      disabled: confirmDisabled,
      loading: busy,
    },
  ];

  return (
    <DibayDialog
      open={open}
      onClose={onCancel}
      dismissible={!busy}
      title={title}
      description={description}
      actions={actions}
      actionsLayout="row"
      zIndexClass={zIndexClass}
      ariaLabel={ariaLabel}
    >
      <label htmlFor={inputId} className="sr-only">
        {typeof title === "string" ? title : "Input"}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        className={OverlayUi.input}
        value={value}
        placeholder={placeholder}
        disabled={busy}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!confirmDisabled) onConfirm(value);
          }
        }}
      />
    </DibayDialog>
  );
}
