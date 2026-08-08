"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  mergeAppBootProfileFull,
  peekAppBootProfile,
  subscribeAppBoot,
  getAppBootSnapshot,
} from "@/lib/app-boot/app-boot-store";
import { APP_BOOT_READY_EVENT } from "@/lib/app-boot/app-boot-types";
import { ensureAppBoot } from "@/lib/app-boot/run-app-boot";
import { guardedRouterReplace, logNetworkLoopGuardReplace } from "@/lib/dev/network-loop-guard";
import { isStoresHomeLcpPath } from "@/lib/stores/stores-home-lcp-policy";
import { useStoresHomeOverlayDeferUntilInput } from "@/lib/stores/use-stores-home-overlay-defer-until-input";

/** 부트·세션당 consent 서버 재확인 1회 — pathname 변경마다 GET 방지 */
let storeConsentResolvedThisSession = false;

function shouldSkip(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/signup" ||
    pathname.startsWith("/signup/") ||
    pathname.startsWith("/auth/consent") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/auth/onboarding/") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/account/delete")
  );
}

export function AuthComplianceRedirect() {
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

  const checkConsent = useCallback(() => {
    if (typeof window === "undefined") return;
    if (deferStoresHomeLcp) return;
    if (shouldSkip(pathnameRef.current)) return;
    if (storeConsentResolvedThisSession) return;
    if (checkInFlightRef.current) return;

    checkInFlightRef.current = (async () => {
      const boot = peekAppBootProfile();
      if (!boot?.id) return;
      try {
        const res = await fetch("/api/me/legal-consent", { credentials: "include", cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          consent?: {
            complete?: boolean;
            termsAcceptedAt?: string | null;
            termsVersion?: string | null;
            privacyAcceptedAt?: string | null;
            privacyVersion?: string | null;
          };
        };
        if (res.ok && json.ok && json.consent?.complete) {
          mergeAppBootProfileFull({
            ...boot,
            terms_accepted_at: json.consent.termsAcceptedAt ?? boot.terms_accepted_at,
            terms_version: json.consent.termsVersion ?? boot.terms_version,
            privacy_accepted_at: json.consent.privacyAcceptedAt ?? boot.privacy_accepted_at,
            privacy_version: json.consent.privacyVersion ?? boot.privacy_version,
          });
          storeConsentResolvedThisSession = true;
          return;
        }
        if (res.status === 401) {
          storeConsentResolvedThisSession = true;
          return;
        }
      } catch {
        /* fall through to redirect when session exists but check failed open */
      }

      const next = window.location.pathname + window.location.search;
      const target = `/auth/consent?next=${encodeURIComponent(next)}`;
      if (pathnameRef.current.startsWith("/auth/consent")) {
        logNetworkLoopGuardReplace({
          source: "auth-compliance-redirect",
          targetUrl: target,
          reason: "already_on_consent",
        });
        return;
      }
      if (redirectInFlightTargetRef.current === target) {
        logNetworkLoopGuardReplace({
          source: "auth-compliance-redirect",
          targetUrl: target,
          reason: "duplicate_redirect_blocked",
        });
        return;
      }
      if (
        guardedRouterReplace(routerRef.current, target, {
          source: "auth-compliance-redirect",
          reason: "missing_store_consent",
        })
      ) {
        redirectInFlightTargetRef.current = target;
      }
    })().finally(() => {
      checkInFlightRef.current = null;
    });
  }, [deferStoresHomeLcp]);

  useEffect(() => {
    if (deferStoresHomeLcp) return;
    if (!isStoresHomeLcpPath(pathname)) return;
    checkConsent();
  }, [deferStoresHomeLcp, pathname, checkConsent]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onBoot = () => checkConsent();
    window.addEventListener(APP_BOOT_READY_EVENT, onBoot);
    const unsubBoot = subscribeAppBoot(() => {
      if (getAppBootSnapshot().status === "ready") checkConsent();
    });
    void ensureAppBoot().then(() => checkConsent());

    return () => {
      window.removeEventListener(APP_BOOT_READY_EVENT, onBoot);
      unsubBoot();
    };
  }, [checkConsent]);

  useEffect(() => {
    if (shouldSkip(pathname)) return;
    checkConsent();
  }, [pathname, checkConsent]);

  return null;
}
