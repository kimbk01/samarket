"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useMessengerSnackbarStore } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { subscribeCommunityCallHostSync } from "@/components/layout/providers/CommunityMessengerActiveCallHost";
import {
  shouldSuppressCallOverlayToasts,
  subscribeCallDockPresentation,
} from "@/lib/community-messenger/call-dock-presentation";

function readCallOverlayToastSuppress(): boolean {
  return shouldSuppressCallOverlayToasts();
}

function subscribeCallOverlayToastSuppress(onStoreChange: () => void): () => void {
  const unsubs = [subscribeCallDockPresentation(onStoreChange), subscribeCommunityCallHostSync(onStoreChange)];
  return () => {
    for (const unsub of unsubs) unsub();
  };
}

/**
 * `/community-messenger/*` 레이아웃에만 두고, API·권한·복사 등 비차단 피드백을 표시한다.
 * Call Dock·OS PiP 활성 시 snackbar 겹침 방지.
 */
export function MessengerSnackbarHost() {
  const suppress = useSyncExternalStore(
    subscribeCallOverlayToastSuppress,
    readCallOverlayToastSuppress,
    () => false
  );
  const current = useMessengerSnackbarStore((s) => s.current);
  const dismiss = useMessengerSnackbarStore((s) => s.dismiss);

  useEffect(() => {
    if (suppress) dismiss();
  }, [suppress, dismiss]);

  if (suppress || !current) return null;

  const surface =
    current.variant === "error"
      ? "border-red-400/35 bg-red-950/[0.97] text-red-50"
      : current.variant === "success"
        ? "border-emerald-500/30 bg-emerald-950/[0.97] text-emerald-50"
        : "border-white/12 bg-sam-ink/[0.97] text-white";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(10px,var(--safe-bottom))] z-[200] flex justify-center px-3">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex max-w-[min(100%,24rem)] items-start gap-3 rounded-ui-rect border px-3.5 py-2.5 sam-text-body-secondary leading-snug shadow-sam-elevated backdrop-blur-sm ${surface}`}
      >
        <p className="min-w-0 flex-1">{current.message}</p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-ui-rect px-1.5 py-0.5 sam-text-helper font-semibold text-white/85 underline-offset-2 hover:text-white"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
