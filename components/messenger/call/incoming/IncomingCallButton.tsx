"use client";

import { useCallback, useRef, useState } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { IosFilledPhoneGlyph } from "@/components/messenger/call/IosFilledCallControlGlyphs";
import { CallRipple } from "@/components/messenger/call/CallRipple";
import { triggerCallHaptic } from "@/components/messenger/call/CallHapticController";

export const INCOMING_CALL_FULLSCREEN_PRESS_MS = 150;

export type IncomingCallButtonVariant = "accept" | "reject";
export type IncomingCallButtonMode = "popup" | "fullscreen";

export function IncomingCallButton({
  variant,
  mode,
  label,
  ariaLabel,
  disabled,
  onAction,
}: {
  variant: IncomingCallButtonVariant;
  mode: IncomingCallButtonMode;
  label: string;
  ariaLabel: string;
  disabled?: boolean;
  onAction: () => void;
}) {
  const pressStartedAtRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [pressed, setPressed] = useState(false);

  const toneClass =
    variant === "accept" ? "incoming-call-btn--accept" : "incoming-call-btn--reject";
  /** iOS-style vivid circles — Tailwind bg so WebView/Capacitor always wins over card green */
  const iosBgClass =
    variant === "accept"
      ? "bg-[#34c759] hover:bg-[#30b350] active:bg-[#2da84a]"
      : "bg-[#ff3b30] hover:bg-[#e6352b] active:bg-[#d93025]";
  const sizeClass = mode === "fullscreen" ? "incoming-call-btn--large" : "incoming-call-btn--compact";
  const iconRotateClass =
    variant === "accept"
      ? "incoming-call-btn__icon--accept"
      : "incoming-call-btn__icon--decline";

  const clearPress = useCallback(() => {
    pressStartedAtRef.current = null;
    pointerIdRef.current = null;
    setPressed(false);
  }, []);

  const tryExecute = useCallback(() => {
    if (disabled) {
      clearPress();
      return;
    }
    const startedAt = pressStartedAtRef.current;
    if (startedAt == null) return;
    const elapsed = Date.now() - startedAt;
    if (mode === "fullscreen" && elapsed < INCOMING_CALL_FULLSCREEN_PRESS_MS) {
      clearPress();
      return;
    }
    clearPress();
    onAction();
  }, [clearPress, disabled, mode, onAction]);

  const onPointerDown = useCallback(
    (ev: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (pointerIdRef.current != null) return;
      pointerIdRef.current = ev.pointerId;
      pressStartedAtRef.current = Date.now();
      setPressed(true);
      triggerCallHaptic("impactMedium");
      ev.currentTarget.setPointerCapture(ev.pointerId);
    },
    [disabled]
  );

  const onPointerUp = useCallback(
    (ev: React.PointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== ev.pointerId) return;
      tryExecute();
    },
    [tryExecute]
  );

  const onPointerCancel = useCallback(
    (ev: React.PointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== ev.pointerId) return;
      clearPress();
    },
    [clearPress]
  );

  const onClick = useCallback(
    (ev: React.MouseEvent<HTMLButtonElement>) => {
      if (mode === "fullscreen") {
        ev.preventDefault();
        return;
      }
      if (disabled) return;
      onAction();
    },
    [disabled, mode, onAction]
  );

  return (
    <div
      className={
        mode === "fullscreen"
          ? "incoming-call-btn-stack flex flex-col items-center gap-2"
          : "incoming-call-btn-stack incoming-call-btn-stack--inline"
      }
    >
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerCancel}
        onClick={onClick}
        className={`incoming-call-btn ${toneClass} ${iosBgClass} ${sizeClass} rounded-full ${pressed ? "incoming-call-btn--pressed" : ""}`.trim()}
      >
        <CallRipple />
        {mode === "popup" ? (
          variant === "reject" ? (
            <PhoneOff
              className="incoming-call-btn__icon text-white"
              strokeWidth={2.5}
              aria-hidden
            />
          ) : (
            <Phone className="incoming-call-btn__icon text-white" strokeWidth={2.5} aria-hidden />
          )
        ) : (
          <IosFilledPhoneGlyph
            className={`incoming-call-btn__icon ${iconRotateClass} text-white`}
          />
        )}
      </button>
      {mode === "fullscreen" ? (
        <span className="incoming-call-btn__label text-[clamp(0.8125rem,3.2vw,0.9375rem)] font-semibold">
          {label}
        </span>
      ) : null}
    </div>
  );
}
