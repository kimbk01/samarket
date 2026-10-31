import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildRegistrySnapshot,
  hydrateNotificationSoundSnapshotFromRows,
} from "@/lib/notifications/notification-sound-resolver";
import { NOTIFICATION_SOUND_EVENTS } from "@/lib/notifications/notification-sound-registry";
import type {
  NotificationSoundAssetRow,
  NotificationSoundEventRow,
  NotificationSoundMappingRow,
} from "@/lib/notifications/notification-sound-types";

export type NotificationSoundSsotMergedPayload = {
  assets: NotificationSoundAssetRow[];
  events: NotificationSoundEventRow[];
  mappings: NotificationSoundMappingRow[];
};

function defaultMappingForEvent(ev: NotificationSoundEventRow): NotificationSoundMappingRow {
  return {
    event_key: ev.event_key,
    asset_id: ev.default_asset_id,
    use_device_default: false,
    volume: 0.7,
    repeat_count: 1,
    cooldown_seconds: 0,
    vibration_enabled: null,
    priority: null,
    enabled: ev.enabled,
  };
}

export function mergeNotificationSoundSsotForAdmin(rows: {
  assets?: NotificationSoundAssetRow[];
  events?: NotificationSoundEventRow[];
  mappings?: NotificationSoundMappingRow[];
}): NotificationSoundSsotMergedPayload {
  const base = buildRegistrySnapshot();

  for (const a of rows.assets ?? []) base.assets.set(a.id, a);
  for (const e of rows.events ?? []) base.events.set(e.event_key, e);
  for (const m of rows.mappings ?? []) base.mappings.set(m.event_key, m);

  for (const ev of NOTIFICATION_SOUND_EVENTS) {
    if (!base.events.has(ev.event_key)) {
      base.events.set(ev.event_key, { ...ev });
    }
    if (!base.mappings.has(ev.event_key)) {
      base.mappings.set(ev.event_key, defaultMappingForEvent(ev));
    }
  }

  const events = NOTIFICATION_SOUND_EVENTS.map((ev) => {
    const row = base.events.get(ev.event_key);
    return row ? { ...row } : { ...ev };
  });

  const mappings = NOTIFICATION_SOUND_EVENTS.map((ev) => {
    const row = base.mappings.get(ev.event_key);
    return row ? { ...row } : defaultMappingForEvent(ev);
  });

  return {
    assets: [...base.assets.values()],
    events,
    mappings,
  };
}

export async function loadNotificationSoundSsotFromDb(
  sb: SupabaseClient
): Promise<NotificationSoundSsotMergedPayload> {
  const [assetsRes, eventsRes, mappingsRes] = await Promise.all([
    sb.from("notification_sound_assets").select("*"),
    sb.from("notification_sound_events").select("*"),
    sb.from("notification_sound_mappings").select("*"),
  ]);

  const errors = [assetsRes.error, eventsRes.error, mappingsRes.error].filter(Boolean);
  const tableMissing = errors.some(
    (err) =>
      err?.code === "PGRST205" ||
      err?.message?.includes("does not exist") ||
      err?.message?.includes("schema cache")
  );

  if (tableMissing || errors.length >= 2) {
    return mergeNotificationSoundSsotForAdmin({});
  }

  if (errors.length === 1 && (assetsRes.data ?? eventsRes.data ?? mappingsRes.data)) {
    return mergeNotificationSoundSsotForAdmin({
      assets: assetsRes.data?.length ? ((assetsRes.data ?? []) as NotificationSoundAssetRow[]) : undefined,
      events: eventsRes.data?.length ? ((eventsRes.data ?? []) as NotificationSoundEventRow[]) : undefined,
      mappings: mappingsRes.data?.length
        ? ((mappingsRes.data ?? []) as NotificationSoundMappingRow[])
        : undefined,
    });
  }

  if (assetsRes.error) throw assetsRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (mappingsRes.error) throw mappingsRes.error;

  const merged = mergeNotificationSoundSsotForAdmin({
    assets: (assetsRes.data ?? []) as NotificationSoundAssetRow[],
    events: (eventsRes.data ?? []) as NotificationSoundEventRow[],
    mappings: (mappingsRes.data ?? []) as NotificationSoundMappingRow[],
  });

  await hydrateNotificationSoundSnapshotFromRows(merged);

  return merged;
}

/**
 * 순서 5 E7 (docs/audit/supabase-request-fanout-full-root-cause-2026-11-01.md §12): 앱 읽기 경로용 서버 기억 60초.
 * 소리 설정은 관리자 저장 때만 바뀐다 — 저장·업로드 라우트가 `invalidateNotificationSoundSsotReadCache()` 로 즉시 지운다
 * (같은 인스턴스, 다른 인스턴스는 최대 60초). 관리자 편집 화면은 기억 없이 `loadNotificationSoundSsotFromDb`.
 */
const SSOT_READ_CACHE_TTL_MS = 60_000;
let ssotReadCache: { value: NotificationSoundSsotMergedPayload; at: number } | null = null;
let ssotReadFlight: Promise<NotificationSoundSsotMergedPayload> | null = null;

export function invalidateNotificationSoundSsotReadCache(): void {
  ssotReadCache = null;
  ssotReadFlight = null;
}

export async function loadNotificationSoundSsotCached(
  sb: SupabaseClient
): Promise<NotificationSoundSsotMergedPayload> {
  const hit = ssotReadCache;
  if (hit && Date.now() - hit.at < SSOT_READ_CACHE_TTL_MS) {
    // resolver 스냅샷이 따로 지워졌을 수 있어 같은 행으로 다시 적용 (메모리만, DB 0)
    await hydrateNotificationSoundSnapshotFromRows(hit.value);
    return hit.value;
  }
  if (ssotReadFlight) return ssotReadFlight;
  const flight = loadNotificationSoundSsotFromDb(sb)
    .then((value) => {
      if (ssotReadFlight === flight) ssotReadCache = { value, at: Date.now() };
      return value;
    })
    .finally(() => {
      if (ssotReadFlight === flight) ssotReadFlight = null;
    });
  ssotReadFlight = flight;
  return flight;
}
