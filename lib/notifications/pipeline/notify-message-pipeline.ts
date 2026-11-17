import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMentionDedupeKey,
  buildMessageDedupeKey,
  categoryForEventType,
  eventTypeForMessageRoomKind,
  resolveMessageEventTypeFromDirectKey,
} from "@/lib/notifications/core/notification-policy";
import { shouldNotifyMentionRecipient } from "@/lib/community-messenger/group/group-room-mention-policy";
import type { NotificationMessageRoomKind } from "@/lib/notifications/core/notification-event-types";
import { logNotifyMessage } from "@/lib/notifications/core/notification-logs";
import {
  buildRecipientMessageNotificationDisplay,
  loadMessageNotificationDisplaySharedContext,
} from "@/lib/notifications/display/load-message-notification-display-context";
import {
  createNotificationDecision,
  type NotificationDecision,
} from "@/lib/notifications/engine/notification-decision";
import { isNotificationBlockedForRecipient } from "@/lib/notifications/policy/notification-block-policy";
import { isRoomMutedForUser } from "@/lib/notifications/policy/notification-mute-policy";
import {
  loadRecipientPresenceSnapshot,
  resolveOsPushAppStateFromPresence,
  resolvePresenceSuppressDecision,
} from "@/lib/notifications/policy/notification-presence-policy";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { createAndDispatchNotificationEvent } from "@/lib/notifications/pipeline/notification-event-dispatcher";
import {
  isChatPushManagedEventType,
  markChatPushHandoffPending,
} from "@/lib/notifications/chat-notification-push-handoff";
import type { NotificationRuntimeAppState } from "@/lib/notifications/policy/notification-policy-profiles";
import { markRoomRead } from "@/lib/notifications/pipeline/notify-read-service";
import { isChatDomain } from "@/lib/chat-domain/realtime/domain-realtime-envelope";
import { generalDirectRoomIdentity, groupRoomIdentity } from "@/lib/chat-domain/room-identity";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { runWithConcurrencyLimit } from "@/lib/shared/run-with-concurrency-limit";

export type NotifyMessagePipelineInput = {
  roomId: string;
  messageId: string;
  senderUserId: string;
  preview: string;
  recipientUserIds: string[];
  roomKind?: NotificationMessageRoomKind;
  directKey?: string | null;
  hasMention?: boolean;
  mentionUserIds?: string[];
};

/** T0 Legacy write Decision Snapshot — recipientId → frozen decision. */
export type NotifyMessagePipelineResult = {
  decisionSnapshotsByRecipientId: Record<string, NotificationDecision>;
  /** Rows that need `dispatchNotificationEvent` when `deferPush` was set. */
  deferredPushes: Array<{ row: NotificationEventRow; appState: NotificationRuntimeAppState }>;
  /**
   * `deferAutoRead: true` 일 때만 채움 — 같은 방 전면(presence)이라 자동 읽음 대상인 수신자.
   * 호출부가 배지 target bump 완료 뒤 `markRoomRead` 를 실행해야 한다(I5).
   */
  autoReadRecipientIds: string[];
};

/** P2: `parallelRecipients` 일 때 수신자 동시 처리 상한 */
export const NOTIFY_MESSAGE_PIPELINE_RECIPIENT_CONCURRENCY = 8;

type StoreOrderReceiverRole = "owner" | "user";

function resolveEventType(input: NotifyMessagePipelineInput) {
  if (input.roomKind) return eventTypeForMessageRoomKind(input.roomKind);
  return resolveMessageEventTypeFromDirectKey(input.directKey);
}

function resolveMessageEventDomainPair(args: {
  roomId: string;
  roomKind?: NotificationMessageRoomKind | null;
  directKey?: string | null;
  chatDomain?: string | null;
  domainIdentityKey?: string | null;
  senderUserId: string;
  recipientUserId: string;
}): { chatDomain: string; domainIdentityKey: string } | null {
  const fromDisplayDomain = String(args.chatDomain ?? "").trim();
  const fromDisplayIdentity = String(args.domainIdentityKey ?? "").trim();
  if (isChatDomain(fromDisplayDomain) && fromDisplayIdentity) {
    return { chatDomain: fromDisplayDomain, domainIdentityKey: fromDisplayIdentity };
  }

  const kind = args.roomKind ?? "direct";
  if (kind === "group") {
    const id = groupRoomIdentity(args.roomId);
    return { chatDomain: id.domain, domainIdentityKey: id.identityKey };
  }
  if (kind === "direct" || !kind) {
    const direct = String(args.directKey ?? "").trim();
    const parts = direct.split(":").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      const id = generalDirectRoomIdentity(parts[0]!, parts[1]!);
      return { chatDomain: id.domain, domainIdentityKey: id.identityKey };
    }
    try {
      const id = generalDirectRoomIdentity(args.senderUserId, args.recipientUserId);
      return { chatDomain: id.domain, domainIdentityKey: id.identityKey };
    } catch {
      return null;
    }
  }
  // trade / store_order / trade_legacy: require room authority snapshot on display
  if (isChatDomain(fromDisplayDomain) && fromDisplayIdentity) {
    return { chatDomain: fromDisplayDomain, domainIdentityKey: fromDisplayIdentity };
  }
  return null;
}

function resolvePushSoundSuppressedReason(
  decision: NotificationDecision
): "same_room_foreground" | "muted_room" | null {
  if (decision.suppressReasons.includes("same_room_foreground")) return "same_room_foreground";
  if (decision.suppressReasons.includes("room_muted")) return "muted_room";
  return null;
}

async function loadStoreOrderReceiverRoleByUserId(
  sb: SupabaseClient<any>,
  roomId: string,
  recipientUserIds: string[]
): Promise<Map<string, StoreOrderReceiverRole>> {
  const recipients = [...new Set(recipientUserIds.map((id) => id.trim()).filter(Boolean))];
  if (!roomId || recipients.length === 0) return new Map();

  const { data, error } = await sb
    .from("community_messenger_participants")
    .select("user_id, role")
    .eq("room_id", roomId)
    .in("user_id", recipients);
  if (error || !data) return new Map();

  const out = new Map<string, StoreOrderReceiverRole>();
  for (const row of data as Array<{ user_id?: unknown; role?: unknown }>) {
    const userId = typeof row.user_id === "string" ? row.user_id.trim() : "";
    const role = typeof row.role === "string" ? row.role.trim() : "";
    if (!userId) continue;
    if (role === "owner") out.set(userId, "owner");
    else if (role === "member") out.set(userId, "user");
  }
  return out;
}

export async function notifyMessagePipeline(
  sb: SupabaseClient<any>,
  input: NotifyMessagePipelineInput,
  opts?: {
    /**
     * Persist notification_events before return; defer FCM/OS push to caller `after()`.
     * Default false preserves prior await-push behavior for non-CM-send callers.
     */
    deferPush?: boolean;
    /**
     * P2 opt-in (기본 false = 기존 순차 동작): 수신자별 읽기 판정(차단·음소거·presence·언어)을 동시에 읽고
     * 수신자끼리도 동시 처리(상한 8). 판정 입력은 모두 읽기라 결과는 순차와 같다.
     */
    parallelRecipients?: boolean;
    /**
     * P2 opt-in (기본 false): 자동 읽음(`auto_read_same_room`)의 `markRoomRead` 를 실행하지 않고
     * `autoReadRecipientIds` 로 돌려준다 — 호출부가 배지 target bump 완료 뒤 실행(I5).
     */
    deferAutoRead?: boolean;
    /** Opt-in T5 durable-path substages (`x-samarket-t5-trace`). */
    _t5?: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace;
  }
): Promise<NotifyMessagePipelineResult> {
  const decisionSnapshotsByRecipientId: Record<string, NotificationDecision> = {};
  const deferredPushes: Array<{ row: NotificationEventRow; appState: NotificationRuntimeAppState }> = [];
  const autoReadRecipientIds: string[] = [];
  const parallelRecipients = opts?.parallelRecipients === true;
  const deferAutoRead = opts?.deferAutoRead === true;
  const roomId = input.roomId.trim();
  const messageId = input.messageId.trim();
  const senderUserId = input.senderUserId.trim();
  const recipients = input.recipientUserIds.map((id) => id.trim()).filter(Boolean);
  if (!roomId || !messageId || !senderUserId || !recipients.length) {
    return { decisionSnapshotsByRecipientId, deferredPushes, autoReadRecipientIds };
  }
  const t5 = opts?._t5;
  let spanT5Fn:
    | ((
        trace: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace,
        name: string,
        startedAtWall: number
      ) => number)
    | null = null;
  let addSpanT5Fn:
    | ((
        trace: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace,
        name: string,
        startedAtWall: number
      ) => number)
    | null = null;
  if (t5) {
    const mod = await import("@/lib/community-messenger/monitoring/t5-send-stage-trace");
    spanT5Fn = mod.spanT5;
    addSpanT5Fn = mod.addSpanT5;
  }
  const setSpan = (name: string, startedAtWall: number) => {
    if (t5 && spanT5Fn) spanT5Fn(t5, name, startedAtWall);
  };
  const addSpan = (name: string, startedAtWall: number) => {
    if (t5 && addSpanT5Fn) addSpanT5Fn(t5, name, startedAtWall);
  };

  const baseEventType = resolveEventType(input);

  logNotifyMessage("create_start", { roomId, messageId, recipientCount: recipients.length });

  const receiverRoleByUserId =
    baseEventType === "store_order_message" || input.roomKind === "store_order"
      ? await loadStoreOrderReceiverRoleByUserId(sb, roomId, recipients)
      : new Map<string, StoreOrderReceiverRole>();

  const displaySharedT0 = performance.now();
  const displayShared = await loadMessageNotificationDisplaySharedContext(sb, {
    roomId,
    messageId,
    senderUserId,
    recipientUserIds: recipients,
    preview: input.preview,
    roomKind: input.roomKind,
    directKey: input.directKey,
  });
  setSpan("ND_display_shared_ms", displaySharedT0);

  const processRecipient = async (recipientUserId: string): Promise<void> => {
    if (!recipientUserId || recipientUserId === senderUserId) return;

    const isMentioned = shouldNotifyMentionRecipient({
      mentionUserIds: input.mentionUserIds ?? [],
      recipientUserId,
      senderUserId,
    });

    let blocked: boolean;
    let muted: boolean;
    let presence: Awaited<ReturnType<typeof loadRecipientPresenceSnapshot>>;
    let preloadedLanguage: Awaited<ReturnType<typeof loadNotificationUserLanguage>> | undefined;
    if (parallelRecipients) {
      /** P2: 판정 읽기 4개를 1왕복으로(모두 읽기 — 순차와 같은 값). 차단이면 결과만 버린다. */
      const readsT0 = performance.now();
      const [blockedR, mutedR, presenceR, languageR] = await Promise.all([
        isNotificationBlockedForRecipient(sb, recipientUserId, senderUserId),
        isMentioned ? Promise.resolve(false) : isRoomMutedForUser(sb, recipientUserId, roomId),
        loadRecipientPresenceSnapshot(sb, recipientUserId),
        loadNotificationUserLanguage(sb, recipientUserId),
      ]);
      addSpan("ND_recipient_reads_ms", readsT0);
      blocked = blockedR;
      muted = mutedR;
      presence = presenceR;
      preloadedLanguage = languageR;
      if (blocked) {
        logNotifyMessage("blocked_suppressed", { roomId, recipientUserId, senderUserId });
        return;
      }
    } else {
      const blockT0 = performance.now();
      blocked = await isNotificationBlockedForRecipient(sb, recipientUserId, senderUserId);
      addSpan("ND_block_check_ms", blockT0);
      if (blocked) {
        logNotifyMessage("blocked_suppressed", { roomId, recipientUserId, senderUserId });
        return;
      }
      const mutedT0 = performance.now();
      muted = isMentioned ? false : await isRoomMutedForUser(sb, recipientUserId, roomId);
      addSpan("ND_muted_ms", mutedT0);
      const presenceT0 = performance.now();
      presence = await loadRecipientPresenceSnapshot(sb, recipientUserId);
      addSpan("ND_presence_ms", presenceT0);
    }

    const eventType = isMentioned ? ("mention_message" as const) : baseEventType;
    const category = categoryForEventType(eventType);
    const dedupeKey = isMentioned
      ? buildMentionDedupeKey(roomId, messageId, recipientUserId)
      : buildMessageDedupeKey(roomId, messageId);

    const presenceDecision = resolvePresenceSuppressDecision(presence, roomId);

    const suppressReasons: string[] = [];
    if (muted) suppressReasons.push("room_muted");
    if (presenceDecision.reason) suppressReasons.push(presenceDecision.reason);
    if (presenceDecision.autoRead) suppressReasons.push("auto_read_same_room");

    const decisionSnapshot = createNotificationDecision({
      playSound: !muted && !presenceDecision.suppressSound,
      showBottomBadge: !presenceDecision.suppressBadge,
      showListBadge: !presenceDecision.suppressBadge,
      push: !muted && !presenceDecision.suppressPush,
      persist: true,
      suppressReasons,
    });

    const pushSuppressedReason = resolvePushSoundSuppressedReason(decisionSnapshot);
    const soundSuppressedReason = pushSuppressedReason;

    if (muted) logNotifyMessage("muted_sound_suppressed", { roomId, recipientUserId });
    if (presenceDecision.reason === "same_room_foreground") {
      logNotifyMessage("suppressed_same_room", { roomId, recipientUserId });
    }

    const displayT0 = performance.now();
    const display = await buildRecipientMessageNotificationDisplay(
      sb,
      {
        roomId,
        messageId,
        senderUserId,
        recipientUserId,
        preview: input.preview,
        roomKind: input.roomKind,
        directKey: input.directKey,
      },
      displayShared,
      preloadedLanguage
    );
    addSpan("ND_display_build_ms", displayT0);
    const receiverRole = receiverRoleByUserId.get(recipientUserId);
    const displayPayload =
      receiverRole && eventType === "store_order_message"
        ? {
            ...display,
            receiverRole,
            legacyMeta: {
              kind: "store_order_message",
              receiverRole,
            },
          }
        : display;

    const domainPair = resolveMessageEventDomainPair({
      roomId,
      roomKind: input.roomKind ?? displayShared.resolvedRoomKind,
      directKey: input.directKey ?? null,
      chatDomain:
        (typeof display.chatDomain === "string" ? display.chatDomain : null) ??
        displayShared.chatDomain,
      domainIdentityKey:
        (typeof display.domainIdentityKey === "string" ? display.domainIdentityKey : null) ??
        displayShared.domainIdentityKey,
      senderUserId,
      recipientUserId,
    });
    if (!domainPair) {
      logNotifyMessage("create_done", {
        roomId,
        recipientUserId,
        error: "message_domain_required",
      });
      return;
    }

    const appState = resolveOsPushAppStateFromPresence(presence);
    const insertT0 = performance.now();
    const created = await createAndDispatchNotificationEvent(
      sb,
      {
        userId: recipientUserId,
        type: eventType,
        category,
        roomId,
        messageId,
        actorUserId: senderUserId,
        title: display.title,
        body: display.body,
        displayPayload,
        dedupeKey,
        mutedSnapshot: muted,
        pushSuppressedReason,
        soundSuppressedReason,
        unread: decisionSnapshot.showBottomBadge,
        appState,
        chatDomain: domainPair.chatDomain,
        domainIdentityKey: domainPair.domainIdentityKey,
      },
      { deferPush: opts?.deferPush === true }
    );
    addSpan("ND_event_insert_ms", insertT0);

    if (!created.ok) {
      if (created.duplicate) return;
      logNotifyMessage("create_done", { roomId, recipientUserId, error: created.error });
      return;
    }

    if (created.pushDeferred) {
      deferredPushes.push({ row: created.row, appState });
      // NEW-24/NOTI-08: 채팅 푸시도 durable 복구 대상으로 표시 → after() 가 죽어도 1분 cron 이 복구.
      // (managed 타입이 아니면 no-op. grace 뒤에만 cron 이 주워가므로 즉시 fast-path 전송과 충돌 없음.)
      if (isChatPushManagedEventType(eventType)) {
        await markChatPushHandoffPending(sb as unknown as SupabaseClient, created.row.id).catch(() => {});
      }
    }

    logNotifyMessage("create_done", { roomId, recipientUserId, eventId: created.row.id });

    // Freeze only after successful Legacy write — same Snapshot used for write above.
    decisionSnapshotsByRecipientId[recipientUserId] = decisionSnapshot;

    if (decisionSnapshot.suppressReasons.includes("auto_read_same_room")) {
      if (deferAutoRead) {
        autoReadRecipientIds.push(recipientUserId);
      } else {
        await markRoomRead(sb, recipientUserId, roomId);
      }
    } else {
      invalidateNotificationBadgeCache(recipientUserId);
    }
  };

  if (parallelRecipients) {
    const results = await runWithConcurrencyLimit(
      recipients,
      NOTIFY_MESSAGE_PIPELINE_RECIPIENT_CONCURRENCY,
      processRecipient
    );
    /**
     * 한 수신자 실패가 다른 수신자의 결과(이벤트·지연 푸시·자동 읽음 대상·결정 스냅샷)를 버리지 않게 —
     * 부분 결과를 그대로 반환하고 오류는 로그만 남긴다.
     */
    results.forEach((r, i) => {
      if (r.ok) return;
      logNotifyMessage("create_done", {
        roomId,
        recipientUserId: recipients[i],
        error: r.error instanceof Error ? r.error.message : String(r.error ?? "recipient_failed"),
      });
    });
  } else {
    for (const recipientUserId of recipients) {
      await processRecipient(recipientUserId);
    }
  }

  return { decisionSnapshotsByRecipientId, deferredPushes, autoReadRecipientIds };
}
