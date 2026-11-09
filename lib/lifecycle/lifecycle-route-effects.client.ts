"use client";

/**
 * Applies AppEntryKind navigation (restore / Safe Entry) and persists RestoreEnvelope on route changes.
 * Mounted inside deferred route tree so Intro can finish first on USER_COLD.
 */

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getAppEntryDecision } from "@/lib/lifecycle/app-entry-kind";
import { writeRestoreEnvelope, readLifecycleAccountKey } from "@/lib/lifecycle/restore-envelope";
import { hasLaunchIntent, readPushLaunchIntentNavigated } from "@/lib/lifecycle/launch-intent.client";

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
    if (current === target) return;
    const navigateTo = d.navigateTo;
    // Lifecycle SSOT §8 — 의도 목적지(Push·Deep Link)가 있는 시작에서는 직전 화면 복원·Safe Entry 를 먼저 띄우지 않는다.
    // (재감사 2026-11-01: 앱 종료 후 공지 푸시 탭 → 직전 메신저 방이 잠깐 보인 뒤 공지 상세로 이동했다.)
    // 네이티브 보관 목적지 조회는 응답을 기다릴 뿐 고정 대기는 없다. 조회 불가(구버전·웹)면 기존대로 복원한다.
    void hasLaunchIntent().then((intent) => {
      const pushed = readPushLaunchIntentNavigated();
      if (intent || pushed) {
        console.info(`[dibay-lifecycle] navigate_skipped kind=${d.kind} reason=launch_intent:${intent ?? "push_navigated"}`);
        return;
      }
      const now = (window.location.pathname.split("?")[0] || "/") as string;
      if (now !== current) {
        // 조회 사이에 다른 이동(사용자·앱)이 먼저 일어났으면 덮지 않는다.
        console.info(`[dibay-lifecycle] navigate_skipped kind=${d.kind} reason=moved path=${now}`);
        return;
      }
      console.info(`[dibay-lifecycle] navigate kind=${d.kind} → ${navigateTo}`);
      router.replace(navigateTo);
    });
  }, [pathname, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = pathname.split("?")[0] || "/";
    if (path === "/" || path.startsWith("/auth") || path.startsWith("/login")) return;
    const d = getAppEntryDecision();
    // Persist for next OS_RESTORE / DOC_RESET after we have a real surface
    if (d.kind === "user_cold" || d.kind === "os_restore" || d.kind === "doc_reset" || d.kind === "ambiguous") {
      /** 허용 쿼리(cm_list)만 함께 저장 — `buildRestoreEnvelopePath` */
      writeRestoreEnvelope(`${path}${window.location.search}`, readLifecycleAccountKey());
    }
    const onVis = () => {
      if (document.visibilityState !== "hidden") return;
      const p = window.location.pathname.split("?")[0] || "/";
      if (p === "/" || p.startsWith("/auth") || p.startsWith("/login")) return;
      writeRestoreEnvelope(`${p}${window.location.search}`, readLifecycleAccountKey());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pathname]);

  return null;
}
