"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import {
  isVideoCallMediaReady,
  primeVideoCallMediaFromUserGesture,
} from "@/lib/community-messenger/call-media-bootstrap";
import {
  readDiBaYCallMediaPromptState,
  shouldOfferCallMediaPrePrompt,
  writeDiBaYCallMediaPromptState,
} from "@/lib/community-messenger/call-media-onboarding-storage";
import { readDiBaYNotificationPromptState } from "@/lib/notifications/dibay-notification-prompt-storage";
import { useStoresHomeOverlayDeferUntilInput } from "@/lib/stores/use-stores-home-overlay-defer-until-input";

function isAuthExcludedPath(path: string): boolean {
  return (
    path === "/login" ||
    path.startsWith("/login/") ||
    path === "/signup" ||
    path.startsWith("/signup/") ||
    path.startsWith("/auth/")
  );
}

/**
 * 로그인 후 1회: 영상 통화용 mic+cam 허용 (알림 온보딩 결정 이후).
 */
export function DiBaYCallMediaOnboardingGate() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const deferStoresHomeLcp = useStoresHomeOverlayDeferUntilInput();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const shownRef = useRef(false);

  const tryOpen = useCallback(() => {
    if (typeof window === "undefined") return;
    if (deferStoresHomeLcp) return;
    if (isAuthExcludedPath(pathname)) return;
    if (!getSupabaseProfileCache()?.id) return;
    if (!shouldOfferCallMediaPrePrompt()) return;
    if (isVideoCallMediaReady()) return;
    if (readDiBaYNotificationPromptState() == null) return;
    if (shownRef.current) return;
    if (readDiBaYCallMediaPromptState() != null) return;

    const run = () => {
      if (!shouldOfferCallMediaPrePrompt() || isVideoCallMediaReady()) return;
      shownRef.current = true;
      setOpen(true);
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1200 });
    } else {
      window.setTimeout(run, 600);
    }
  }, [deferStoresHomeLcp, pathname]);

  useEffect(() => {
    const timer = window.setTimeout(() => tryOpen(), 400);
    return () => window.clearTimeout(timer);
  }, [tryOpen]);

  const onLater = () => {
    writeDiBaYCallMediaPromptState("declined");
    setOpen(false);
  };

  const onAccept = async () => {
    setBusy(true);
    try {
      const result = await primeVideoCallMediaFromUserGesture({ explicitRetry: true });
      if (!result.ok) {
        writeDiBaYCallMediaPromptState(result.code === "denied" ? "browser_denied" : "declined");
        setOpen(false);
        return;
      }
      writeDiBaYCallMediaPromptState("accepted");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[124] flex items-center justify-center bg-black/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dibay-call-media-onboard-title"
    >
      <div className="w-full max-w-sm rounded-ui-rect bg-sam-surface p-5 shadow-xl">
        <p id="dibay-call-media-onboard-title" className="sam-text-body font-semibold text-sam-fg">
          {t("dibay_call_media_prompt_title")}
        </p>
        <p className="mt-2 sam-text-body-secondary text-sam-muted">{t("dibay_call_media_prompt_body")}</p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onLater}
            className="flex-1 rounded-ui-rect border border-sam-border py-2.5 sam-text-body font-medium text-sam-fg"
          >
            {t("dibay_call_media_later")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onAccept()}
            className="flex-1 rounded-ui-rect bg-sam-ink py-2.5 sam-text-body font-medium text-white"
          >
            {busy ? t("common_processing") : t("dibay_call_media_accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
