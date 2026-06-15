"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  canAttemptPostLoginOnboardingGate,
  isPostLoginOnboardingBlockedByAddressGate,
  schedulePostLoginOnboardingOpen,
} from "@/lib/permissions/dibay-post-login-onboarding-gate";
import {
  recordDiBaYOnboardingDecision,
} from "@/lib/permissions/device-permission-manager";
import { resolveDibayDevicePermissionOnboarding, resolveCallMediaOnboardingSource } from "@/lib/permissions/dibay-device-permission-onboarding";
import {
  markInitialDevicePermissionsDeferred,
  requestInitialDevicePermissions,
  type DibayDevicePermissionSource,
} from "@/lib/permissions/dibay-device-permission-store";
import { invalidateCallMediaPermissionCheckCache } from "@/lib/community-messenger/call-media-permission-preflight";
import { useStoresHomeOverlayDeferUntilInput } from "@/lib/stores/use-stores-home-overlay-defer-until-input";

/**
 * 로그인 후 1회: 영상 통화용 mic+cam 허용 (알림 온보딩 결정 이후).
 */
export function DiBaYCallMediaOnboardingGate() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const deferStoresHomeLcp = useStoresHomeOverlayDeferUntilInput();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<DibayDevicePermissionSource>(() => resolveCallMediaOnboardingSource());
  const [requesting, setRequesting] = useState(false);
  const shownRef = useRef(false);

  const tryOpen = useCallback(() => {
    if (!canAttemptPostLoginOnboardingGate(pathname, deferStoresHomeLcp)) return;
    if (shownRef.current) return;

    const run = () => {
      void isPostLoginOnboardingBlockedByAddressGate().then((needsBlock) => {
        if (needsBlock) return;
        void resolveDibayDevicePermissionOnboarding(resolveCallMediaOnboardingSource()).then((decision) => {
          if (!decision.shouldShow) {
            if (decision.state.camera === "granted" && decision.state.microphone === "granted") {
              recordDiBaYOnboardingDecision("call_media", "accepted");
            }
            return;
          }
          shownRef.current = true;
          console.info("[device-permission] onboarding_show", { source: decision.source });
          setSource(decision.source);
          setOpen(true);
        });
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
    markInitialDevicePermissionsDeferred(source);
    recordDiBaYOnboardingDecision("call_media", "declined");
    invalidateCallMediaPermissionCheckCache();
    setOpen(false);
  };

  const onAccept = () => {
    if (requesting) return;
    setRequesting(true);
    void requestInitialDevicePermissions(source).then((state) => {
      if (state.camera !== "granted" || state.microphone !== "granted") {
        recordDiBaYOnboardingDecision(
          "call_media",
          state.camera === "blocked" || state.microphone === "blocked" || state.camera === "denied" || state.microphone === "denied"
            ? "browser_denied"
            : "declined",
        );
        setOpen(false);
        return;
      }
      recordDiBaYOnboardingDecision("call_media", "accepted");
      invalidateCallMediaPermissionCheckCache();
      setOpen(false);
    }).finally(() => {
      setRequesting(false);
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
          {t("dibay_call_media_initial_title")}
        </p>
        <p className="mt-2 sam-text-body-secondary text-sam-muted">{t("dibay_call_media_initial_body")}</p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onLater}
            disabled={requesting}
            className="flex-1 rounded-ui-rect border border-sam-border py-2.5 sam-text-body font-medium text-sam-fg"
          >
            {t("dibay_call_media_later")}
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={requesting}
            className="flex-1 rounded-ui-rect bg-sam-ink py-2.5 sam-text-body font-medium text-white disabled:opacity-60"
          >
            {requesting ? t("cm_ui_check_permission") : t("dibay_call_media_initial_accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
