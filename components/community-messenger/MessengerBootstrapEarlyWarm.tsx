"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { isBootstrapCacheFresh } from "@/lib/community-messenger/bootstrap-cache";
import { warmMessengerListBootstrapClient } from "@/lib/community-messenger/warm-messenger-list-bootstrap-client";
import { mainBottomNavPrefetchTriggerKey } from "@/lib/main-menu/main-bottom-nav-prefetch-domain";

/**
 * 로그인 직후·홈 등에서 메신저 탭 **첫 선택** 전에 lite 부트스트랩을 미리 받아
 * `peekBootstrapCache` 를 채운다. 하단 네비의 idle·디바운스 프리페치보다 앞서는 경우가 많다.
 * `warmMessengerListBootstrapClient` 는 단일 비행이라 중복 호출은 합쳐진다.
 *
 * 마운트 위치: `(main)/community-messenger` 레이아웃 전용.
 * 과거 `(main)` 전역에서는 `shellDomain === "messenger"` 일 때 스킵해 탭 부트스트랩과 경쟁을 피했으나,
 * 세그먼트 안에서만 올리면 cold cache 일 때 warm 이 반드시 돌아가야 하므로 그 가드는 제거한다.
 */
export function MessengerBootstrapEarlyWarm() {
  const pathname = usePathname() ?? "";
  const shellDomain = useMemo(() => mainBottomNavPrefetchTriggerKey(pathname || null), [pathname]);

  useEffect(() => {
    if (isBootstrapCacheFresh()) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      if (isBootstrapCacheFresh()) return;
      warmMessengerListBootstrapClient();
    };
    if (shellDomain === "philife") {
      const t = window.setTimeout(() => {
        run();
      }, 900);
      return () => {
        cancelled = true;
        window.clearTimeout(t);
      };
    }
    queueMicrotask(() => {
      if (cancelled) return;
      run();
    });
    return () => {
      cancelled = true;
    };
  }, [shellDomain]);

  return null;
}
