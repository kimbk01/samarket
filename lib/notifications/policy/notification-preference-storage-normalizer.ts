/**
 * P2-A4 — Pure storage normalization: DB rows → P2-A3 snapshot input.
 *
 * No Supabase, no auth, no policy/event resolution.
 * Precedence mirrors current production consumers (web-push gate, settings APIs).
 */

import {
  DEFAULT_NORMALIZED_ADMIN_OPS_PREFERENCES,
  DEFAULT_NORMALIZED_OWNER_PREFERENCES,
  type NormalizedAdminOpsPreferenceSnapshot,
  type NormalizedMemberPreferenceSnapshot,
  type NormalizedNotificationPreferenceSnapshot,
  type NormalizedOwnerPreferenceSnapshot,
  type NormalizedQuietPreference,
} from "@/lib/notifications/policy/notification-preference-normalized-snapshot";

/** Canonical row shape — `user_notification_settings` notification columns. */
export type NotificationSettingsStorageRow = Readonly<{
  service_enabled?: boolean | null;
  trade_chat_enabled?: boolean | null;
  community_chat_enabled?: boolean | null;
  order_enabled?: boolean | null;
  store_enabled?: boolean | null;
  trade_events_enabled?: boolean | null;
  community_social_enabled?: boolean | null;
  notice_enabled?: boolean | null;
  marketing_enabled?: boolean | null;
  sound_enabled?: boolean | null;
  vibration_enabled?: boolean | null;
  quiet_hours_enabled?: boolean | null;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
}>;

/** Legacy push/DND row shape — `user_settings` notification columns. */
export type LegacyUserSettingsPushRow = Readonly<{
  push_enabled?: boolean | null;
  chat_push_enabled?: boolean | null;
  marketing_push_enabled?: boolean | null;
  do_not_disturb_enabled?: boolean | null;
  do_not_disturb_start?: string | null;
  do_not_disturb_end?: string | null;
}>;

/** P2-A6 — `owner_notification_settings` account-level optional prefs. */
export type OwnerNotificationSettingsStorageRow = Readonly<{
  optional_push_enabled?: boolean | null;
  optional_sound_enabled?: boolean | null;
  quiet_hours_enabled?: boolean | null;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
}>;

/** P2-A6 — `admin_notification_preferences` per-admin Ops sound (not asset config). */
export type AdminNotificationPreferenceStorageRow = Readonly<{
  sound_enabled?: boolean | null;
}>;

export type NormalizeNotificationPreferenceStorageInput = Readonly<{
  notificationSettingsRow?: NotificationSettingsStorageRow | null;
  legacyUserSettingsRow?: LegacyUserSettingsPushRow | null;
  ownerSettingsRow?: OwnerNotificationSettingsStorageRow | null;
  adminOpsPreferenceRow?: AdminNotificationPreferenceStorageRow | null;
  now: Date;
  timezone?: string;
}>;

/** Mirrors `/api/me/notification-settings` DEFAULTS. */
export const NOTIFICATION_SETTINGS_STORAGE_DEFAULTS = {
  service_enabled: true,
  trade_chat_enabled: true,
  community_chat_enabled: true,
  order_enabled: true,
  store_enabled: true,
  trade_events_enabled: true,
  community_social_enabled: true,
  notice_enabled: true,
  marketing_enabled: false,
  sound_enabled: true,
  vibration_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: null as string | null,
  quiet_hours_end: null as string | null,
} as const;

/** Mirrors `DEFAULT_USER_SETTINGS` notification fields. */
export const LEGACY_USER_SETTINGS_PUSH_DEFAULTS = {
  push_enabled: true,
  chat_push_enabled: true,
  marketing_push_enabled: false,
  do_not_disturb_enabled: false,
  do_not_disturb_start: null as string | null,
  do_not_disturb_end: null as string | null,
} as const;

function coerceOptimisticBool(value: boolean | null | undefined, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  return value !== false;
}

function coerceStrictOptIn(value: boolean | null | undefined, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  return value === true;
}

function trimTime(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseNotificationQuietTimeMinutes(s: string | null | undefined): number | null {
  if (!s || typeof s !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

export function minutesAtInNotificationTimezone(d: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

/** Same window semantics as `web-push-user-settings-gate.inQuietWindow`. */
export function isInNotificationQuietWindow(
  now: Date,
  startMin: number | null,
  endMin: number | null,
  timeZone: string
): boolean {
  if (startMin == null || endMin == null) return false;
  const cur = minutesAtInNotificationTimezone(now, timeZone);
  if (startMin === endMin) return false;
  if (startMin < endMin) {
    return cur >= startMin && cur < endMin;
  }
  return cur >= startMin || cur < endMin;
}

function resolveQuietPreference(
  notificationRow: NotificationSettingsStorageRow | null | undefined,
  legacyRow: LegacyUserSettingsPushRow | null | undefined,
  now: Date,
  timeZone: string
): NormalizedQuietPreference {
  const quietHoursEnabled =
    notificationRow != null
      ? notificationRow.quiet_hours_enabled === true
      : NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.quiet_hours_enabled;
  const dndEnabled =
    legacyRow != null
      ? legacyRow.do_not_disturb_enabled === true
      : LEGACY_USER_SETTINGS_PUSH_DEFAULTS.do_not_disturb_enabled;

  const quietStart =
    notificationRow != null
      ? trimTime(notificationRow.quiet_hours_start)
      : NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.quiet_hours_start;
  const quietEnd =
    notificationRow != null
      ? trimTime(notificationRow.quiet_hours_end)
      : NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.quiet_hours_end;
  const dndStart =
    legacyRow != null
      ? trimTime(legacyRow.do_not_disturb_start)
      : LEGACY_USER_SETTINGS_PUSH_DEFAULTS.do_not_disturb_start;
  const dndEnd =
    legacyRow != null
      ? trimTime(legacyRow.do_not_disturb_end)
      : LEGACY_USER_SETTINGS_PUSH_DEFAULTS.do_not_disturb_end;

  const quietActive =
    quietHoursEnabled &&
    isInNotificationQuietWindow(
      now,
      parseNotificationQuietTimeMinutes(quietStart),
      parseNotificationQuietTimeMinutes(quietEnd),
      timeZone
    );
  const dndActive =
    dndEnabled &&
    isInNotificationQuietWindow(
      now,
      parseNotificationQuietTimeMinutes(dndStart),
      parseNotificationQuietTimeMinutes(dndEnd),
      timeZone
    );

  return {
    enabled: quietHoursEnabled || dndEnabled,
    activeNow: quietActive || dndActive,
  };
}

function resolveMemberSnapshot(
  notificationRow: NotificationSettingsStorageRow | null | undefined,
  legacyRow: LegacyUserSettingsPushRow | null | undefined,
  now: Date,
  timeZone: string
): NormalizedMemberPreferenceSnapshot {
  const hasNotificationRow = notificationRow != null;
  const hasLegacyRow = legacyRow != null;

  const pushEnabled = hasLegacyRow
    ? coerceOptimisticBool(legacyRow.push_enabled, LEGACY_USER_SETTINGS_PUSH_DEFAULTS.push_enabled)
    : LEGACY_USER_SETTINGS_PUSH_DEFAULTS.push_enabled;

  const serviceEnabled = hasNotificationRow
    ? coerceOptimisticBool(notificationRow.service_enabled, NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.service_enabled)
    : NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.service_enabled;

  const chatPushEnabled = hasLegacyRow
    ? coerceOptimisticBool(
        legacyRow.chat_push_enabled,
        LEGACY_USER_SETTINGS_PUSH_DEFAULTS.chat_push_enabled
      )
    : LEGACY_USER_SETTINGS_PUSH_DEFAULTS.chat_push_enabled;

  const marketingPushEnabled = hasLegacyRow
    ? coerceStrictOptIn(
        legacyRow.marketing_push_enabled,
        LEGACY_USER_SETTINGS_PUSH_DEFAULTS.marketing_push_enabled
      )
    : LEGACY_USER_SETTINGS_PUSH_DEFAULTS.marketing_push_enabled;

  const marketingEnabled = hasNotificationRow
    ? notificationRow.marketing_enabled === undefined
      ? NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.marketing_enabled
      : notificationRow.marketing_enabled === true
    : NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.marketing_enabled;

  return {
    pushEnabled,
    serviceEnabled,
    chatPushEnabled,
    soundEnabled: hasNotificationRow
      ? coerceOptimisticBool(notificationRow.sound_enabled, NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.sound_enabled)
      : NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.sound_enabled,
    vibrationEnabled: hasNotificationRow
      ? coerceOptimisticBool(
          notificationRow.vibration_enabled,
          NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.vibration_enabled
        )
      : NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.vibration_enabled,
    tradeChatEnabled: hasNotificationRow
      ? coerceOptimisticBool(
          notificationRow.trade_chat_enabled,
          NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.trade_chat_enabled
        )
      : NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.trade_chat_enabled,
    communityChatEnabled: hasNotificationRow
      ? coerceOptimisticBool(
          notificationRow.community_chat_enabled,
          NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.community_chat_enabled
        )
      : NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.community_chat_enabled,
    orderEnabled: hasNotificationRow
      ? coerceOptimisticBool(notificationRow.order_enabled, NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.order_enabled)
      : NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.order_enabled,
    storeEnabled: hasNotificationRow
      ? coerceOptimisticBool(notificationRow.store_enabled, NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.store_enabled)
      : NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.store_enabled,
    tradeEventsEnabled: hasNotificationRow
      ? coerceOptimisticBool(
          notificationRow.trade_events_enabled,
          NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.trade_events_enabled
        )
      : NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.trade_events_enabled,
    communitySocialEnabled: hasNotificationRow
      ? coerceOptimisticBool(
          notificationRow.community_social_enabled,
          NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.community_social_enabled
        )
      : NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.community_social_enabled,
    noticeEnabled: hasNotificationRow
      ? coerceOptimisticBool(notificationRow.notice_enabled, NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.notice_enabled)
      : NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.notice_enabled,
    marketingEnabled,
    marketingPushEnabled,
    quiet: resolveQuietPreference(notificationRow, legacyRow, now, timeZone),
  };
}

function coerceTriStateBool(value: boolean | null | undefined): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  return value === true;
}

function resolveOwnerQuietPreference(
  ownerRow: OwnerNotificationSettingsStorageRow | null | undefined,
  now: Date,
  timeZone: string
): NormalizedQuietPreference {
  if (ownerRow == null) {
    return DEFAULT_NORMALIZED_OWNER_PREFERENCES.quiet ?? { enabled: false, activeNow: false };
  }
  const quietHoursEnabled = ownerRow.quiet_hours_enabled === true;
  const quietStart = trimTime(ownerRow.quiet_hours_start);
  const quietEnd = trimTime(ownerRow.quiet_hours_end);
  const activeNow =
    quietHoursEnabled &&
    isInNotificationQuietWindow(
      now,
      parseNotificationQuietTimeMinutes(quietStart),
      parseNotificationQuietTimeMinutes(quietEnd),
      timeZone
    );
  return { enabled: quietHoursEnabled, activeNow };
}

/**
 * Owner optional prefs — no row / null columns → undefined (P2-A3 optimistic fallback).
 * Never derive Owner from Member `order_enabled` / `store_enabled`.
 */
export function resolveOwnerSnapshot(
  ownerRow: OwnerNotificationSettingsStorageRow | null | undefined,
  now: Date,
  timeZone: string
): NormalizedOwnerPreferenceSnapshot {
  if (ownerRow == null) {
    return {
      optionalPushEnabled: DEFAULT_NORMALIZED_OWNER_PREFERENCES.optionalPushEnabled,
      optionalSoundEnabled: DEFAULT_NORMALIZED_OWNER_PREFERENCES.optionalSoundEnabled,
      vibrationEnabled: DEFAULT_NORMALIZED_OWNER_PREFERENCES.vibrationEnabled,
      quiet: DEFAULT_NORMALIZED_OWNER_PREFERENCES.quiet,
    };
  }
  return {
    optionalPushEnabled: coerceTriStateBool(ownerRow.optional_push_enabled),
    optionalSoundEnabled: coerceTriStateBool(ownerRow.optional_sound_enabled),
    vibrationEnabled: DEFAULT_NORMALIZED_OWNER_PREFERENCES.vibrationEnabled,
    quiet: resolveOwnerQuietPreference(ownerRow, now, timeZone),
  };
}

/**
 * Admin Ops sound — no row / null → undefined (P2-A3 T15: compat default enabled at resolver).
 * Never read `admin_notification_settings` asset rows here.
 */
export function resolveAdminOpsSnapshot(
  adminRow: AdminNotificationPreferenceStorageRow | null | undefined
): NormalizedAdminOpsPreferenceSnapshot {
  if (adminRow == null) {
    return {
      soundEnabled: DEFAULT_NORMALIZED_ADMIN_OPS_PREFERENCES.soundEnabled,
    };
  }
  return {
    soundEnabled: coerceTriStateBool(adminRow.sound_enabled),
  };
}

/**
 * Pure storage → normalized snapshot.
 *
 * Precedence locks:
 * - Push master: legacy `push_enabled` + canonical `service_enabled` (AND at resolver; both stored separately).
 * - Marketing: strict opt-in on both `marketing_enabled` and `marketing_push_enabled`.
 * - Quiet/DND: OR active window (`web-push-user-settings-gate` truth).
 * - Owner optional / admin ops: dedicated P2-A6 rows; absent → P2-A3 compat undefined.
 */
export function normalizeNotificationPreferenceStorage(
  input: NormalizeNotificationPreferenceStorageInput
): NormalizedNotificationPreferenceSnapshot {
  const timeZone =
    input.timezone?.trim() ||
    (typeof process !== "undefined" ? process.env.NOTIFICATION_QUIET_TZ?.trim() : undefined) ||
    "Asia/Manila";

  return {
    member: resolveMemberSnapshot(
      input.notificationSettingsRow,
      input.legacyUserSettingsRow,
      input.now,
      timeZone
    ),
    owner: resolveOwnerSnapshot(input.ownerSettingsRow, input.now, timeZone),
    adminOps: resolveAdminOpsSnapshot(input.adminOpsPreferenceRow),
  };
}
