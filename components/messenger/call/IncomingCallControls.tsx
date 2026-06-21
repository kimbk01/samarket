"use client";

import { Phone, PhoneOff } from "lucide-react";
import { CallRipple } from "@/components/messenger/call/CallRipple";
import { triggerCallHaptic } from "@/components/messenger/call/CallHapticController";

export function IncomingCallControls({
  acceptLabel,
  rejectLabel,
  busyAccept,
  busyReject,
  size = "large",
  onAccept,
  onReject,
}: {
  acceptLabel: string;
  rejectLabel: string;
  busyAccept: boolean;
  busyReject: boolean;
  size?: "compact" | "large";
  onAccept: () => void;
  onReject: () => void;
}) {
  const large = size === "large";
  const buttonSize = large ? "h-[72px] w-[72px]" : "h-[56px] w-[56px]";
  const iconSize = large ? 28 : 24;
  const base =
    "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition-[filter,transform] duration-150 active:scale-[0.92] active:brightness-90 disabled:opacity-40";

  return (
    <div className={`flex items-center justify-center ${large ? "gap-8" : "gap-3"}`}>
      <button
        type="button"
        aria-label={rejectLabel}
        disabled={busyReject || busyAccept}
        onPointerDown={() => triggerCallHaptic("impactMedium")}
        onClick={onReject}
        className={`${base} ${buttonSize} bg-[#D93025]`}
      >
        <CallRipple />
        <PhoneOff size={iconSize} strokeWidth={2.5} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={acceptLabel}
        disabled={busyAccept}
        onPointerDown={() => triggerCallHaptic("impactMedium")}
        onClick={onAccept}
        className={`${base} ${buttonSize} bg-[#00754A] hover:bg-[#006241]`}
      >
        <CallRipple />
        <Phone size={iconSize} strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}
