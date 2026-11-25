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
import { bumpBootstrapSnapshotInvalidationMany } from "@/lib/community-messenger/bootstrap-snapshot-invalidation";
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
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  markChatPushHandoffFastPathSent,
  markChatPushHandoffFastPathSentMany,
} from "@/lib/notifications/chat-notification-push-handoff";
import { runWithConcurrencyLimit } from "@/lib/shared/run-with-concurrency-limit";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

/** 2026-11-21 보내기 3단계 — 받는 사람 동시 발송 상한(FCM·APNs 순간 부하 제한) */
export const CHAT_PUSH_DISPATCH_CONCURRENCY = 8;

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
  /** P2: 전송 RPC 반환 `domain_identity`(마이그레이션 적용 뒤) — 텍스트 방 bump 가 rooms 재조회 없이 쓴다 */
  domainIdentity?: string | null;
  directKey?: string | null;
  hasMention?: boolean;
  /** T0 Legacy write Decision Snapshots — pass-through to Engine shadow only. */
  decisionSnapshotsByRecipientId?: Record<string, NotificationDecision>;
  /**
   * F3(2026-11-25) 사진·동영상 보내기 — 글과 같은 알림 경로를 쓰되 예전 사진·동영상 알림과 같게:
   * 미리보기 문구는 `previewText`(사진·동영상 문구), 멘션 없음, 엔진 그림자 없음(예전 경로에 없던 것).
   */
  mediaSend?: { previewText: string } | null;
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
  /**
   * `deferAutoRead` 옵션일 때만 채움 — 같은 방 전면이라 자동 읽음 대상인 수신자.
   * 호출부(텍스트 route)가 배지 target bump 완료 뒤 `markRoomRead` 실행(I5).
   */
  autoReadRecipientIds: string[];
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
    /** 2026-11-21 보내기 2단계 — 사본은 즉시 재생성 대신 「바뀜 표시」(보내는 사람+받는 사람 전원 DB 1번) */
    invalidateOwnerHubBadgeCache(id, { source: "messenger", lazySnapshot: true });
    invalidateHomeSyncSnapshotCache(id, { lazySnapshot: true });
    invalidateCmBootstrapSnapshotCache(id, { deferWatermark: true });
    invalidateFullBootstrapSnapshotCache(id, "peer_hub_invalidate", { deferWatermark: true });
  }
  /** 2026-11-21 보내기 2단계 — 워터마크는 보내는 사람+받는 사람 전원 DB 1번(실패하면 사람별 기존 경로) */
  bumpBootstrapSnapshotInvalidationMany(dedupeIds([senderUserId, ...recipientUserIds]));
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
  t5?: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace,
  /**
   * P2 opt-in (텍스트 route 만): 알림 파이프라인 수신자 병렬 처리 + 자동 읽음 지연.
   * 기본값(미지정)은 기존 동작 그대로.
   */
  pipelineOpts?: { parallelRecipients?: boolean; deferAutoRead?: boolean; blockClearedPeerUserId?: string | null }
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
  const mediaSend = effects.mediaSend ?? null;
  let mentionUserIds: string[] = [];
  if (roomKind === "group" && messageId && !mediaSend) {
    mentionUserIds = await resolveMentionUserIdsForGroupRoom(sb, roomId, content).catch(() => []);
    if (mentionUserIds.length) {
      await persistMessageMentionUserIds(sb, messageId, mentionUserIds).catch(() => {});
    }
  }

  let decisionSnapshotsByRecipientId: Record<string, NotificationDecision> = {};
  let deferredPushes: CommunityMessengerSendDeferredPostAckWork["deferredPushes"] = [];
  let autoReadRecipientIds: string[] = [];
  if (messageId) {
    const notifyT0 = performance.now();
    const pipelineResult = await notifyMessagePipeline(
      sb,
      {
        roomId,
        messageId,
        senderUserId,
        preview: mediaSend ? mediaSend.previewText : cmMessagePreviewFallback(content),
        recipientUserIds,
        directKey: effects.directKey,
        hasMention: mediaSend ? false : (effects.hasMention ?? /@\S/.test(content)),
        roomKind,
        mentionUserIds,
      },
      {
        deferPush: true,
        _t5: t5,
        parallelRecipients: pipelineOpts?.parallelRecipients === true,
        deferAutoRead: pipelineOpts?.deferAutoRead === true,
        blockClearedPeerUserId: pipelineOpts?.blockClearedPeerUserId ?? null,
      }
    ).catch(() => null);
    /** 병렬 모드 파이프라인은 수신자 실패를 throw 하지 않고 부분 결과를 돌려준다(위 catch 는 공통 읽기 실패 등만) */
    if (t5) {
      const { markT5, spanT5 } = await import("@/lib/community-messenger/monitoring/t5-send-stage-trace");
      spanT5(t5, "S16_notify_durable_ms", notifyT0);
      markT5(t5, "S16");
    }
    decisionSnapshotsByRecipientId = pipelineResult?.decisionSnapshotsByRecipientId ?? {};
    deferredPushes = pipelineResult?.deferredPushes ?? [];
    autoReadRecipientIds = pipelineResult?.autoReadRecipientIds ?? [];
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
    autoReadRecipientIds,
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
  /**
   * 2026-11-21 보내기 3단계 — 받는 사람 전원의 발송 전 사실(알림 행·안전 확인·설정·대상)을 한 번에 읽고,
   * 받는 사람끼리 동시에(상한 8) 보낸 뒤 인계 완료를 묶음 1번으로 닫는다.
   * 미리 읽기를 못 하면(null) 지금처럼 한 명씩 차례로.
   * 설계·통화 영향: docs/audit/supabase-request-surge-2026-11-18/message-send-fanout-stage3-push-design-2026-11-21.md
   */
  const { loadChatPushFactsBatch } = await import("@/lib/push/dispatch/chat-push-facts-batch");
  const svcForFacts = tryCreateSupabaseServiceClient();
  const factsByEventId = svcForFacts
    ? await loadChatPushFactsBatch(
        svcForFacts as SupabaseClient<any>,
        deferred.deferredPushes.filter((p) => p.row.type !== "missed_call").map((p) => p.row)
      ).catch(() => null)
    : null;
  if (factsByEventId) {
    const handedOff: string[] = [];
    await runWithConcurrencyLimit(deferred.deferredPushes, CHAT_PUSH_DISPATCH_CONCURRENCY, async (item) => {
      const preloadedChatFacts = item.row.type !== "missed_call" ? factsByEventId.get(item.row.id) : undefined;
      const outcome = await dispatchNotificationEvent(sb, item.row, {
        appState: item.appState,
        ...(preloadedChatFacts ? { preloadedChatFacts } : {}),
      }).catch(() => "retryable" as const);
      if (outcome === "sent" || outcome === "noop") handedOff.push(item.row.id);
    });
    await markChatPushHandoffFastPathSentMany(sb as unknown as SupabaseClient, handedOff).catch(() => {});
  } else {
    for (const item of deferred.deferredPushes) {
      // NEW-24/NOTI-08: fast-path 전송. 성공(sent/noop)이면 handoff 를 닫아 cron 재전송 대상에서 제외.
      // 실패(retryable/permanent)면 pending 유지 → grace 후 1분 cron 이 복구한다.
      const outcome = await dispatchNotificationEvent(sb, item.row, { appState: item.appState }).catch(
        () => "retryable" as const
      );
      if (outcome === "sent" || outcome === "noop") {
        await markChatPushHandoffFastPathSent(sb as unknown as SupabaseClient, item.row.id).catch(() => {});
      }
    }
  }
  if (t5) {
    const { spanT5 } = await import("@/lib/community-messenger/monitoring/t5-send-stage-trace");
    spanT5(t5, "S16_push_dispatch_ms", pushT0);
  }

  /** F3: 사진·동영상은 예전 경로에 엔진 그림자가 없었다 — 그대로 둔다 */
  if (effects.mediaSend) return;
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
