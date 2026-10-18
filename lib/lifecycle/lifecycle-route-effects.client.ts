"use client";

/**
 * Applies AppEntryKind navigation (restore / Safe Entry) and persists RestoreEnvelope on route changes.
 * Mounted inside deferred route tree so Intro can finish first on USER_COLD.
 */

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getAppEntryDecision } from "@/lib/lifecycle/app-entry-kind";
import { writeRestoreEnvelope, readLifecycleAccountKey } from "@/lib/lifecycle/restore-envelope";

const NAV_APPLIED_KEY = "dibay:lifecycle:nav-applied";

/** Auth / consent / onboarding surfaces — owned by auth SSOT, never replaced by restore or Safe Entry. */
export function isLifecycleAuthSurfacePath(pathname: string): boolean {
  const p = (pathname.split("?")[0] || "/").trim();
  return (
    p === "/login" ||
    p.startsWith("/login/") ||
    p === "/signup" ||
    p.startsWith("/signup/") ||
    p.startsWith("/auth/") ||
    p === "/onboarding" ||
    p.startsWith("/onboarding/")
  );
}

export function LifecycleRouteEffects(): null {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const navigated = useRef(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined" || navigated.current) return;
    const d = getAppEntryDecision();
    if (!d.navigateTo) return;
    try {
      if (sessionStorage.getItem(NAV_APPLIED_KEY) === "1") return;
    } catch {
      /* continue */
    }
    const current = (pathname.split("?")[0] || "/") as string;
    const target = d.navigateTo.split("?")[0] || d.navigateTo;
    try {
      sessionStorage.setItem(NAV_APPLIED_KEY, "1");
    } catch {
      /* ignore */
    }
    navigated.current = true;
    // Lifecycle SSOT §6 — never bypass auth: a document that booted on a login / terms / onboarding
    // surface keeps it (restore / Safe Entry would drop an unconsented member on a public page).
    if (isLifecycleAuthSurfacePath(current)) {
      console.info(`[dibay-lifecycle] navigate_skipped kind=${d.kind} reason=auth_surface path=${current}`);
      return;
    }
    if (current !== target) {
      console.info(`[dibay-lifecycle] navigate kind=${d.kind} → ${d.navigateTo}`);
      router.replace(d.navigateTo);
    }
  }, [pathname, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = pathname.split("?")[0] || "/";
    if (path === "/" || path.startsWith("/auth") || path.startsWith("/login")) return;
    const d = getAppEntryDecision();
    // Persist for next OS_RESTORE / DOC_RESET after we have a real surface
    if (d.kind === "user_cold" || d.kind === "os_restore" || d.kind === "doc_reset" || d.kind === "ambiguous") {
      writeRestoreEnvelope(path, readLifecycleAccountKey());
    }
    const onVis = () => {
      if (document.visibilityState !== "hidden") return;
      const p = window.location.pathname.split("?")[0] || "/";
      if (p === "/" || p.startsWith("/auth") || p.startsWith("/login")) return;
      writeRestoreEnvelope(p, readLifecycleAccountKey());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pathname]);

  return null;
}
