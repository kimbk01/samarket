"use client";

import { useSyncExternalStore } from "react";
import type { NotificationBadgeCount } from "@/lib/notifications/core/notification-event-types";
import {
  getNotificationBadgeCountServerSnapshot,
  getNotificationBadgeCountSnapshot,
  subscribeNotificationBadgeCount,
} from "@/lib/notifications/notification-badge-count-store";

const EMPTY: NotificationBadgeCount = {
  total: 0,
  chat: 0,
  group: 0,
  trade: 0,
  store: 0,
  missedCall: 0,
};

export function useNotificationBadgeCount(): NotificationBadgeCount {
  const snap = useSyncExternalStore(
    subscribeNotificationBadgeCount,
    getNotificationBadgeCountSnapshot,
    getNotificationBadgeCountServerSnapshot
  );
  return snap ?? EMPTY;
}

export function useNotificationBadgeTotal(): number {
  return useNotificationBadgeCount().total;
}
