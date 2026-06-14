"use client";

import type { ReactNode } from "react";
import { AuthGateOverlay } from "@/components/auth/AuthGateOverlay";
import { Sam } from "@/lib/ui/sam-component-classes";

/** 프로필·게이트 알림 팝업 공통 — 상하 중앙, 동일 카드·버튼 스타일 */
export const PROFILE_GATE_PRESS =
  "touch-manipulation select-none transition-[transform,opacity] duration-100 will-change-transform active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

export const profileGatePrimaryBtnClass = [
  Sam.btn.base,
  Sam.btn.primaryCombo,
  Sam.btn.block,
  Sam.btn.pill,
  "min-h-[48px] py-3 sam-text-body font-semibold",
  PROFILE_GATE_PRESS,
].join(" ");

export const profileGateSecondaryBtnClass = [
  Sam.btn.base,
  Sam.btn.outlineCombo,
  Sam.btn.block,
  Sam.btn.pill,
  "min-h-[48px] py-3 sam-text-body font-semibold",
  PROFILE_GATE_PRESS,
].join(" ");

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
  titleId,
  descId,
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: ProfileGateAlertDialogProps) {
  return (
    <AuthGateOverlay
      open={open}
      role="alertdialog"
      labelledBy={titleId}
      describedBy={descId}
    >
      <h2 id={titleId} className="text-center text-lg font-semibold text-[#1e3932]">
        {title}
      </h2>
      <p id={descId} className="mt-2 text-center sam-text-body leading-relaxed text-[#1e3932]/75">
        {description}
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <button type="button" onClick={onPrimary} className={profileGatePrimaryBtnClass}>
          {primaryLabel}
        </button>
        <button type="button" onClick={onSecondary} className={profileGateSecondaryBtnClass}>
          {secondaryLabel}
        </button>
      </div>
    </AuthGateOverlay>
  );
}
