/**
 * 알림 항목 어드민 설정 (푸시·종 표시) — 서버 전용.
 * notification-admin-item-ssot-audit-2026-11-02 §3-3·§3-4 (Owner 설계 승인 2026-11-02).
 *
 * - 항목 정의·기본값 = `notification-item-registry.ts`. 표 `notification_item_settings` 에는 어드민이 바꾼 값만 있다.
 * - 알림 생성마다 읽으므로 인스턴스 메모리에 짧게 캐시한다(어드민 저장 시 그 인스턴스는 즉시 비움, 다른 인스턴스는 TTL 안에 반영).
 * - 읽기 실패 시 기본값(= 지금 동작)으로 진행한다 — 설정 조회 실패로 알림이 사라지면 안 된다.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getNotificationItem,
  type NotificationItemDefinition,
} from "@/lib/notifications/notification-item-registry";

export const NOTIFICATION_ITEM_SETTINGS_TABLE = "notification_item_settings";

export type NotificationItemSettingRow = {
  item_key: string;
  push_enabled: boolean;
  inbox_enabled: boolean;
  revision: number;
  updated_at: string;
  updated_by: string | null;
};

const CACHE_TTL_MS = 30_000;
let cache: { at: number; rows: Map<string, NotificationItemSettingRow> } | null = null;

export function invalidateNotificationItemSettingsCache(): void {
  cache = null;
}

export async function loadNotificationItemSettingRows(
  sb: SupabaseClient
): Promise<NotificationItemSettingRow[]> {
  const { data, error } = await sb
    .from(NOTIFICATION_ITEM_SETTINGS_TABLE)
    .select("item_key, push_enabled, inbox_enabled, revision, updated_at, updated_by");
  if (error) throw new Error(`notification_item_settings_load_failed:${error.message}`);
  return (data ?? []) as NotificationItemSettingRow[];
}

async function settingsMap(sb: SupabaseClient): Promise<Map<string, NotificationItemSettingRow>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = await loadNotificationItemSettingRows(sb);
  cache = { at: now, rows: new Map(rows.map((r) => [r.item_key, r])) };
  return cache.rows;
}

export type NotificationItemEffectiveSetting = Readonly<{
  pushEnabled: boolean;
  inboxEnabled: boolean;
}>;

/** 잠긴 값(통화·채팅 행·캠페인)은 표 값과 상관없이 기본값 그대로. */
export function effectiveNotificationItemSetting(
  item: NotificationItemDefinition,
  row: Pick<NotificationItemSettingRow, "push_enabled" | "inbox_enabled"> | undefined
): NotificationItemEffectiveSetting {
  return {
    pushEnabled: item.pushLock ? true : row ? row.push_enabled : true,
    inboxEnabled: item.inboxLock ? true : row ? row.inbox_enabled : true,
  };
}

/**
 * 알림 생성 시 판정. 잠긴 항목은 DB 를 읽지 않는다(통화·채팅 경로는 조회조차 하지 않음).
 * 조회 실패 = 기본값(켜짐).
 */
export async function resolveNotificationItemGate(
  sb: SupabaseClient,
  itemKey: string
): Promise<NotificationItemEffectiveSetting> {
  const item = getNotificationItem(itemKey);
  if (!item || (item.pushLock && item.inboxLock)) return { pushEnabled: true, inboxEnabled: true };
  try {
    const rows = await settingsMap(sb);
    return effectiveNotificationItemSetting(item, rows.get(itemKey));
  } catch (err) {
    console.error("[notification-item] settings_read_failed", {
      itemKey,
      error: err instanceof Error ? err.message : String(err),
    });
    return { pushEnabled: true, inboxEnabled: true };
  }
}
