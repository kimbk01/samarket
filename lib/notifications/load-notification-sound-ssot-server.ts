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
