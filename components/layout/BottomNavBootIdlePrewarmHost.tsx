"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { PrefetchOptions } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { scheduleBottomNavBootIdlePrewarm } from "@/lib/main-menu/bottom-nav-boot-idle-prewarm";
import { runBottomNavResumeRewarm } from "@/lib/main-menu/bottom-nav-resume-rewarm";
import { registerAppResumeTask } from "@/lib/app-resume/app-resume-coordinator.client";
import { ROUTER_PREFETCH_REWARM_MIN_HIDDEN_MS } from "@/lib/performance/router-cache-policy";
import { useMainBottomNavTabs } from "@/contexts/MainBottomNavTabsContext";
import { useRegion } from "@/contexts/RegionContext";
import { shouldRunApkBottomNavRoutePrefetch } from "@/lib/platform/apk-remote-webview-perf";
import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";

/** Link `prefetch={true}` 와 같은 전략(Next `PrefetchKind.FULL` = "full") — 같은 라우터 캐시 항목을 채운다. */
const PREFETCH_FULL = { kind: "full" } as unknown as PrefetchOptions;

/**
 * APK cold start — 하단 탭 비활성 도메인 client prewarm + RSC prefetch (idle 1회).
 * + 복귀 재준비: 라우터 캐시 만료 시간 이상 숨겨졌다 돌아오면 하단 탭 프리페치를 다시 채운다
 *   (`lib/main-menu/bottom-nav-resume-rewarm.ts`, 복귀 조정자 background 레인).
 *
 * DO NOT useSearchParams() — this host mounts above ConditionalAppShell with no Suspense;
 * suspending blocks Owner Admin shell (`data-biz`) the same way as ConditionalAppShell.
 */
export function BottomNavBootIdlePrewarmHost() {
  const pathname = usePathname();
  const searchParams = useOwnerAdminUrlSearchParams();
  const router = useRouter();
  const { primaryRegion } = useRegion();
  const tabs = useMainBottomNavTabs();
  const scheduledRef = useRef(false);

  /** 복귀 시점의 최신 화면 상태 — 등록은 1회, 값은 ref 로 읽는다. */
  const latestRef = useRef({ pathname, searchParams, tabs, router });
  useEffect(() => {
    latestRef.current = { pathname, searchParams, tabs, router };
  }, [pathname, searchParams, tabs, router]);

  useEffect(() => {
    if (scheduledRef.current) return;
    scheduledRef.current = true;

    scheduleBottomNavBootIdlePrewarm({
      pathname: pathname ?? null,
      tabs,
      primaryRegion,
      ctx: { searchParams },
      prefetchRoute: shouldRunApkBottomNavRoutePrefetch()
        ? (href) => {
            void router.prefetch(href);
          }
        : undefined,
    });
  }, [pathname, primaryRegion, router, searchParams, tabs]);

  useEffect(() => {
    return registerAppResumeTask({
      id: "bottom-nav-resume-rewarm",
      lane: "background",
      // 회원 탭 RSC 는 로그인 쿠키로 나간다 → 세션 미확정(pending·error)이면 보류, 무효면 취소, 비회원은 공개 탭만 실행.
      auth: "optional",
      minHiddenMs: ROUTER_PREFETCH_REWARM_MIN_HIDDEN_MS,
      run: ({ signal }) => {
        const cur = latestRef.current;
        runBottomNavResumeRewarm(
          { pathname: cur.pathname ?? null, tabs: cur.tabs, ctx: { searchParams: cur.searchParams } },
          (href) => cur.router.prefetch(href, PREFETCH_FULL),
          signal
        );
      },
    });
  }, []);

  return null;
}
