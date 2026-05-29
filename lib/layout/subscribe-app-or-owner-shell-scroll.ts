"use client";

import { isOwnerCompactShellScrollContext } from "@/lib/layout/resolve-app-shell-scroll-top";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import { subscribeOwnerCompactShellScroll } from "@/lib/layout/subscribe-owner-compact-shell-scroll";

/** 메인 셸 또는 매장 오너 compact — 실제 스크롤 루트에 구독 */
export function subscribeAppOrOwnerShellScroll(
  onScroll: (event: Event) => void,
  options?: { passive?: boolean }
): () => void {
  if (isOwnerCompactShellScrollContext()) {
    return subscribeOwnerCompactShellScroll(onScroll, options);
  }
  return subscribeAppShellScroll(onScroll, options);
}
