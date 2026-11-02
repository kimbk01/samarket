/**
 * Execute BackResolution — Delivery adapter helper (CUT 2).
 */

import { markAppScrollNavIntent } from "@/lib/navigation/app-scroll-memory";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";
import type { BackResolution } from "@/lib/navigation/dibay-entry-context";

type DibayBackRouter = {
  back: () => void;
  push: (href: string, options?: { scroll?: boolean }) => void;
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

export function runDibayBackResolution(
  router: DibayBackRouter,
  resolution: BackResolution,
  animatedBack: ((navigate: () => void) => void) | null = null
): void {
  if (resolution.action === "CLOSE") {
    return;
  }

  /** 뒤로 도착 화면의 위치 복원은 앱 공용 규칙(`app-scroll-memory`) — 뒤로 신호만 남긴다 (스크롤 SSOT 2026-11-03) */
  markAppScrollNavIntent("back");

  if (resolution.action === "HISTORY") {
    const fallback = resolution.fallbackHref?.trim() || undefined;
    const navigate = () => runHistoryBackWithFallback(router, fallback);
    if (animatedBack) {
      animatedBack(navigate);
      return;
    }
    navigate();
    return;
  }

  const navigate = () => {
    if (resolution.action === "REPLACE") {
      router.replace(resolution.targetHref, { scroll: false });
      return;
    }
    router.push(resolution.targetHref, { scroll: false });
  };
  if (animatedBack) {
    animatedBack(navigate);
    return;
  }
  navigate();
}
