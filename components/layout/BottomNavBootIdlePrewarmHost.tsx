"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { PrefetchOptions } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { scheduleBottomNavBootIdlePrewarm } from "@/lib/main-menu/bottom-nav-boot-idle-prewarm";
import { createBottomNavResumeRewarmTask } from "@/lib/main-menu/bottom-nav-resume-rewarm";
import { registerAppResumeTask } from "@/lib/app-resume/app-resume-coordinator.client";
import { useMainBottomNavTabs } from "@/contexts/MainBottomNavTabsContext";
import { useRegion } from "@/contexts/RegionContext";
import { shouldRunApkBottomNavRoutePrefetch } from "@/lib/platform/apk-remote-webview-perf";
import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";
import {
  isLaunchPushDestinationPending,
  whenLaunchPushDestinationSettled,
} from "@/lib/startup/launch-push-destination-pending";

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
  const latestRef = useRef({ pathname, searchParams, tabs, router, primaryRegion });
  useEffect(() => {
    latestRef.current = { pathname, searchParams, tabs, router, primaryRegion };
  }, [pathname, searchParams, tabs, router, primaryRegion]);

  /** 설계 §24 D4 — 알림 목적지 대기(덮개 아래)가 끝난 뒤로 미룬 예열의 취소(언마운트 때만) */
  const cancelDeferredRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (scheduledRef.current) return;
    scheduledRef.current = true;

    // 설계 §24 D4: 알림 목적지 대기 중이면 덮개가 걷힌 뒤 예열한다(실측: 대기 중 탭 RSC 8건이 채팅방 RSC 와 경쟁).
    // 대기가 없으면(아이콘 실행·iOS·알림 목적지 없음) 바로 — 이전과 같다.
    cancelDeferredRef.current = whenLaunchPushDestinationSettled(() => {
      const cur = latestRef.current;
      scheduleBottomNavBootIdlePrewarm({
        pathname: cur.pathname ?? null,
        tabs: cur.tabs,
        primaryRegion: cur.primaryRegion,
        ctx: { searchParams: cur.searchParams },
        prefetchRoute: shouldRunApkBottomNavRoutePrefetch()
          ? (href) => {
              void cur.router.prefetch(href);
            }
          : undefined,
      });
    });
  }, [pathname, primaryRegion, router, searchParams, tabs]);

  useEffect(() => () => cancelDeferredRef.current?.(), []);

  useEffect(() => {
    return registerAppResumeTask(
      createBottomNavResumeRewarmTask(
        () => {
          const cur = latestRef.current;
          return { pathname: cur.pathname ?? null, tabs: cur.tabs, ctx: { searchParams: cur.searchParams } };
        },
        (href) => {
          // 설계 §24 D4: 알림 목적지 대기 중 복귀 재예열도 하지 않는다
          if (isLaunchPushDestinationPending()) return;
          latestRef.current.router.prefetch(href, PREFETCH_FULL);
        }
      )
    );
  }, []);

  return null;
}
