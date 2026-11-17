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
import {
  LIFECYCLE_NAV_APPLIED_KEY as NAV_APPLIED_KEY,
  isSameLifecycleSurface,
  lifecycleNavHoldStartPath,
  settleLifecycleNavHold,
  isLifecycleAuthSurfacePath,
} from "@/lib/startup/lifecycle-nav-hold";
import { markInitialDestinationVisualReady } from "@/lib/startup/startup-metrics";

/** Auth / consent / onboarding surfaces — owned by auth SSOT, never replaced by restore or Safe Entry. 단일 정의는 `lifecycle-nav-hold`. */
export { isLifecycleAuthSurfacePath };

export function LifecycleRouteEffects(): null {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const navigated = useRef(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined" || navigated.current) return;
    // 진입 감사 OS-2·OS-4: 시작 화면 해제 보류 여부를 이 문서에서 먼저 확정한다(아래에서 적용 표시를 쓰기 전).
    lifecycleNavHoldStartPath();
    const d = getAppEntryDecision();
    if (!d.navigateTo) return;
    // 빌드 전 감사 W3: 「적용함」 표시는 복원·안전 진입에만 쓴다. 새로 켬 첫 화면 이동(user_cold)은 이 문서에서 한 번
    // (`navigated` ref) — 같은 세션의 다음 문서 다시 열기(DOC_RESET) 복원을 막지 않게.
    const recordsApplied = d.kind !== "user_cold";
    if (recordsApplied) {
      try {
        if (sessionStorage.getItem(NAV_APPLIED_KEY) === "1") return;
      } catch {
        /* continue */
      }
    }
    const current = (pathname.split("?")[0] || "/") as string;
    const target = d.navigateTo.split("?")[0] || d.navigateTo;
    if (recordsApplied) {
      try {
        sessionStorage.setItem(NAV_APPLIED_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    navigated.current = true;
    // Lifecycle SSOT §6 — never bypass auth: a document that booted on a login / terms / onboarding
    // surface keeps it (restore / Safe Entry would drop an unconsented member on a public page).
    if (isLifecycleAuthSurfacePath(current)) {
      console.info(`[dibay-lifecycle] navigate_skipped kind=${d.kind} reason=auth_surface path=${current}`);
      settleLifecycleNavHold();
      return;
    }
    // `/` 와 `/home` 은 같은 앱 홈 — 같은 화면으로 다시 이동하지 않는다(진입 감사 OS-2: 흰 빈 화면 한 프레임).
    if (isSameLifecycleSurface(current, target)) {
      settleLifecycleNavHold();
      return;
    }
    const navigateTo = d.navigateTo;
    // Lifecycle SSOT §8 — 의도 목적지(Push·Deep Link)가 있는 시작에서는 직전 화면 복원·Safe Entry 를 먼저 띄우지 않는다.
    // (재감사 2026-11-01: 앱 종료 후 공지 푸시 탭 → 직전 메신저 방이 잠깐 보인 뒤 공지 상세로 이동했다.)
    // 네이티브 보관 목적지 조회는 응답을 기다릴 뿐 고정 대기는 없다. 조회 불가(구버전·웹)면 기존대로 복원한다.
    void hasLaunchIntent().then((intent) => {
      const pushed = readPushLaunchIntentNavigated();
      if (intent || pushed) {
        console.info(`[dibay-lifecycle] navigate_skipped kind=${d.kind} reason=launch_intent:${intent ?? "push_navigated"}`);
        settleLifecycleNavHold();
        return;
      }
      const now = (window.location.pathname.split("?")[0] || "/") as string;
      if (now !== current) {
        // 조회 사이에 다른 이동(사용자·앱)이 먼저 일어났으면 덮지 않는다.
        console.info(`[dibay-lifecycle] navigate_skipped kind=${d.kind} reason=moved path=${now}`);
        settleLifecycleNavHold();
        return;
      }
      console.info(`[dibay-lifecycle] navigate kind=${d.kind} → ${navigateTo}`);
      router.replace(navigateTo);
    }).catch(() => {
      // 의도 조회 실패 = 이동하지 않음(기존 동작) — 시작 화면 보류도 푼다(무한 대기 금지).
      settleLifecycleNavHold();
    });
  }, [pathname, router]);

  // 진입 감사 OS-4: 이동으로 주소가 시작 주소를 떠난 뒤 그려진 화면에서 시작 화면을 해제한다.
  // 목적지 화면이 해제 신호를 보내지 않는 경우(없는 주소·오류 화면)에도 두 프레임 뒤 해제 — 보류가 남지 않게.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const start = lifecycleNavHoldStartPath();
    if (!start) return;
    const p = pathname.split("?")[0] || "/";
    if (p === start) return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        settleLifecycleNavHold();
        markInitialDestinationVisualReady();
      });
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [pathname]);

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
