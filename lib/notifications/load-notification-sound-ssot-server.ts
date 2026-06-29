import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildRegistrySnapshot,
  hydrateNotificationSoundSnapshotFromRows,
} from "@/lib/notifications/notification-sound-resolver";
import type {
  NotificationSoundAssetRow,
  NotificationSoundEventRow,
  NotificationSoundMappingRow,
} from "@/lib/notifications/notification-sound-types";

export async function loadNotificationSoundSsotFromDb(
  sb: SupabaseClient
): Promise<{ assets: NotificationSoundAssetRow[]; events: NotificationSoundEventRow[]; mappings: NotificationSoundMappingRow[] }> {
  const [assetsRes, eventsRes, mappingsRes] = await Promise.all([
    sb.from("notification_sound_assets").select("*"),
    sb.from("notification_sound_events").select("*"),
    sb.from("notification_sound_mappings").select("*"),
  ]);

  const tableMissing =
    assetsRes.error?.message?.includes("does not exist") ||
    eventsRes.error?.message?.includes("does not exist");

  if (tableMissing) {
    const fallback = buildRegistrySnapshot();
    return {
      assets: [...fallback.assets.values()],
      events: [...fallback.events.values()],
      mappings: [...fallback.mappings.values()],
    };
  }

  if (assetsRes.error) throw assetsRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (mappingsRes.error) throw mappingsRes.error;

  const assets = (assetsRes.data ?? []) as NotificationSoundAssetRow[];
  const events = (eventsRes.data ?? []) as NotificationSoundEventRow[];
  const mappings = (mappingsRes.data ?? []) as NotificationSoundMappingRow[];

  await hydrateNotificationSoundSnapshotFromRows({ assets, events, mappings });

  return { assets, events, mappings };
}
