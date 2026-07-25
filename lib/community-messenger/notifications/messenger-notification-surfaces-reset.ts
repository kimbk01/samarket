"use client";

import { applyHubBadgeProjection } from "@/lib/chat-domain/projections/hub-badge-projection";
import { useMessengerInAppMessageBannerStore } from "@/lib/community-messenger/notifications/messenger-in-app-banner-store";
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
    useMessengerInAppMessageBannerStore.getState().dismiss();
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
