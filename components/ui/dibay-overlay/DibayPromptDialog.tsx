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
  /** Trimmed value must be at least this long (e.g. admin reason ≥ 2). */
  minLength?: number;
  /** Trimmed value must equal this (retype confirmation). */
  mustEqual?: string;
  /** Shown under the input while the value is not yet valid. */
  invalidHint?: ReactNode;
  busy?: boolean;
  zIndexClass?: string;
  ariaLabel?: string;
};

/** Confirm is enabled only when the trimmed value meets every given rule. */
export function isDibayPromptValueValid(input: {
  value: string;
  required?: boolean;
  minLength?: number;
  mustEqual?: string;
}): boolean {
  const trimmed = input.value.trim();
  if (input.required && trimmed.length === 0) return false;
  if (input.minLength != null && trimmed.length < input.minLength) return false;
  if (input.mustEqual != null && trimmed !== input.mustEqual.trim()) return false;
  return true;
}

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
  minLength,
  mustEqual,
  invalidHint,
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

  const valid = isDibayPromptValueValid({ value, required, minLength, mustEqual });
  const confirmDisabled = busy || !valid;

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
      {!valid && invalidHint ? (
        <p className="mt-1.5 text-xs text-sam-muted" data-dibay-prompt-invalid-hint="1">
          {invalidHint}
        </p>
      ) : null}
    </DibayDialog>
  );
}
