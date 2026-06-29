/**
 * SSOT admin commit → legacy table mirror (preserve existing APIs).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationSoundMappingRow } from "@/lib/notifications/notification-sound-types";
import {
  getRegistryAsset,
  getRegistryEvent,
} from "@/lib/notifications/notification-sound-registry";

export type LegacyMirrorPatch = {
  event_key: string;
  asset_id: string;
  enabled?: boolean;
};

const EVENT_TO_LEGACY_ADMIN_DOMAIN: Record<string, string> = {
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

const EVENT_TO_CALL_COLUMN: Record<string, string> = {
  call_incoming_voice: "voice_incoming_sound_url",
  call_incoming_video: "video_incoming_sound_url",
  call_outgoing_voice: "voice_outgoing_ringback_url",
  call_outgoing_video: "video_outgoing_ringback_url",
  call_missed: "missed_notification_sound_url",
  call_ended: "call_end_sound_url",
  call_rejected: "call_end_sound_url",
};

const EVENT_TO_ADMIN_SETTINGS_KEY: Record<string, string> = {
  delivery_order_created_owner: "store_delivery_alert_sound",
  delivery_order_cancelled_owner: "store_delivery_alert_sound",
  delivery_order_delayed_owner: "store_delivery_alert_sound",
  delivery_order_sold_out_owner: "store_delivery_alert_sound",
  delivery_order_match_chat: "order_match_chat_alert_sound",
};

function resolveMirrorUrl(assetId: string, fileUrl?: string | null): string | null {
  const fromArg = typeof fileUrl === "string" ? fileUrl.trim() || null : null;
  if (fromArg) return fromArg;
  const asset = getRegistryAsset(assetId);
  return (asset?.file_url && asset.file_url.trim()) || (asset?.file_path && asset.file_path.trim()) || null;
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
      resolveMirrorUrl(
        p.asset_id,
        (assetRow as { file_url?: string | null } | null)?.file_url ?? null
      ) ??
      (typeof (assetRow as { file_path?: string | null } | null)?.file_path === "string"
        ? (assetRow as { file_path: string }).file_path
        : null);

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
    await sb.from("admin_notification_settings").upsert(
      {
        type,
        sound_url: url,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "type" }
    );
  }

  if (Object.keys(callPatch).length > 0) {
    await sb
      .from("admin_messenger_call_sound_settings")
      .update({ ...callPatch, updated_at: new Date().toISOString() })
      .eq("id", "default");
  }

  for (const [key, url] of settingsPatch) {
    await sb.from("admin_settings").upsert(
      {
        key,
        value_json: url ? { url } : { url: null },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
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
