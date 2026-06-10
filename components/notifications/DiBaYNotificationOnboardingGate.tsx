"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { shouldOfferDiBaYNotificationPrePrompt } from "@/lib/notifications/dibay-notification-prompt-storage";
import {
  canAttemptPostLoginOnboardingGate,
  isPostLoginOnboardingBlockedByAddressGate,
  schedulePostLoginOnboardingOpen,
} from "@/lib/permissions/dibay-post-login-onboarding-gate";
import {
  recordDiBaYOnboardingDecision,
  syncDiBaYOnboardingFromBrowserPermission,
} from "@/lib/permissions/device-permission-manager";
import { registerWebPushSubscriptionFromClient } from "@/lib/push/register-web-push-subscription-client";
import { useStoresHomeOverlayDeferUntilInput } from "@/lib/stores/use-stores-home-overlay-defer-until-input";

function schedulePushRegistration(): void {
  void registerWebPushSubscriptionFromClient().then((reg) => {
    if (!reg.ok && process.env.NODE_ENV === "development") {
      console.info("[DiBaYNotificationOnboarding] push register", reg);
    }
  });
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
  const shownRef = useRef(false);

  const tryOpen = useCallback(() => {
    if (!canAttemptPostLoginOnboardingGate(pathname, deferStoresHomeLcp)) return;
    if (!shouldOfferDiBaYNotificationPrePrompt()) return;
    if (shownRef.current) return;
    if (!("Notification" in window)) return;

    const perm = Notification.permission;
    if (perm === "granted" || perm === "denied") {
      syncDiBaYOnboardingFromBrowserPermission("notification");
      return;
    }

    const run = () => {
      if (!shouldOfferDiBaYNotificationPrePrompt()) return;
      void isPostLoginOnboardingBlockedByAddressGate().then((needsBlock) => {
        if (needsBlock) return;
        shownRef.current = true;
        setOpen(true);
      });
    };
    schedulePostLoginOnboardingOpen(run);
  }, [deferStoresHomeLcp, pathname]);

  useEffect(() => {
    const t = window.setTimeout(() => tryOpen(), 200);
    return () => window.clearTimeout(t);
  }, [tryOpen]);

  useEffect(() => {
    const onAddressesUpdated = () => {
      shownRef.current = false;
      tryOpen();
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [tryOpen]);

  const onLater = () => {
    recordDiBaYOnboardingDecision("notification", "declined");
    setOpen(false);
  };

  const onAccept = () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      recordDiBaYOnboardingDecision("notification", "declined");
      setOpen(false);
      return;
    }

    const existing = Notification.permission;
    if (existing === "granted") {
      recordDiBaYOnboardingDecision("notification", "accepted");
      setOpen(false);
      schedulePushRegistration();
      return;
    }
    if (existing === "denied") {
      recordDiBaYOnboardingDecision("notification", "browser_denied");
      setOpen(false);
      return;
    }

    setOpen(false);
    void Notification.requestPermission().then((permission) => {
      const state =
        permission === "granted" ? "accepted" : permission === "denied" ? "browser_denied" : "declined";
      recordDiBaYOnboardingDecision("notification", state);
      if (permission === "granted") {
        schedulePushRegistration();
      }
    });
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
            onClick={onLater}
            className="flex-1 rounded-ui-rect border border-sam-border py-2.5 sam-text-body font-medium text-sam-fg"
          >
            {t("dibay_notif_later")}
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 rounded-ui-rect bg-sam-ink py-2.5 sam-text-body font-medium text-white"
          >
            {t("dibay_notif_accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
