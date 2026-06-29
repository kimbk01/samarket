/**
 * NotificationGuideModal ↔ notification-permission-manager bridge (non-React).
 */

import type { NotificationGuideMode, NotificationReceiveSnapshot } from "@/lib/permissions/permission-manager/notification-permission-types";

export type NotificationGuideChoice = "allow" | "later" | "open_settings";

type Pending = {
  mode: NotificationGuideMode;
  snapshot: NotificationReceiveSnapshot;
  resolve: (choice: NotificationGuideChoice) => void;
} | null;

let pending: Pending = null;
const listeners = new Set<() => void>();

function bump(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeNotificationGuideBridge(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getNotificationGuidePending(): Pending {
  return pending;
}

export function openNotificationGuideModal(
  mode: NotificationGuideMode,
  snapshot: NotificationReceiveSnapshot,
): Promise<NotificationGuideChoice> {
  return new Promise((resolve) => {
    pending = { mode, snapshot, resolve };
    bump();
  });
}

export function settleNotificationGuideModal(choice: NotificationGuideChoice): void {
  if (!pending) return;
  const r = pending.resolve;
  pending = null;
  r(choice);
  bump();
}
