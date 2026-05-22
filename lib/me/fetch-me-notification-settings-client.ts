"use client";

/**
 * 사용자 알림 설정 GET — 메신저 홈 등에서 마운트 직후 겹치는 요청을 단일 비행으로 합친다.
 * @see docs/trade-lightweight-design.md — 중복 요청 완화.
 */
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

export const ME_NOTIFICATION_SETTINGS_GET_FLIGHT = "me:notification-settings:get";
const ME_NOTIFICATION_SETTINGS_SNAPSHOT_FLIGHT = "me:notification-settings:snapshot";
const ME_NOTIFICATION_SETTINGS_SNAPSHOT_TTL_MS = 20_000;
const ME_NOTIFICATION_SETTINGS_SESSION_KEY = "sam:me:notification-settings:v1";

export type MeNotificationSettingsSnapshot = {
  ok: boolean;
  status: number;
  table_missing: boolean;
  settings: Partial<{
    service_enabled: boolean;
    trade_chat_enabled: boolean;
    community_chat_enabled: boolean;
    order_enabled: boolean;
    store_enabled: boolean;
    trade_events_enabled: boolean;
    community_social_enabled: boolean;
    notice_enabled: boolean;
    marketing_enabled: boolean;
    sound_enabled: boolean;
    vibration_enabled: boolean;
    quiet_hours_enabled: boolean;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
  }> | null;
};

let cachedSnapshot:
  | {
      expiresAt: number;
      value: MeNotificationSettingsSnapshot;
    }
  | null = null;

function readNotificationSettingsSessionCache(): MeNotificationSettingsSnapshot | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ME_NOTIFICATION_SETTINGS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MeNotificationSettingsSnapshot;
    if (typeof parsed?.status !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeNotificationSettingsSessionCache(value: MeNotificationSettingsSnapshot): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(ME_NOTIFICATION_SETTINGS_SESSION_KEY, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

function cloneSnapshot(value: MeNotificationSettingsSnapshot): MeNotificationSettingsSnapshot {
  return {
    ok: value.ok,
    status: value.status,
    table_missing: value.table_missing,
    settings: value.settings ? { ...value.settings } : null,
  };
}

export function fetchMeNotificationSettingsGet(): Promise<Response> {
  return runSingleFlight(ME_NOTIFICATION_SETTINGS_GET_FLIGHT, () =>
    fetch("/api/me/notification-settings", { credentials: "include" })
  );
}

export async function fetchMeNotificationSettingsSnapshot(
  opts?: { force?: boolean }
): Promise<MeNotificationSettingsSnapshot | null> {
  if (opts?.force) {
    cachedSnapshot = null;
    forgetSingleFlight(ME_NOTIFICATION_SETTINGS_SNAPSHOT_FLIGHT);
    if (typeof sessionStorage !== "undefined") {
      try {
        sessionStorage.removeItem(ME_NOTIFICATION_SETTINGS_SESSION_KEY);
      } catch {
        /* ignore */
      }
    }
  }
  const sessionHit = !opts?.force ? readNotificationSettingsSessionCache() : null;
  if (sessionHit) {
    return cloneSnapshot(sessionHit);
  }
  const now = Date.now();
  if (cachedSnapshot && cachedSnapshot.expiresAt > now) {
    return cloneSnapshot(cachedSnapshot.value);
  }
  try {
    const snapshot = await runSingleFlight(ME_NOTIFICATION_SETTINGS_SNAPSHOT_FLIGHT, async () => {
      const res = await fetch("/api/me/notification-settings", { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        table_missing?: boolean;
        settings?: MeNotificationSettingsSnapshot["settings"];
      };
      const value: MeNotificationSettingsSnapshot = {
        ok: Boolean(res.ok && json?.ok),
        status: res.status,
        table_missing: json?.table_missing === true,
        settings:
          json?.settings && typeof json.settings === "object"
            ? { ...json.settings }
            : null,
      };
      cachedSnapshot = {
        value,
        expiresAt: Date.now() + ME_NOTIFICATION_SETTINGS_SNAPSHOT_TTL_MS,
      };
      writeNotificationSettingsSessionCache(value);
      return value;
    });
    return cloneSnapshot(snapshot);
  } catch {
    return null;
  }
}

/** PATCH 성공 후 다음 GET 이 캐시된 in-flight 와 합쳐지지 않도록 비운다. */
export function invalidateMeNotificationSettingsGetFlight(): void {
  forgetSingleFlight(ME_NOTIFICATION_SETTINGS_GET_FLIGHT);
  forgetSingleFlight(ME_NOTIFICATION_SETTINGS_SNAPSHOT_FLIGHT);
  cachedSnapshot = null;
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(ME_NOTIFICATION_SETTINGS_SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
}
