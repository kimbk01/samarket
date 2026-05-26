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
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { hasStoreTermsConsent } from "@/lib/auth/store-member-policy";
import { fetchMeProfileDeduped } from "@/lib/profile/fetch-me-profile-deduped";
import type { ProfileRow } from "@/lib/profile/types";
import { guardedRouterReplace, logNetworkLoopGuardReplace } from "@/lib/dev/network-loop-guard";

/** 부트·세션당 consent 서버 재확인 1회 — pathname 변경마다 GET /api/me/profile 방지 */
let storeConsentResolvedThisSession = false;

function shouldSkip(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/signup" ||
    pathname.startsWith("/signup/") ||
    pathname.startsWith("/auth/consent") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/account/delete-request")
  );
}

export function AuthComplianceRedirect() {
  const pathname = usePathname() ?? "";
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
    if (shouldSkip(pathnameRef.current)) return;
    if (storeConsentResolvedThisSession) return;
    if (checkInFlightRef.current) return;

    checkInFlightRef.current = (async () => {
      const boot = peekAppBootProfile();
      if (!boot?.id) return;
      if (hasStoreTermsConsent(boot)) {
        storeConsentResolvedThisSession = true;
        return;
      }
      const cached = getCurrentUser();
      if (cached && hasStoreTermsConsent(cached)) {
        if (boot.id === cached.id) {
          mergeAppBootProfileFull({
            ...boot,
            terms_accepted_at: cached.terms_accepted_at ?? boot.terms_accepted_at,
            terms_version: cached.terms_version ?? boot.terms_version,
            privacy_accepted_at: cached.privacy_accepted_at ?? boot.privacy_accepted_at,
            privacy_version: cached.privacy_version ?? boot.privacy_version,
          });
        }
        storeConsentResolvedThisSession = true;
        return;
      }
      try {
        const { status, json } = await fetchMeProfileDeduped("auth_compliance_consent_check");
        const raw = json as { ok?: boolean; profile?: ProfileRow } | null;
        if (status === 200 && raw?.ok && raw.profile?.id && hasStoreTermsConsent(raw.profile)) {
          mergeAppBootProfileFull(raw.profile);
          storeConsentResolvedThisSession = true;
          return;
        }
      } catch {
        /* ignore */
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
  }, []);

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
