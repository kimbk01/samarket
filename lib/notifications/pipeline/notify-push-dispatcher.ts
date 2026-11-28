import { isAdminRecipientNotificationType } from "@/lib/admin/notifications/admin-notification-kinds";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { shouldSkipPushForEventDedupe } from "@/lib/notifications/core/notification-dedupe";
import { logNotifyMessage } from "@/lib/notifications/core/notification-logs";
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";
import { getNotificationEventDefinition } from "@/lib/notifications/core/notification-event-registry";
import { resolveNotificationDestination } from "@/lib/notifications/resolve-notification-destination";
import { defaultInboxFallbackHref } from "@/lib/notifications/resolve-notification-inbox-href";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { fetchDomainBadgeAuthorityPayload } from "@/lib/notifications/pipeline/notify-badge-service";
import { resolveMemberAppIconTotalForNativeFcm } from "@/lib/notifications/badge-authority-rebuild/native-fcm-member-app-icon-authority";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
import type { DispatchPushOutcome } from "@/lib/push/dispatch/push-payload-types";
import { getSiteOrigin } from "@/lib/env/runtime";
import { ensureNotificationSoundSsotHydratedForServer } from "@/lib/notifications/notification-sound-ssot-server-hydrate";
import { resolveNotificationSoundForEvent } from "@/lib/notifications/notification-sound-resolver";
import { resolveNotificationSoundEventKeyFromRow } from "@/lib/notifications/notification-sound-event-key-from-row";
import { resolveNotificationEventKind } from "@/lib/notifications/core/notification-event-kind";
import { renderNotificationCopyFromMeta } from "@/lib/notifications/notification-stored-copy";
import { buildLocalizedPushAlert } from "@/lib/push/dispatch/localized-push-alert";
import type { LocalizedPushAlert } from "@/lib/push/dispatch/push-payload-types";

function absolutizeLink(link: string): string | null {
  const base = getSiteOrigin();
  if (!base) return null;
  return link.startsWith("/") ? `${base}${link}` : `${base}/${link}`;
}

/** Exported for SRV-02 table tests (payload → preference gate). */
export function buildPushPayload(row: NotificationEventRow, badgeCount: number): NotificationSideEffectPayloadOut {
  const roomId = row.room_id ?? "";
  const display =
    row.display_payload && typeof row.display_payload === "object"
      ? (row.display_payload as Record<string, unknown>)
      : null;
  const routeFromDisplay =
    display && typeof display.routeUrl === "string" ? String(display.routeUrl).trim() : "";
  const definition = getNotificationEventDefinition(row.type);
  const dest = resolveNotificationDestination({
    resolverKey: definition.deepLinkResolverKey,
    notificationId: row.id,
    roomId,
    callSessionId: row.call_session_id,
    displayRoute: routeFromDisplay,
    fallbackHref: defaultInboxFallbackHref(),
  });
  // C2: 목적지는 저장 시 `display_payload.routeUrl` 로 확정됐다(notification-event-final-route) — 그대로 쓴다.
  const link_url = dest.href;
  const legacyMeta =
    display?.legacyMeta && typeof display.legacyMeta === "object"
      ? (display.legacyMeta as Record<string, unknown>)
      : null;
  const legacyKind =
    typeof legacyMeta?.kind === "string" ? String(legacyMeta.kind).trim() : "";
  // SRV-02 — store_order_message writers put receiverRole on display (owner | user).
  const receiverRoleRaw = display?.receiverRole ?? legacyMeta?.receiverRole;
  const receiverRole = typeof receiverRoleRaw === "string" && receiverRoleRaw.trim() ? receiverRoleRaw.trim() : null;
  // D-6 (재감사 P-7): 푸시 소리 키 = 인앱과 같은 resolver(kind·수신 역할 기준). type 기본값만 쓰면 오너 신규
  // 주문·지연 리마인더가 「고객 주문 상태」 채널·소리로 울렸다. kind 가 없으면 기존 type 기본값.
  const soundKind = resolveNotificationEventKind(display);
  const eventKey =
    resolveNotificationSoundEventKeyFromRow({
      event_type: row.type,
      // 알림 항목 SSOT — 캠페인·미리보기 종류로만 구분되는 항목(시스템 안내·사장님 플랫폼 문의 답변 등)
      campaign_type: typeof display?.campaignType === "string" ? display.campaignType : null,
      preview_kind: typeof display?.previewKind === "string" ? display.previewKind : null,
      meta: {
        ...(legacyMeta ?? {}),
        ...(soundKind ? { kind: soundKind } : {}),
        ...(receiverRole ? { receiverRole } : {}),
      },
    }) ??
    definition.soundEventKey ??
    "system_default";
  const soundResolved = resolveNotificationSoundForEvent(eventKey, { platform: "android" });
  const communityPushType =
    row.type === "community_activity" ||
    legacyKind === "community_comment" ||
    legacyKind === "community_like"
      ? "community_comment"
      : null;
  return {
    user_id: row.user_id,
    notification_type:
      row.type === "missed_call"
        ? "community_messenger_missed_call"
        : row.type === "admin_marketing_banner"
          ? "marketing"
          : communityPushType
            ? communityPushType
            : row.type.startsWith("support_")
              ? "notification"
              : row.type === "admin_notice" ||
                  row.type === "trade_status" ||
                  row.type === "order_status" ||
                  row.type === "delivery_status" ||
                  row.type === "admin_test"
                ? "system"
                : "chat",
    title: row.title,
    body: row.body,
    link_url,
    link_url_absolute: absolutizeLink(link_url),
    occurred_at: row.created_at,
    meta: {
      // Phase 3 A4 / SRV-02 — every push carries its canonical event type (and receiver role) so the
      // preference gate resolves the registry row (e.g. trade_message → trade_chat,
      // community_activity → community_social, trade_status → trade_events) instead of the
      // collapsed notification_type (system/chat) or safe_fallback (order).
      event_type: row.type,
      ...(receiverRole ? { receiverRole } : {}),
      kind: legacyKind || (communityPushType ? "community_comment" : row.type),
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
      ...(legacyMeta?.post_id != null ? { post_id: legacyMeta.post_id, postId: legacyMeta.post_id } : {}),
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

/**
 * 2026-11-27 언어 사후 검토 C3 — 알림 행 meta(`display_payload.legacyMeta`)에 `titleKey`·`messageKey` 가 있으면
 * ko·en 글자를 다시 만들어 발송부가 기기 앱 언어로 고르게 한다(조회 추가 없음). 키가 없거나 그릴 수 없는 자리는
 * 저장된 `row.title`/`row.body` 그대로. 둘 다 그릴 수 없으면 null(지금과 같은 발송).
 */
export function buildNotificationLocalizedPushAlert(row: NotificationEventRow): LocalizedPushAlert | null {
  const display =
    row.display_payload && typeof row.display_payload === "object"
      ? (row.display_payload as Record<string, unknown>)
      : null;
  const meta =
    display?.legacyMeta && typeof display.legacyMeta === "object"
      ? (display.legacyMeta as Record<string, unknown>)
      : null;
  if (!meta || (meta.titleKey == null && meta.messageKey == null)) return null;
  let rendered = false;
  const alert = buildLocalizedPushAlert((lang) => {
    const title = renderNotificationCopyFromMeta(lang, meta, "title");
    const body = renderNotificationCopyFromMeta(lang, meta, "body");
    if (title || body) rendered = true;
    return { title: title ?? row.title, body: body ?? row.body ?? "" };
  });
  return rendered ? alert : null;
}

export async function dispatchNotificationPushIfAllowed(
  sb: SupabaseClient<any>,
  row: NotificationEventRow,
  opts?: {
    callPushKind?: "missed_call";
    /** 2026-11-21 보내기 3단계 — 채팅 보내기 묶음 경로만(부재중 통화 분기에는 넘기지 않음) */
    preloadedChatFacts?: import("@/lib/push/dispatch/push-payload-types").PreloadedChatPushFacts;
  }
): Promise<DispatchPushOutcome> {
  // R13: admin-recipient work notices are pushed only by the admin notification service
  // (authority re-verified at send time). A legacy/queued member-store row never pushes.
  if (isAdminRecipientNotificationType(row.type)) {
    logNotifyMessage("push_dispatch_done", {
      userId: row.user_id,
      eventId: row.id,
      skipped: "admin_recipient_type",
    });
    return "noop";
  }
  if (row.push_suppressed_reason) {
    logNotifyMessage("push_dispatch_done", {
      userId: row.user_id,
      eventId: row.id,
      skipped: row.push_suppressed_reason,
    });
    return "noop";
  }
  if (shouldSkipPushForEventDedupe(row.id)) {
    logNotifyMessage("push_dispatch_done", { userId: row.user_id, eventId: row.id, skipped: "dedupe" });
    return "noop";
  }

  logNotifyMessage("push_dispatch_start", { userId: row.user_id, eventId: row.id });
  await ensureNotificationSoundSsotHydratedForServer(sb);
  /**
   * 2026-11-22 보내기 3b — 채팅 보내기 묶음 경로가 같은 식(`computeMemberAppIconFromFacts`)으로 미리 계산한 숫자가 있으면 그대로.
   * 부재중 통화·그 밖의 발송은 넘기지 않음 → 아래 기존 계산.
   */
  const preloadedBadge =
    opts?.callPushKind !== "missed_call" && typeof opts?.preloadedChatFacts?.badgeTotal === "number"
      ? opts.preloadedChatFacts.badgeTotal
      : null;
  // Slice 2-6 — FCM badge_count = MemberAppIconTotal absolute (A+B_member). Never compute; never B_store/C_store.
  const memberAppIconTotal =
    preloadedBadge ??
    (await (async () => {
      const domain = await fetchDomainBadgeAuthorityPayload(sb, row.user_id, { force: true });
      return resolveMemberAppIconTotalForNativeFcm({
        memberAppIconWebTotal: domain.memberAppIconWebTotal,
        appIconTotal: domain.projection?.appIconTotal,
      });
    })());
  const out = buildPushPayload(row, memberAppIconTotal);
  const localizedAlert = buildNotificationLocalizedPushAlert(row);

  let dispatchResult;
  if (opts?.callPushKind === "missed_call") {
    dispatchResult = await dispatchPushForUser(out, {
      event_type: row.type,
      target_type: "call_session",
      target_id: row.call_session_id ?? undefined,
      call_push_kind: "missed_call",
      badge_count: memberAppIconTotal,
      notification_event_id: row.id,
    });
  } else {
    dispatchResult = await dispatchPushForUser(out, {
      event_type: row.type,
      badge_count: memberAppIconTotal,
      notification_event_id: row.id,
      ...(opts?.preloadedChatFacts ? { preloaded_chat_facts: opts.preloadedChatFacts } : {}),
      ...(localizedAlert ? { localized_alert: localizedAlert } : {}),
    });
  }

  logNotifyMessage("push_dispatch_done", {
    userId: row.user_id,
    eventId: row.id,
    badgeCount: memberAppIconTotal,
  });
  // NOTI-05: 실제 전달 결과를 호출자(commerce handoff 등)로 전달한다.
  return dispatchResult.outcome ?? "noop";
}

export type { NotificationEventType };
