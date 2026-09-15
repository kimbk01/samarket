/**
 * CM send side-effects after canonical message commit.
 *
 * Historical:
 * - MP-AUDIT-14 (`2f8aaf12`): moved notify+mirror into route `after()` for ACK latency.
 * - `44e7073fe`: Production `after()` often never persisted `notification_events`
 *   (~2026-07-22), so FCM never fired — notify was moved back before ACK.
 *
 * Current contract (T5 repair):
 * - PRE_ACK: durable `notification_events` accept (+ badge invalidate) — preserves 44e7073fe.
 * - POST_ACK (`after()`): item_trade ledger mirror + FCM/OS push dispatch + room-bump.
 * - Canonical message + unread remain in atomic RPC before this module runs.
 */
import { invalidateCmBootstrapSnapshotCache } from "@/lib/community-messenger/cm-bootstrap-snapshot-cache";
import { invalidateFullBootstrapSnapshotCache } from "@/lib/community-messenger/full-bootstrap-snapshot-cache";
import { invalidateHomeSyncSnapshotCache } from "@/lib/community-messenger/home-sync-snapshot-cache";
import { invalidateRoomBootstrapSnapshotCache } from "@/lib/community-messenger/room-bootstrap-snapshot-cache";
import { resolveNotificationMessageRoomKind } from "@/lib/community-messenger/group/group-room-notification-policy";
import {
  persistMessageMentionUserIds,
  resolveMentionUserIdsForGroupRoom,
} from "@/lib/community-messenger/group/group-room-mention-service";
import type { CommunityMessengerRoomType } from "@/lib/community-messenger/types";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { mirrorCommunityMessengerTextToItemTradeLedger } from "@/lib/trade/mirror-community-messenger-text-to-item-trade-ledger";
import { cmMessagePreviewFallback } from "@/lib/community-messenger/cm-service-copy";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { NotificationDecision } from "@/lib/notifications/engine/notification-decision";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { notifyMessagePipeline } from "@/lib/notifications/pipeline/notify-message-pipeline";
import { dispatchNotificationEvent } from "@/lib/notifications/pipeline/notification-event-dispatcher";

type SupabaseLike = ReturnType<typeof getSupabaseServer>;

export type CommunityMessengerSendPostAckEffects = {
  roomId: string;
  senderUserId: string;
  content: string;
  recipientUserIds: string[];
  createdAt: string;
  itemTradeLedgerId: string | null;
  messageId: string;
  /** Stored SSOT — primary notify classification key when present. */
  chatDomain?: string | null;
  roomType?: CommunityMessengerRoomType | string | null;
  directKey?: string | null;
  hasMention?: boolean;
  /** T0 Legacy write Decision Snapshots — pass-through to Engine shadow only. */
  decisionSnapshotsByRecipientId?: Record<string, NotificationDecision>;
};

export type CommunityMessengerSendDeferredPostAckWork = {
  effects: CommunityMessengerSendPostAckEffects;
  deferredPushes: Array<{
    row: NotificationEventRow;
    appState: import("@/lib/notifications/policy/notification-policy-profiles").NotificationRuntimeAppState;
  }>;
  decisionSnapshotsByRecipientId: Record<string, NotificationDecision>;
  chatDomain: string;
  roomType: string;
  directKey: string | null;
};

function dedupeIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function invalidateOwnerHubBadgeForCommunityMessengerPeers(
  senderUserId: string,
  recipientUserIds: string[],
  roomId?: string
): void {
  for (const id of dedupeIds([senderUserId, ...recipientUserIds])) {
    invalidateOwnerHubBadgeCache(id);
    invalidateHomeSyncSnapshotCache(id);
    invalidateCmBootstrapSnapshotCache(id);
    invalidateFullBootstrapSnapshotCache(id, "peer_hub_invalidate");
  }
  const rid = roomId?.trim() ?? "";
  if (rid) {
    invalidateRoomBootstrapSnapshotCache(rid, dedupeIds([senderUserId, ...recipientUserIds]));
  }
}

async function resolveRoomNotifyFields(
  sb: SupabaseLike,
  effects: CommunityMessengerSendPostAckEffects
): Promise<{ chatDomain: string; roomType: string; directKey: string | null }> {
  const roomId = effects.roomId.trim();
  let chatDomain = typeof effects.chatDomain === "string" ? effects.chatDomain.trim() : "";
  let roomType = typeof effects.roomType === "string" ? effects.roomType.trim() : "";
  let directKey = effects.directKey ?? null;
  if ((!chatDomain || !roomType) && roomId) {
    const { data: roomRow } = await (sb as any)
      .from("community_messenger_rooms")
      .select("chat_domain, room_type, direct_key")
      .eq("id", roomId)
      .maybeSingle();
    if (!chatDomain) {
      chatDomain =
        typeof roomRow?.chat_domain === "string" ? String(roomRow.chat_domain).trim() : "";
    }
    if (!roomType) {
      roomType = typeof roomRow?.room_type === "string" ? String(roomRow.room_type).trim() : "";
    }
    if (directKey == null || String(directKey).trim() === "") {
      directKey =
        typeof roomRow?.direct_key === "string" ? String(roomRow.direct_key).trim() || null : null;
    }
  }
  return { chatDomain, roomType, directKey };
}

/**
 * PRE_ACK: durable notification_events accept only (no FCM await, no ledger mirror).
 */
export async function runCommunityMessengerSendDurablePreAckEffects(
  sb: SupabaseLike,
  effects: CommunityMessengerSendPostAckEffects,
  t5?: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace
): Promise<CommunityMessengerSendDeferredPostAckWork> {
  const roomId = effects.roomId.trim();
  const senderUserId = effects.senderUserId.trim();
  const messageId = effects.messageId.trim();
  const content = effects.content;
  const recipientUserIds = effects.recipientUserIds;
  const roomFieldsT0 = performance.now();
  const { chatDomain, roomType, directKey } = await resolveRoomNotifyFields(sb, effects);
  if (t5) {
    const { spanT5 } = await import("@/lib/community-messenger/monitoring/t5-send-stage-trace");
    spanT5(t5, "ND_room_fields_ms", roomFieldsT0);
  }
  // Notify classification authority = stored `chat_domain`
  const roomKind = resolveNotificationMessageRoomKind({
    chatDomain,
    roomType,
    directKey,
  });
  let mentionUserIds: string[] = [];
  if (roomKind === "group" && messageId) {
    mentionUserIds = await resolveMentionUserIdsForGroupRoom(sb, roomId, content).catch(() => []);
    if (mentionUserIds.length) {
      await persistMessageMentionUserIds(sb, messageId, mentionUserIds).catch(() => {});
    }
  }

  let decisionSnapshotsByRecipientId: Record<string, NotificationDecision> = {};
  let deferredPushes: CommunityMessengerSendDeferredPostAckWork["deferredPushes"] = [];
  if (messageId) {
    const notifyT0 = performance.now();
    const pipelineResult = await notifyMessagePipeline(
      sb,
      {
        roomId,
        messageId,
        senderUserId,
        preview: cmMessagePreviewFallback(content),
        recipientUserIds,
        directKey: effects.directKey,
        hasMention: effects.hasMention ?? /@\S/.test(content),
        roomKind,
        mentionUserIds,
      },
      { deferPush: true, _t5: t5 }
    ).catch(() => null);
    if (t5) {
      const { markT5, spanT5 } = await import("@/lib/community-messenger/monitoring/t5-send-stage-trace");
      spanT5(t5, "S16_notify_durable_ms", notifyT0);
      markT5(t5, "S16");
    }
    decisionSnapshotsByRecipientId = pipelineResult?.decisionSnapshotsByRecipientId ?? {};
    deferredPushes = pipelineResult?.deferredPushes ?? [];
  } else if (t5) {
    const { markT5 } = await import("@/lib/community-messenger/monitoring/t5-send-stage-trace");
    markT5(t5, "S16");
  }

  invalidateOwnerHubBadgeForCommunityMessengerPeers(senderUserId, recipientUserIds, roomId);

  return {
    effects,
    deferredPushes,
    decisionSnapshotsByRecipientId,
    chatDomain,
    roomType,
    directKey,
  };
}

/**
 * POST_ACK (`after()`): ledger mirror + deferred FCM/OS push + legacy engine shadow.
 */
export async function runCommunityMessengerSendDeferredPostAckEffects(
  sb: SupabaseLike,
  deferred: CommunityMessengerSendDeferredPostAckWork,
  t5?: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace
): Promise<void> {
  const effects = deferred.effects;
  if (effects.itemTradeLedgerId) {
    const mirrorT0 = performance.now();
    await mirrorCommunityMessengerTextToItemTradeLedger(sb, {
      itemTradeChatRoomId: effects.itemTradeLedgerId,
      senderUserId: effects.senderUserId.trim(),
      textContent: effects.content,
      createdAt: effects.createdAt,
    }).catch(() => {});
    if (t5) {
      const { markT5, spanT5 } = await import("@/lib/community-messenger/monitoring/t5-send-stage-trace");
      spanT5(t5, "S15_mirror_ms", mirrorT0);
      markT5(t5, "S15");
    }
  } else if (t5) {
    const { markT5 } = await import("@/lib/community-messenger/monitoring/t5-send-stage-trace");
    markT5(t5, "S15");
  }

  const pushT0 = performance.now();
  for (const item of deferred.deferredPushes) {
    await dispatchNotificationEvent(sb, item.row, { appState: item.appState }).catch(() => {});
  }
  if (t5) {
    const { spanT5 } = await import("@/lib/community-messenger/monitoring/t5-send-stage-trace");
    spanT5(t5, "S16_push_dispatch_ms", pushT0);
  }

  void import("@/lib/notifications/engine/adapters/legacy-message-created-adapter").then((mod) =>
    mod
      .runLegacyMessageCreatedNotificationEngineAdapter(sb, {
        ...effects,
        chatDomain: deferred.chatDomain || effects.chatDomain,
        roomType: deferred.roomType || effects.roomType,
        directKey: deferred.directKey,
        decisionSnapshotsByRecipientId: deferred.decisionSnapshotsByRecipientId,
      })
      .catch(() => {})
  );
}

/**
 * @deprecated Prefer durable pre-ACK + deferred post-ACK split.
 * Kept for callers that still await the full bundle (legacy sync path).
 */
export async function runCommunityMessengerSendPostAckEffects(
  sb: SupabaseLike,
  effects: CommunityMessengerSendPostAckEffects,
  t5?: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace
): Promise<void> {
  const deferred = await runCommunityMessengerSendDurablePreAckEffects(sb, effects, t5);
  await runCommunityMessengerSendDeferredPostAckEffects(sb, deferred, t5);
}
