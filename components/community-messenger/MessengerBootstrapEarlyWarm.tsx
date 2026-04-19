"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { peekBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { warmMessengerListBootstrapClient } from "@/lib/community-messenger/warm-messenger-list-bootstrap-client";

/**
 * 로그인 직후·홈 등에서 메신저 탭 **첫 선택** 전에 lite 부트스트랩을 미리 받아
 * `peekBootstrapCache` 를 채운다. 하단 네비의 idle·디바운스 프리페치보다 앞서는 경우가 많다.
 * `warmMessengerListBootstrapClient` 는 단일 비행이라 중복 호출은 합쳐진다.
 */
export function MessengerBootstrapEarlyWarm() {
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (pathname.startsWith("/community-messenger")) return;
    if (peekBootstrapCache()) return;
    queueMicrotask(() => {
      warmMessengerListBootstrapClient();
    });
  }, [pathname]);

  return null;
}
