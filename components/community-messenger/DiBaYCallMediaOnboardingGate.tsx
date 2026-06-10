"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  isVideoCallMediaReady,
  primeVideoCallMediaFromOnboardingClick,
} from "@/lib/community-messenger/call-media-bootstrap";
import {
  readDiBaYCallMediaPromptState,
  shouldOfferCallMediaPrePrompt,
} from "@/lib/community-messenger/call-media-onboarding-storage";
import { readDiBaYNotificationPromptState } from "@/lib/notifications/dibay-notification-prompt-storage";
import {
  canAttemptPostLoginOnboardingGate,
  isPostLoginOnboardingBlockedByAddressGate,
  schedulePostLoginOnboardingOpen,
} from "@/lib/permissions/dibay-post-login-onboarding-gate";
import {
  recordDiBaYOnboardingDecision,
  syncDiBaYOnboardingFromBrowserPermission,
} from "@/lib/permissions/device-permission-manager";
import { useStoresHomeOverlayDeferUntilInput } from "@/lib/stores/use-stores-home-overlay-defer-until-input";

/**
 * 로그인 후 1회: 영상 통화용 mic+cam 허용 (알림 온보딩 결정 이후).
 */
export function DiBaYCallMediaOnboardingGate() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const deferStoresHomeLcp = useStoresHomeOverlayDeferUntilInput();
  const [open, setOpen] = useState(false);
  const shownRef = useRef(false);

  const tryOpen = useCallback(() => {
    if (!canAttemptPostLoginOnboardingGate(pathname, deferStoresHomeLcp)) return;
    if (!shouldOfferCallMediaPrePrompt()) return;
    if (isVideoCallMediaReady()) {
      syncDiBaYOnboardingFromBrowserPermission("call_media");
      return;
    }
    if (readDiBaYNotificationPromptState() == null) return;
    if (shownRef.current) return;
    if (readDiBaYCallMediaPromptState() != null) return;

    const run = () => {
      if (!shouldOfferCallMediaPrePrompt() || isVideoCallMediaReady()) return;
      void isPostLoginOnboardingBlockedByAddressGate().then((needsBlock) => {
        if (needsBlock) return;
        shownRef.current = true;
        setOpen(true);
      });
    };
    schedulePostLoginOnboardingOpen(run);
  }, [deferStoresHomeLcp, pathname]);

  useEffect(() => {
    const timer = window.setTimeout(() => tryOpen(), 400);
    return () => window.clearTimeout(timer);
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
    recordDiBaYOnboardingDecision("call_media", "declined");
    setOpen(false);
  };

  const onAccept = () => {
    setOpen(false);
    void primeVideoCallMediaFromOnboardingClick().then((result) => {
      if (!result.ok) {
        recordDiBaYOnboardingDecision(
          "call_media",
          result.code === "denied" ? "browser_denied" : "declined",
        );
        return;
      }
      recordDiBaYOnboardingDecision("call_media", "accepted");
    });
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
            onClick={onLater}
            className="flex-1 rounded-ui-rect border border-sam-border py-2.5 sam-text-body font-medium text-sam-fg"
          >
            {t("dibay_call_media_later")}
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 rounded-ui-rect bg-sam-ink py-2.5 sam-text-body font-medium text-white"
          >
            {t("dibay_call_media_accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
