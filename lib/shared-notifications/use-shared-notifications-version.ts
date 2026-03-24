"use client";

import { useSyncExternalStore } from "react";
import {
  getSharedNotificationsVersion,
  subscribeSharedNotifications,
} from "./shared-notification-store";

export function useSharedNotificationsVersion(): number {
  return useSyncExternalStore(
    subscribeSharedNotifications,
    getSharedNotificationsVersion,
    getSharedNotificationsVersion
  );
}
