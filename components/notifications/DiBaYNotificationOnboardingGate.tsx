"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import {
  readDiBaYNotificationPromptState,
  shouldOfferDiBaYNotificationPrePrompt,
  writeDiBaYNotificationPromptState,
} from "@/lib/notifications/dibay-notification-prompt-storage";
import { requestNotificationWithDiBaYGate } from "@/lib/permissions/device-permission-manager";
import { registerWebPushSubscriptionFromClient } from "@/lib/push/register-web-push-subscription-client";
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
 * 최초 로그인 후 1회: 디바이 안내 모달 → 사용자가 "알림 받기" 선택 시에만 Notification.requestPermission.
 * POST_NOTIFICATIONS(iOS/Android PWA)는 브라우저/OS가 처리 — 거부 시 재요청하지 않음.
 */
export function DiBaYNotificationOnboardingGate() {
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
    if (!shouldOfferDiBaYNotificationPrePrompt()) return;
    if (shownRef.current) return;
    if (!("Notification" in window)) return;
    const perm = Notification.permission;
    if (perm === "granted") {
      writeDiBaYNotificationPromptState("accepted");
      return;
    }
    if (perm === "denied") {
      writeDiBaYNotificationPromptState("browser_denied");
      return;
    }
    const run = () => {
      if (readDiBaYNotificationPromptState() != null) return;
      shownRef.current = true;
      setOpen(true);
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 900 });
    } else {
      window.setTimeout(run, 480);
    }
  }, [deferStoresHomeLcp, pathname]);

  useEffect(() => {
    const t = window.setTimeout(() => tryOpen(), 200);
    return () => window.clearTimeout(t);
  }, [tryOpen]);

  const onLater = () => {
    writeDiBaYNotificationPromptState("declined");
    setOpen(false);
  };

  const onAccept = async () => {
    setBusy(true);
    try {
      const perm = await requestNotificationWithDiBaYGate({ explicitRetry: true });
      if (!perm.ok) {
        writeDiBaYNotificationPromptState(perm.reason === "denied" ? "browser_denied" : "declined");
        setOpen(false);
        return;
      }
      writeDiBaYNotificationPromptState("accepted");
      const reg = await registerWebPushSubscriptionFromClient();
      if (!reg.ok && process.env.NODE_ENV === "development") {
        console.info("[DiBaYNotificationOnboarding] push register", reg);
      }
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[125] flex items-center justify-center bg-black/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dibay-notif-onboard-title"
    >
      <div className="w-full max-w-sm rounded-ui-rect bg-sam-surface p-5 shadow-xl">
        <p id="dibay-notif-onboard-title" className="sam-text-body font-semibold text-sam-fg">
          {t("dibay_notif_prompt_title")}
        </p>
        <p className="mt-2 sam-text-body-secondary text-sam-muted">
          {t("dibay_notif_prompt_body")}
        </p>
        <p className="mt-3 text-[11px] leading-snug text-sam-muted">
          {t("dibay_notif_prompt_marketing_hint")}
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onLater}
            className="flex-1 rounded-ui-rect border border-sam-border py-2.5 sam-text-body font-medium text-sam-fg"
          >
            {t("dibay_notif_later")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onAccept()}
            className="flex-1 rounded-ui-rect bg-sam-ink py-2.5 sam-text-body font-medium text-white"
          >
            {busy ? t("common_processing") : t("dibay_notif_accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
