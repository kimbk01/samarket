/**
 * SSOT admin commit → legacy table mirror (preserve existing APIs).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NotificationSoundAssetRow,
  NotificationSoundMappingRow,
} from "@/lib/notifications/notification-sound-types";
import {
  getRegistryAsset,
  getRegistryEvent,
} from "@/lib/notifications/notification-sound-registry";

export type LegacyMirrorPatch = {
  event_key: string;
  asset_id: string;
  enabled?: boolean;
};

export const EVENT_TO_LEGACY_ADMIN_DOMAIN: Record<string, string> = {
  messenger_direct_message_received: "community_direct_chat",
  friend_request_received: "community_direct_chat",
  friend_request_accepted: "community_direct_chat",
  messenger_group_message_received: "community_group_chat",
  trade_chat_message_received: "trade_chat",
  trade_offer_received: "trade_chat",
  trade_reserved: "trade_chat",
  trade_completed: "trade_chat",
  delivery_order_status_changed_user: "order",
  delivery_chat_message_received_user: "store",
  delivery_chat_message_received_owner: "store",
  settlement_balance_low: "store",
  settlement_charge_approved: "store",
  settlement_charge_rejected: "store",
};

export const EVENT_TO_CALL_COLUMN: Record<string, string> = {
  call_incoming_voice: "voice_incoming_sound_url",
  call_incoming_video: "video_incoming_sound_url",
  call_outgoing_voice: "voice_outgoing_ringback_url",
  call_outgoing_video: "video_outgoing_ringback_url",
  call_missed: "missed_notification_sound_url",
  call_ended: "call_end_sound_url",
  call_rejected: "call_end_sound_url",
};

export const EVENT_TO_ADMIN_SETTINGS_KEY: Record<string, string> = {
  delivery_order_created_owner: "store_delivery_alert_sound",
  delivery_order_cancelled_owner: "store_delivery_alert_sound",
  delivery_order_delayed_owner: "store_delivery_alert_sound",
  delivery_order_sold_out_owner: "store_delivery_alert_sound",
  delivery_order_match_chat: "order_match_chat_alert_sound",
};

export function isLegacyKvMirrorEvent(eventKey: string): boolean {
  return eventKey in EVENT_TO_ADMIN_SETTINGS_KEY;
}

export function resolveMirrorUrlForValidation(
  assetId: string,
  assetRow?: Pick<NotificationSoundAssetRow, "file_url" | "file_path"> | null
): string | null {
  const fromRow =
    typeof assetRow?.file_url === "string" && assetRow.file_url.trim()
      ? assetRow.file_url.trim()
      : null;
  if (fromRow) return fromRow;
  const fromPath =
    typeof assetRow?.file_path === "string" && assetRow.file_path.trim()
      ? assetRow.file_path.trim()
      : null;
  if (fromPath) return fromPath;
  const asset = getRegistryAsset(assetId);
  return (
    (asset?.file_url && asset.file_url.trim()) ||
    (asset?.file_path && asset.file_path.trim()) ||
    null
  );
}

function throwMirrorError(table: string, message: string): never {
  throw new Error(`legacy_mirror_failed:${table}:${message}`);
}

export async function mirrorNotificationSoundToLegacy(
  sb: SupabaseClient,
  patches: LegacyMirrorPatch[]
): Promise<void> {
  const domainUrls = new Map<string, { url: string | null; enabled: boolean }>();
  const callPatch: Record<string, string | null> = {};
  const settingsPatch = new Map<string, string | null>();

  for (const p of patches) {
    const { data: assetRow } = await sb
      .from("notification_sound_assets")
      .select("file_url, file_path")
      .eq("id", p.asset_id)
      .maybeSingle();
    const url =
      resolveMirrorUrlForValidation(
        p.asset_id,
        assetRow as Pick<NotificationSoundAssetRow, "file_url" | "file_path"> | null
      ) ?? null;

    const enabled = p.enabled !== false;
    const legacyDomain = EVENT_TO_LEGACY_ADMIN_DOMAIN[p.event_key];
    if (legacyDomain) {
      domainUrls.set(legacyDomain, { url, enabled });
    }

    const callCol = EVENT_TO_CALL_COLUMN[p.event_key];
    if (callCol) {
      callPatch[callCol] = url;
    }

    const settingsKey = EVENT_TO_ADMIN_SETTINGS_KEY[p.event_key];
    if (settingsKey) {
      settingsPatch.set(settingsKey, url);
    }
  }

  for (const [type, { url, enabled }] of domainUrls) {
    const { error } = await sb.from("admin_notification_settings").upsert(
      {
        type,
        sound_url: url,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "type" }
    );
    if (error) throwMirrorError("admin_notification_settings", error.message);
  }

  if (Object.keys(callPatch).length > 0) {
    const { error } = await sb
      .from("admin_messenger_call_sound_settings")
      .update({ ...callPatch, updated_at: new Date().toISOString() })
      .eq("id", "default");
    if (error) throwMirrorError("admin_messenger_call_sound_settings", error.message);
  }

  for (const [key, url] of settingsPatch) {
    const { error } = await sb.from("admin_settings").upsert(
      {
        key,
        value_json: url ? { url } : { url: null },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    if (error) throwMirrorError("admin_settings", error.message);
  }
}

export function mappingPatchFromEventKey(
  eventKey: string,
  assetId: string,
  partial?: Partial<NotificationSoundMappingRow>
): LegacyMirrorPatch {
  const ev = getRegistryEvent(eventKey);
  return {
    event_key: eventKey,
    asset_id: assetId,
    enabled: partial?.enabled ?? ev?.enabled ?? true,
  };
}
