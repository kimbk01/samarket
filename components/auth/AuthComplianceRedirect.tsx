"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchMeProfileDeduped } from "@/lib/profile/fetch-me-profile-deduped";
import { hasStoreTermsConsent } from "@/lib/auth/store-member-policy";
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
    void (async () => {
      const { status, json } = await fetchMeProfileDeduped().catch(() => ({ status: 500, json: null }));
      if (cancelled || status !== 200) return;
      const profile = (json as { profile?: ProfileRow | null } | null)?.profile ?? null;
      if (!profile?.id) return;
      if (!hasStoreTermsConsent(profile)) {
        router.replace(`/auth/consent?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
