"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { refreshOwnerHubBadgeIfHubPath } from "@/lib/chats/owner-hub-badge-store";

/**
 * owner hub 경로 기반 refresh 트리거는 전역 1개로만 유지한다.
 * 개별 소비자 훅마다 pathname effect를 두지 않아 mount churn 시 중복 디바운스가 쌓이지 않게 한다.
 */
export function OwnerHubBadgeRuntime() {
  const pathname = usePathname();

  useEffect(() => {
    refreshOwnerHubBadgeIfHubPath(pathname ?? null);
  }, [pathname]);

  return null;
}
