import { isNotificationAllowed } from "./notification-settings-store";
import type { NotificationRole, OrderNotificationDraft, SharedNotification } from "./types";

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

let notifications: SharedNotification[] = [];
let version = 0;
const listeners = new Set<() => void>();

export function subscribeSharedNotifications(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSharedNotificationsVersion() {
  return version;
}

function bump() {
  version++;
  listeners.forEach((l) => l());
}

function newId() {
  return `nt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function appendOrderNotificationDrafts(drafts: OrderNotificationDraft[]): void {
  let added = false;
  for (const d of drafts) {
    if (!isNotificationAllowed(d.role, d.target_user_id, d.preference)) continue;
    notifications.push({
      id: newId(),
      role: d.role,
      target_user_id: d.target_user_id,
      target_store_id: d.target_store_id,
      linked_order_id: d.linked_order_id,
      type: d.type,
      title: d.title,
      message: d.message,
      is_read: false,
      created_at: nowIso(),
      priority: d.priority ?? "normal",
    });
    added = true;
  }
  if (added) bump();
}

export function listSharedNotifications(): SharedNotification[] {
  return notifications.map(clone);
}

export function listNotificationsForTarget(
  role: NotificationRole,
  userId: string,
  opts?: { storeId?: string; orderLinkedOnly?: boolean; unreadOnly?: boolean }
): SharedNotification[] {
  return notifications
    .filter((n) => {
      if (n.role !== role || n.target_user_id !== userId) return false;
      if (opts?.storeId && n.target_store_id && n.target_store_id !== opts.storeId) return false;
      if (opts?.unreadOnly && n.is_read) return false;
      if (opts?.orderLinkedOnly && !n.linked_order_id) return false;
      return true;
    })
    .map(clone)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function countUnreadForTarget(
  role: NotificationRole,
  userId: string,
  storeId?: string
): number {
  return notifications.filter(
    (n) =>
      n.role === role &&
      n.target_user_id === userId &&
      !n.is_read &&
      (!storeId || !n.target_store_id || n.target_store_id === storeId)
  ).length;
}

export function countUnreadByTypes(
  role: NotificationRole,
  userId: string,
  types: SharedNotification["type"][],
  storeId?: string
): number {
  return notifications.filter(
    (n) =>
      n.role === role &&
      n.target_user_id === userId &&
      !n.is_read &&
      types.includes(n.type) &&
      (!storeId || !n.target_store_id || n.target_store_id === storeId)
  ).length;
}

export function markNotificationRead(id: string): void {
  const n = notifications.find((x) => x.id === id);
  if (!n || n.is_read) return;
  n.is_read = true;
  bump();
}

export function markAllNotificationsReadForTarget(
  role: NotificationRole,
  userId: string,
  storeId?: string
): void {
  let changed = false;
  for (const n of notifications) {
    if (n.role !== role || n.target_user_id !== userId || n.is_read) continue;
    if (storeId && n.target_store_id && n.target_store_id !== storeId) continue;
    n.is_read = true;
    changed = true;
  }
  if (changed) bump();
}

export function resetSharedNotifications(): void {
  notifications = [];
  bump();
}
