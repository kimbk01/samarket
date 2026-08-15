"use client";

import type { ReactNode } from "react";
import { DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

/** 하단 탭 z-[1200]·시트 z-[1300] 위 — 로그인 게이트 전용 */
export const AUTH_GATE_OVERLAY_Z_CLASS = "z-[1310]";

type AuthGateOverlayProps = {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  labelledBy?: string;
  describedBy?: string;
  /** Kept for callers; DibayOverlayRoot always exposes role=dialog. */
  role?: "dialog" | "alertdialog";
};

/**
 * Auth / onboarding center panel — Dibay Overlay SSOT backdrop + z.
 * Panel keeps auth-specific max size; OAuth flows unchanged.
 */
export function AuthGateOverlay({
  open,
  onClose,
  children,
  labelledBy,
  describedBy,
}: AuthGateOverlayProps) {
  return (
    <DibayOverlayRoot
      open={open}
      onClose={onClose}
      dismissible={Boolean(onClose)}
      placement="center"
      zRole="nested"
      zIndexClass={AUTH_GATE_OVERLAY_Z_CLASS}
      labelledBy={labelledBy}
      describedBy={describedBy}
    >
      <div
        className={`${OverlayUi.dialogPanel} !max-w-md max-h-[min(88dvh,640px)] overflow-y-auto overscroll-y-contain !rounded-[length:var(--overlay-radius-xl)] !px-5 !py-6`}
        data-dibay-overlay="auth-gate"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </DibayOverlayRoot>
  );
}
