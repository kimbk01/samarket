"use client";

import { clearBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";

/**
 * 메신저 홈 PTR — stale bootstrap 캐시를 비우고 비-silent refresh 로 목록을 다시 맞춘다.
 */
export async function runMessengerHomePullRefresh(refresh: (silent?: boolean) => Promise<void>): Promise<void> {
  clearBootstrapCache();
  await refresh(false);
}
