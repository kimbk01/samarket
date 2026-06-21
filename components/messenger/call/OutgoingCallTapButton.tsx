"use client";

import type { ReactNode } from "react";
import { CallRipple } from "@/components/messenger/call/CallRipple";
import { triggerCallHaptic } from "@/components/messenger/call/CallHapticController";

/** 발신 CTA — pointerdown ripple/haptic + tap scale (MessengerFriendProfileSheet SSOT). */
export function OutgoingCallTapButton({
  onClick,
  disabled,
  className = "",
  ariaLabel,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={() => triggerCallHaptic("selection")}
      className={`relative overflow-hidden transition active:scale-[0.96] active:brightness-90 disabled:opacity-50 ${className}`.trim()}
    >
      <CallRipple />
      {children}
    </button>
  );
}
