import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { shouldSkipPushForEventDedupe } from "@/lib/notifications/core/notification-dedupe";
import { logNotifyMessage } from "@/lib/notifications/core/notification-logs";
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";
import { getNotificationEventDefinition } from "@/lib/notifications/core/notification-event-registry";
import { resolveNotificationDeepLink } from "@/lib/notifications/policy/notification-deeplink-policy";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { fetchDomainBadgeAuthorityPayload } from "@/lib/notifications/pipeline/notify-badge-service";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
import { getSiteOrigin } from "@/lib/env/runtime";
import { ensureNotificationSoundSsotHydratedForServer } from "@/lib/notifications/notification-sound-ssot-server-hydrate";
import { resolveNotificationSoundForEvent } from "@/lib/notifications/notification-sound-resolver";

function absolutizeLink(link: string): string | null {
  const base = getSiteOrigin();
  if (!base) return null;
  return link.startsWith("/") ? `${base}${link}` : `${base}/${link}`;
}

function buildPushPayload(row: NotificationEventRow, badgeCount: number): NotificationSideEffectPayloadOut {
  const roomId = row.room_id ?? "";
  const display =
    row.display_payload && typeof row.display_payload === "object"
      ? (row.display_payload as Record<string, unknown>)
      : null;
  const routeFromDisplay =
    display && typeof display.routeUrl === "string" ? String(display.routeUrl).trim() : "";
  const definition = getNotificationEventDefinition(row.type);
  const link_url = resolveNotificationDeepLink(definition.deepLinkResolverKey, {
    roomId,
    callSessionId: row.call_session_id,
    displayRoute: routeFromDisplay,
  });
  const eventKey = definition.soundEventKey ?? "system_default";
  const soundResolved = resolveNotificationSoundForEvent(eventKey, { platform: "android" });
  return {
    user_id: row.user_id,
    notification_type:
      row.type === "missed_call"
        ? "community_messenger_missed_call"
        : row.type === "admin_marketing_banner"
          ? "marketing"
          : row.type === "admin_notice"
            ? "system"
            : "chat",
    title: row.title,
    body: row.body,
    link_url,
    link_url_absolute: absolutizeLink(link_url),
    occurred_at: row.created_at,
    meta: {
      kind: row.type,
      category: row.category,
      room_id: roomId,
      notification_event_id: row.id,
      notification_id: row.id,
      message_id: row.message_id,
      session_id: row.call_session_id,
      badge_count: badgeCount,
      sender_id: row.actor_user_id,
      sender_name: display?.senderName,
      sender_avatar_url: display?.senderAvatarUrl,
      room_name: display?.roomName,
      room_kind: display?.roomKind,
      preview_kind: display?.previewKind,
      context_label: display?.contextLabel,
      campaign_id: display?.campaignId,
      display_payload: display,
      event_key: eventKey,
      deeplink_resolver_key: definition.deepLinkResolverKey,
      sound_asset_id: soundResolved.assetId,
      android_channel_id: soundResolved.androidChannelId,
      ios_sound_name: soundResolved.iosSoundName,
      ...(typeof display?.chatDomain === "string" && display.chatDomain
        ? {
            chat_domain: display.chatDomain,
            chatDomain: display.chatDomain,
          }
        : {}),
      ...(typeof display?.domainIdentityKey === "string" && display.domainIdentityKey
        ? {
            domain_identity_key: display.domainIdentityKey,
            domainIdentityKey: display.domainIdentityKey,
          }
        : {}),
    },
  };
}

export async function dispatchNotificationPushIfAllowed(
  sb: SupabaseClient<any>,
  row: NotificationEventRow,
  opts?: { callPushKind?: "missed_call" }
): Promise<void> {
  if (row.push_suppressed_reason) {
    logNotifyMessage("push_dispatch_done", {
      userId: row.user_id,
      eventId: row.id,
      skipped: row.push_suppressed_reason,
    });
    return;
  }
  if (shouldSkipPushForEventDedupe(row.id)) {
    logNotifyMessage("push_dispatch_done", { userId: row.user_id, eventId: row.id, skipped: "dedupe" });
    return;
  }

  logNotifyMessage("push_dispatch_start", { userId: row.user_id, eventId: row.id });
  await ensureNotificationSoundSsotHydratedForServer(sb);
  const domain = await fetchDomainBadgeAuthorityPayload(sb, row.user_id, { force: true });
  const appIconTotal = Math.max(0, Math.floor(Number(domain.projection?.appIconTotal) || 0));
  const out = buildPushPayload(row, appIconTotal);

  if (opts?.callPushKind === "missed_call") {
    await dispatchPushForUser(out, {
      event_type: row.type,
      target_type: "call_session",
      target_id: row.call_session_id ?? undefined,
      call_push_kind: "missed_call",
      badge_count: appIconTotal,
      notification_event_id: row.id,
    });
  } else {
    await dispatchPushForUser(out, {
      event_type: row.type,
      badge_count: appIconTotal,
      notification_event_id: row.id,
    });
  }

  logNotifyMessage("push_dispatch_done", {
    userId: row.user_id,
    eventId: row.id,
    badgeCount: appIconTotal,
  });
}

export type { NotificationEventType };
