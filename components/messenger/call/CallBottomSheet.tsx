"use client";

import { useEffect, useRef } from "react";
import { Phone, Video } from "lucide-react";
import { CallRipple } from "@/components/messenger/call/CallRipple";
import { triggerCallHaptic } from "@/components/messenger/call/CallHapticController";
import { CallAvatarHeader } from "@/components/messenger/call/CallAvatarHeader";

export function CallBottomSheet({
  open,
  peerName,
  peerPublicId,
  peerAvatarUrl,
  voiceLabel,
  videoLabel,
  cancelLabel,
  ariaLabel,
  busy = false,
  onClose,
  onVoiceCall,
  onVideoCall,
}: {
  open: boolean;
  peerName: string;
  peerPublicId?: string | null;
  peerAvatarUrl?: string | null;
  voiceLabel: string;
  videoLabel: string;
  cancelLabel: string;
  ariaLabel: string;
  busy?: boolean;
  onClose: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = [...panel.querySelectorAll<HTMLElement>("button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])")];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    window.setTimeout(() => panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [busy, onClose, open]);

  if (!open) return null;

  const actionBase =
    "relative flex h-14 min-h-[56px] w-full items-center justify-center gap-2 overflow-hidden rounded-[18px] px-4 sam-text-body font-bold text-white shadow-[0_8px_24px_rgba(0,0,0,0.16)] transition-[filter,transform] duration-150 active:scale-[0.96] active:brightness-90 disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-[1400] flex items-end justify-center" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        aria-label={cancelLabel}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-busy={busy}
        className="relative w-full max-w-[420px] rounded-t-[24px] bg-white px-5 pb-[max(18px,calc(var(--safe-bottom)+12px))] pt-3 shadow-[0_-18px_44px_rgba(0,0,0,0.2)] dark:bg-[#1E1E1E]"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/14 dark:bg-white/20" aria-hidden />
        <CallAvatarHeader
          name={peerName}
          publicId={peerPublicId}
          avatarUrl={peerAvatarUrl}
          tone="surface"
        />
        <div className="mt-5 grid gap-2">
          <button
            type="button"
            disabled={busy}
            className={`${actionBase} bg-[#00754A] hover:bg-[#006241]`}
            onPointerDown={() => triggerCallHaptic("impactMedium")}
            onClick={onVoiceCall}
          >
            <CallRipple />
            <Phone className="h-6 w-6" aria-hidden />
            {voiceLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            className={`${actionBase} bg-[#006241] hover:bg-[#00523A]`}
            onPointerDown={() => triggerCallHaptic("impactMedium")}
            onClick={onVideoCall}
          >
            <CallRipple />
            <Video className="h-6 w-6" aria-hidden />
            {videoLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="h-12 min-h-[48px] rounded-[18px] border border-black/12 bg-white sam-text-body font-semibold text-[#121212] transition active:scale-[0.98] active:bg-black/5 disabled:opacity-50 dark:border-white/14 dark:bg-[#1E1E1E] dark:text-white"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
