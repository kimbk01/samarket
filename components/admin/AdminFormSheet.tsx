"use client";

import type { ReactNode } from "react";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

interface AdminFormSheetProps {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  maxWidthClass?: string;
  /** false 면 처리 중 바깥 탭·뒤로가기로 닫히지 않음 (기본 true) */
  dismissible?: boolean;
}

export function AdminFormSheet({
  title,
  subtitle,
  children,
  footer,
  onClose,
  maxWidthClass = "max-w-2xl",
  dismissible = true,
}: AdminFormSheetProps) {
  return (
    <DibayBottomSheet
      open
      onClose={onClose}
      dismissible={dismissible}
      title={title}
      anchor="device-bottom"
      panelClassName={`${maxWidthClass} mx-auto`}
      footer={
        footer ? (
          <div className="mt-3 border-t border-[color:var(--overlay-border)] pt-3">{footer}</div>
        ) : undefined
      }
    >
      {subtitle ? <p className={`mb-3 ${OverlayUi.bodySecondary}`}>{subtitle}</p> : null}
      {children}
    </DibayBottomSheet>
  );
}
