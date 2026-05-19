"use client";



import { useEffect } from "react";

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



  useEffect(() => {

    if (shouldSkip(pathname) || typeof window === "undefined") return;

    let cancelled = false;



    let consentVerifyFlight: Promise<boolean> | null = null;

    const profileHasStoreConsent = (
      p: { terms_accepted_at?: string | null; terms_version?: string | null; privacy_accepted_at?: string | null; privacy_version?: string | null } | null | undefined
    ): boolean => Boolean(p?.terms_accepted_at != null && hasStoreTermsConsent(p));

    const verifyConsentFromServer = (): Promise<boolean> => {
      if (!consentVerifyFlight) {
        consentVerifyFlight = (async () => {
          try {
            const { status, json } = await fetchMeProfileDeduped();
            const raw = json as { ok?: boolean; profile?: ProfileRow } | null;
            if (status === 200 && raw?.ok && raw.profile?.id && hasStoreTermsConsent(raw.profile)) {
              mergeAppBootProfileFull(raw.profile);
              return true;
            }
          } catch {
            /* ignore */
          }
          return false;
        })().finally(() => {
          consentVerifyFlight = null;
        });
      }
      return consentVerifyFlight;
    };

    const checkConsent = () => {
      void (async () => {
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
        router.replace(
          `/auth/consent?next=${encodeURIComponent(window.location.pathname + window.location.search)}`
        );
      })();
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

  }, [pathname, router]);



  return null;

}


