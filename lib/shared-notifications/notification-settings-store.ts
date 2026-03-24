import type { NotificationPreferences, NotificationRole } from "./types";

function defaultsFor(role: NotificationRole): Omit<NotificationPreferences, "user_id"> {
  return {
    role,
    allow_new_order: true,
    allow_order_status: true,
    allow_cancel: true,
    allow_refund: true,
    allow_settlement: true,
    allow_admin_notice: true,
    allow_marketing: true,
  };
}

function full(role: NotificationRole, userId: string): NotificationPreferences {
  return { user_id: userId, ...defaultsFor(role) };
}

/** user_id -> preferences (역할별 시뮬 계정) */
const map = new Map<string, NotificationPreferences>();

let version = 0;
const listeners = new Set<() => void>();

export function subscribeNotificationSettings(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getNotificationSettingsVersion() {
  return version;
}

function bump() {
  version++;
  listeners.forEach((l) => l());
}

function key(role: NotificationRole, userId: string) {
  return `${role}:${userId}`;
}

export function getNotificationPreferences(role: NotificationRole, userId: string): NotificationPreferences {
  const k = key(role, userId);
  const cur = map.get(k);
  if (cur) return { ...cur };
  return full(role, userId);
}

export function updateNotificationPreferences(
  role: NotificationRole,
  userId: string,
  partial: Partial<Omit<NotificationPreferences, "role" | "user_id">>
): void {
  const k = key(role, userId);
  const prev = map.get(k) ?? full(role, userId);
  map.set(k, { ...prev, ...partial });
  bump();
}

export function isNotificationAllowed(
  role: NotificationRole,
  userId: string,
  pref: keyof Pick<
    NotificationPreferences,
    | "allow_new_order"
    | "allow_order_status"
    | "allow_cancel"
    | "allow_refund"
    | "allow_settlement"
    | "allow_admin_notice"
    | "allow_marketing"
  >
): boolean {
  return getNotificationPreferences(role, userId)[pref] !== false;
}

/** 주문 시뮬 초기화 시 설정도 기본값으로 (선택) */
export function resetNotificationSettingsToDefaults(): void {
  map.clear();
  bump();
}

/** 시드: 데모 오너·관리자 키를 미리 넣지 않음 — get 시 기본 true */
