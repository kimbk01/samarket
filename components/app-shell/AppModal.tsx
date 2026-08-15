"use client";

import type { ReactNode } from "react";
import { DibayDialog } from "@/components/ui/dibay-overlay";

export type AppModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/**
 * Compatibility — delegates to DibayDialog (Overlay SSOT).
 */
export function AppModal({ open, onClose, title, children, footer }: AppModalProps) {
  return (
    <DibayDialog open={open} onClose={onClose} title={title ?? ""} dismissible>
      {children}
      {footer != null ? <div className="mt-4">{footer}</div> : null}
    </DibayDialog>
  );
}
