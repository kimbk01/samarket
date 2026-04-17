"use client";

import { useMessengerInAppMessageBannerStore } from "@/lib/community-messenger/notifications/messenger-in-app-banner-store";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";

/**
 * 계정에서 빠질 때 메신저 **클라이언트 표면**만 초기화(서버 unread 는 그대로).
 * @see messenger-notification-contract.ts 정의
 */
export function resetMessengerNotificationSurfacesAfterSignOut(): void {
  if (typeof window === "undefined") return;
  try {
    useMessengerInAppMessageBannerStore.getState().dismiss();
  } catch {
    /* ignore */
  }
  requestMessengerHubBadgeResync("auth_signed_out");
}
