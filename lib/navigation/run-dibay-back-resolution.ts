/**
 * Execute BackResolution — Delivery adapter helper (CUT 2).
 */

import {
  isDeliveryListScrollRoute,
  noteDeliveryListScrollBackFromStoreDetail,
} from "@/lib/dibay/delivery-list-scroll-restore";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";
import type { BackResolution } from "@/lib/navigation/dibay-entry-context";

type DibayBackRouter = {
  back: () => void;
  push: (href: string, options?: { scroll?: boolean }) => void;
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

function noteRestoreIfList(href: string): void {
  const path = href.split("?")[0] ?? "";
  if (isDeliveryListScrollRoute(path) || isDeliveryListScrollRoute(href)) {
    noteDeliveryListScrollBackFromStoreDetail(href);
  }
}

export function runDibayBackResolution(
  router: DibayBackRouter,
  resolution: BackResolution,
  animatedBack: ((navigate: () => void) => void) | null = null
): void {
  if (resolution.action === "CLOSE") {
    return;
  }

  if (resolution.action === "HISTORY") {
    const fallback = resolution.fallbackHref?.trim() || undefined;
    if (fallback) noteRestoreIfList(fallback);
    const navigate = () => runHistoryBackWithFallback(router, fallback);
    if (animatedBack) {
      animatedBack(navigate);
      return;
    }
    navigate();
    return;
  }

  noteRestoreIfList(resolution.targetHref);
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
