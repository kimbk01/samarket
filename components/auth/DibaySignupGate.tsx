"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getAppBootSnapshot,
  isAppBootReady,
  peekAppBootProfile,
  subscribeAppBoot,
} from "@/lib/app-boot/app-boot-store";
import { APP_BOOT_READY_EVENT } from "@/lib/app-boot/app-boot-types";
import { ensureAppBoot } from "@/lib/app-boot/run-app-boot";
import { deriveDibaySignupStatus } from "@/lib/auth/dibay-signup-status";
import { isClientSignupGateExemptPath } from "@/lib/auth/client-signup-gate";
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
import {
  getClientRequiredConsentVersions,
  subscribeClientRequiredConsentVersions,
} from "@/lib/legal/client-required-consent";
import {
  isSignupCompleteResolvedThisSession,
  markSignupCompleteResolvedSession,
  resetSignupGateSessionFlags,
} from "@/lib/auth/signup-gate-session";
import { guardedRouterReplace, logNetworkLoopGuardReplace } from "@/lib/dev/network-loop-guard";
import { useStoresHomeOverlayDeferUntilInput } from "@/lib/stores/use-stores-home-overlay-defer-until-input";

/** Resume refresh of required consent versions — at most once per minute. */
const CONSENT_VERSION_REFRESH_MIN_MS = 60_000;

export function DibaySignupGate() {
  const pathname = usePathname() ?? "";
  const deferStoresHomeLcp = useStoresHomeOverlayDeferUntilInput();
  const router = useRouter();
  const routerRef = useRef(router);
  const pathnameRef = useRef(pathname);
  const checkInFlightRef = useRef<Promise<void> | null>(null);
  const redirectInFlightTargetRef = useRef<string | null>(null);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const checkSignupGate = useCallback(() => {
    if (typeof window === "undefined") return;
    if (deferStoresHomeLcp) return;
    if (!isAppBootReady()) return;
    /**
     * P2-1 (SG-05): public browse 경로도 로그인 + 미동의 회원이면 동의 화면으로 보낸다
     * (OAuth 후 약관 화면 이탈·재실행 복구). 게스트는 boot profile 이 없어 대상이 아니다.
     */
    if (isClientSignupGateExemptPath(pathnameRef.current)) return;
    if (isSignupCompleteResolvedThisSession()) return;
    if (checkInFlightRef.current) return;

    checkInFlightRef.current = (async () => {
      const boot = peekAppBootProfile();
      if (!boot?.id) return;

      const bootSignup = deriveDibaySignupStatus(boot, {
        hasSession: true,
        requiredConsent: getClientRequiredConsentVersions(),
      });
      /** SSOT_CONTRACT: dibay-signup-consent-only-gate DibaySignupGate consentComplete
       * 앱 접근 게이트 = consent only. @id·프로필 미완으로 방/통화 deep route 를 /mypage 로 덮지 않는다. */
      if (bootSignup.consentComplete) {
        markSignupCompleteResolvedSession();
        return;
      }

      try {
        const returnNext =
          typeof window !== "undefined"
            ? `${window.location.pathname}${window.location.search}`
            : pathnameRef.current;
        const { status, json } = await fetchSignupStatusDeduped(returnNext);
        if (status === 200 && json?.signup?.consentComplete) {
          markSignupCompleteResolvedSession();
          return;
        }
        const target = json?.route?.trim();
        if (!target || status !== 200) return;
        if (json?.signup?.consentComplete) {
          markSignupCompleteResolvedSession();
          return;
        }

        if (pathnameRef.current.startsWith(target.split("?")[0] ?? target)) {
          logNetworkLoopGuardReplace({
            source: "dibay-signup-gate",
            targetUrl: target,
            reason: "already_on_target",
          });
          return;
        }
        if (redirectInFlightTargetRef.current === target) {
          logNetworkLoopGuardReplace({
            source: "dibay-signup-gate",
            targetUrl: target,
            reason: "duplicate_redirect_blocked",
          });
          return;
        }
        if (
          guardedRouterReplace(routerRef.current, target, {
            source: "dibay-signup-gate",
            reason: "signup_incomplete",
          })
        ) {
          redirectInFlightTargetRef.current = target;
        }
      } catch {
        /* ignore */
      }
    })().finally(() => {
      checkInFlightRef.current = null;
    });
  }, [deferStoresHomeLcp]);

  useEffect(() => {
    if (deferStoresHomeLcp) return;
    if (isClientSignupGateExemptPath(pathname)) return;
    checkSignupGate();
  }, [deferStoresHomeLcp, pathname, checkSignupGate]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onBoot = () => checkSignupGate();
    window.addEventListener(APP_BOOT_READY_EVENT, onBoot);
    const unsubBoot = subscribeAppBoot(() => {
      if (getAppBootSnapshot().status === "ready") checkSignupGate();
    });
    void ensureAppBoot().then(() => checkSignupGate());

    return () => {
      window.removeEventListener(APP_BOOT_READY_EVENT, onBoot);
      unsubBoot();
    };
  }, [checkSignupGate]);

  /**
   * B11 — running app: an Admin publish of new required versions must reach a session that
   * already resolved consent. Resume re-reads signup-status (throttled); a version change resets
   * the per-session verdict and re-runs the gate with the new versions.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const unsub = subscribeClientRequiredConsentVersions(() => {
      resetSignupGateSessionFlags();
      redirectInFlightTargetRef.current = null;
      checkSignupGate();
    });
    let lastRefreshAt = 0;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!peekAppBootProfile()?.id) return;
      const now = Date.now();
      if (now - lastRefreshAt < CONSENT_VERSION_REFRESH_MIN_MS) return;
      lastRefreshAt = now;
      void fetchSignupStatusDeduped().catch(() => {
        /* next resume retries */
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkSignupGate]);

  return null;
}
