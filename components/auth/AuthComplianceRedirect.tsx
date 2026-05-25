"use client";

import { useEffect, useRef } from "react";
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
  const checkInFlightRef = useRef<Promise<void> | null>(null);
  const lastRedirectRef = useRef<string | null>(null);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    if (shouldSkip(pathname) || typeof window === "undefined") return;

    let cancelled = false;

    const profileHasStoreConsent = (
      p: {
        terms_accepted_at?: string | null;
        terms_version?: string | null;
        privacy_accepted_at?: string | null;
        privacy_version?: string | null;
      } | null | undefined
    ): boolean => Boolean(p?.terms_accepted_at != null && hasStoreTermsConsent(p));

    const verifyConsentFromServer = (): Promise<boolean> => {
      return (async () => {
        try {
          const { status, json } = await fetchMeProfileDeduped("auth_compliance_consent_check");
          const raw = json as { ok?: boolean; profile?: ProfileRow } | null;
          if (status === 200 && raw?.ok && raw.profile?.id) {
            mergeAppBootProfileFull(raw.profile);
            return hasStoreTermsConsent(raw.profile);
          }
        } catch {
          /* ignore */
        }
        return false;
      })();
    };

    const redirectToConsent = () => {
      const next = window.location.pathname + window.location.search;
      const target = `/auth/consent?next=${encodeURIComponent(next)}`;
      if (pathname.startsWith("/auth/consent")) {
        logNetworkLoopGuardReplace({
          source: "auth-compliance-redirect",
          targetUrl: target,
          reason: "already_on_consent",
        });
        return;
      }
      if (lastRedirectRef.current === target) {
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
        lastRedirectRef.current = target;
      }
    };

    const checkConsent = () => {
      if (checkInFlightRef.current) return;
      checkInFlightRef.current = (async () => {
        const boot = peekAppBootProfile();
        if (!boot?.id) return;
        if (profileHasStoreConsent(boot)) return;
        const cached = getCurrentUser();
        if (cached && profileHasStoreConsent(cached)) {
          if (boot.id === cached.id) {
            mergeAppBootProfileFull({
              ...boot,
              terms_accepted_at: cached.terms_accepted_at ?? boot.terms_accepted_at,
              terms_version: cached.terms_version ?? boot.terms_version,
              privacy_accepted_at: cached.privacy_accepted_at ?? boot.privacy_accepted_at,
              privacy_version: cached.privacy_version ?? boot.privacy_version,
            });
          }
          return;
        }
        if (await verifyConsentFromServer()) return;
        if (cancelled) return;
        redirectToConsent();
      })().finally(() => {
        checkInFlightRef.current = null;
      });
    };

    const onBoot = () => {
      if (!cancelled) checkConsent();
    };

    window.addEventListener(APP_BOOT_READY_EVENT, onBoot);

    const unsubBoot = subscribeAppBoot(() => {
      if (getAppBootSnapshot().status === "ready") onBoot();
    });

    void ensureAppBoot().then(() => {
      if (!cancelled) checkConsent();
    });

    return () => {
      cancelled = true;
      window.removeEventListener(APP_BOOT_READY_EVENT, onBoot);
      unsubBoot();
    };
  }, [pathname]);

  return null;
}
