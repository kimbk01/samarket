"use client";

import { applyHubBadgeProjection } from "@/lib/chat-domain/projections/hub-badge-projection";
import { useInAppNotificationBannerStore } from "@/lib/notifications/in-app-banner/in-app-notification-banner-store";
import { OWNER_HUB_BADGE_EMPTY } from "@/lib/chats/owner-hub-badge-types";
import { logNotifyBadge } from "@/lib/notifications/core/notification-logs";

/**
 * P3-b2 LOCK — Auth Epoch local surface clear-only.
 * Logout / account switch must NOT call badge-count?fresh=1 or Hub GET.
 * Server unread is unchanged; prior-user client surfaces go to zero locally.
 *
 * DO NOT: requestMessengerHubBadgeResync / requestNotificationBadgeCountResync here.
 */
export function resetMessengerNotificationSurfacesAfterSignOut(): void {
  if (typeof window === "undefined") return;
  try {
    /** 이전 계정의 앱 안 배너(메신저·회원 알림 모두) 정리 */
    useInAppNotificationBannerStore.getState().dismiss();
  } catch {
    /* ignore */
  }
  applyHubBadgeProjection({
    breakdown: OWNER_HUB_BADGE_EMPTY,
    versionMs: Date.now(),
    source: "client_cache",
    totalUnread: 0,
  });
  logNotifyBadge("ui_set", { auth_epoch_surface_clear: 1, network: 0 });
}
