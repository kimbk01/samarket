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
import { deriveDibaySignupStatus, isDibaySignupGateExcludedPath } from "@/lib/auth/dibay-signup-status";
import { shouldBlockUnauthenticatedHtmlRequest } from "@/lib/auth/guest-browse-access-policy";
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
import {
  isSignupCompleteResolvedThisSession,
  markSignupCompleteResolvedSession,
} from "@/lib/auth/signup-gate-session";
import { guardedRouterReplace, logNetworkLoopGuardReplace } from "@/lib/dev/network-loop-guard";
import { useStoresHomeOverlayDeferUntilInput } from "@/lib/stores/use-stores-home-overlay-defer-until-input";

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
    if (isDibaySignupGateExcludedPath(pathnameRef.current)) return;
    if (!shouldBlockUnauthenticatedHtmlRequest(pathnameRef.current)) return;
    if (isSignupCompleteResolvedThisSession()) return;
    if (checkInFlightRef.current) return;

    checkInFlightRef.current = (async () => {
      const boot = peekAppBootProfile();
      if (!boot?.id) return;

      const bootSignup = deriveDibaySignupStatus(boot, { hasSession: true });
      /** 앱 접근 게이트 = consent only. @id·프로필 미완으로 방/통화 deep route 를 /mypage 로 덮지 않는다. */
      if (bootSignup.consentComplete) {
        markSignupCompleteResolvedSession();
        return;
      }

      try {
        const { status, json } = await fetchSignupStatusDeduped();
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
    if (isDibaySignupGateExcludedPath(pathname)) return;
    if (!shouldBlockUnauthenticatedHtmlRequest(pathname)) return;
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

  return null;
}
