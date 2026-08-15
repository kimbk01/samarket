"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { OverlayUi, type DibayOverlayActionRole } from "@/lib/ui/dibay-overlay-contract";

const ROLE_CLASS: Record<DibayOverlayActionRole, string> = {
  primary: OverlayUi.btn.primary,
  secondary: OverlayUi.btn.secondary,
  destructive: OverlayUi.btn.destructive,
  text: OverlayUi.btn.text,
};

export type DibayOverlayButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  roleTone: DibayOverlayActionRole;
  loading?: boolean;
  children: ReactNode;
};

export function DibayOverlayButton({
  roleTone,
  loading = false,
  disabled,
  children,
  className = "",
  type = "button",
  ...rest
}: DibayOverlayButtonProps) {
  return (
    <button
      type={type}
      className={`${ROLE_CLASS[roleTone]} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="dibay-overlay-btn__spinner" aria-hidden /> : children}
    </button>
  );
}

export type DibayOverlayAction = {
  key: string;
  label: ReactNode;
  roleTone: DibayOverlayActionRole;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  ariaLabel?: string;
};

/**
 * Horizontal [secondary | primary] or stacked actions.
 * Confirm default order: left secondary, right primary/destructive.
 */
export function DibayOverlayActions({
  layout = "row",
  actions,
}: {
  layout?: "row" | "stack";
  actions: DibayOverlayAction[];
}) {
  const className = layout === "row" ? OverlayUi.actionsRow : OverlayUi.actionsStack;
  return (
    <div className={className}>
      {actions.map((a) => (
        <DibayOverlayButton
          key={a.key}
          roleTone={a.roleTone}
          onClick={a.onClick}
          disabled={a.disabled}
          loading={a.loading}
          aria-label={a.ariaLabel}
        >
          {a.label}
        </DibayOverlayButton>
      ))}
    </div>
  );
}
