"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { scheduleBottomNavBootIdlePrewarm } from "@/lib/main-menu/bottom-nav-boot-idle-prewarm";
import { useMainBottomNavTabs } from "@/contexts/MainBottomNavTabsContext";
import { useRegion } from "@/contexts/RegionContext";
import { shouldRunApkBottomNavRoutePrefetch } from "@/lib/platform/apk-remote-webview-perf";

/**
 * APK cold start — 하단 탭 비활성 도메인 client prewarm + RSC prefetch (idle 1회).
 */
export function BottomNavBootIdlePrewarmHost() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { primaryRegion } = useRegion();
  const tabs = useMainBottomNavTabs();
  const scheduledRef = useRef(false);

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

  return null;
}
