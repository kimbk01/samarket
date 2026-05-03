"use client";

/**
 * 통화 이벤트 call_stub — 시그널 경로에서 채팅 로그에 즉시 반영(로컬) + 터미널만 API 베스트에포트 저장.
 */
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import {
  getCallMessageText,
  mapResolvedEventToCallStatus,
  type CallSessionResolvedEvent,
  resolveCallSessionEventType,
} from "@/lib/community-messenger/call-event-message";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import {
  applyIncomingMessageEvent,
  removeRingingCallStubsForSessionKeys,
} from "@/lib/community-messenger/stores/messenger-realtime-store";
import type { CommunityMessengerCallKind, CommunityMessengerCallStatus } from "@/lib/community-messenger/types";

const appliedClientDedupeKeys = new Set<string>();

function sessionKeyForDedupe(sessionId?: string | null, tmpSessionId?: string | null): string {
  const s = typeof sessionId === "string" ? sessionId.trim() : "";
  const t = typeof tmpSessionId === "string" ? tmpSessionId.trim() : "";
  return s || t || "";
}

/** 로컬 재생 방지: `call_event:${room}:${session|tmp}:${event}:${viewer}` */
export function callChatClientDedupeKey(
  roomId: string,
  sessionId: string | null | undefined,
  tmpSessionId: string | null | undefined,
  resolvedEvent: CallSessionResolvedEvent,
  viewerUserId: string
): string {
  const sk = sessionKeyForDedupe(sessionId, tmpSessionId);
  const r = roomId.trim();
  const v = viewerUserId.trim();
  return `call_event:${r}:${sk}:${resolvedEvent}:${v}`;
}

/** 동일 세션·이벤트에 대해 양 클라이언트가 같은 로컬 id를 쓰도록 (방 단위) */
function stableStubIdentityKey(
  roomId: string,
  sessionId: string | null | undefined,
  tmpSessionId: string | null | undefined,
  resolvedEvent: CallSessionResolvedEvent
): string {
  const sk = sessionKeyForDedupe(sessionId, tmpSessionId);
  return `call_event:${roomId.trim()}:${sk}:${resolvedEvent}`;
}

function stableClientStubMessageId(identityKey: string): string {
  let h = 2166136261;
  for (let i = 0; i < identityKey.length; i++) {
    h ^= identityKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `cm-cevt-${(h >>> 0).toString(36)}`;
}

export type AppendCallChatMessageArgs = {
  roomId: string;
  sessionId?: string | null;
  tmpSessionId?: string | null;
  initiatorUserId: string;
  callKind: CommunityMessengerCallKind;
  resolvedEvent: CallSessionResolvedEvent;
  durationSeconds?: number;
  /** 링 스텁만 기본 true — 터미널은 서버 finalize 우선 */
  persistToApi?: boolean;
};

/**
 * 터미널 페이로드에서 이벤트 해석 후 스텁 반영 — `GlobalCommunityMessengerIncomingCall` 등에서 사용.
 */
export function appendLocalCallChatMessageFromTerminalSession(input: {
  roomId: string;
  sessionId?: string | null;
  tmpSessionId?: string | null;
  initiatorUserId: string;
  recipientUserId?: string | null;
  callKind: CommunityMessengerCallKind;
  status: string;
  answeredAt?: string | null;
  hangupReason?: string | null;
  endedReason?: string | null;
}): void {
  const statusNorm = input.status.trim().toLowerCase();
  const resolved = resolveCallSessionEventType({
    status: statusNorm,
    answeredAt: input.answeredAt ?? null,
    hangupReason: input.hangupReason ?? null,
    endedReason: input.endedReason ?? null,
  });
  if (!resolved) return;

  const viewerUserId = getSyncViewerUserIdForClient()?.trim() || "";
  const ini = input.initiatorUserId.trim();
  const text = getCallMessageText({
    callKind: input.callKind,
    eventType: resolved,
    viewerUserId: viewerUserId || ini,
    initiatorUserId: ini,
  });

  if (process.env.NODE_ENV !== "production") {
    console.info("[cm-call-message-resolve]", {
      sessionId: input.sessionId ?? undefined,
      tmpSessionId: input.tmpSessionId ?? undefined,
      currentUserId: viewerUserId || undefined,
      role: viewerUserId && ini ? (viewerUserId === ini ? "caller" : "callee") : undefined,
      status: statusNorm,
      reason: input.hangupReason ?? undefined,
      eventType: resolved,
      text,
    });
  }

  appendLocalCallChatMessage({
    roomId: input.roomId,
    sessionId: input.sessionId,
    tmpSessionId: input.tmpSessionId,
    initiatorUserId: ini,
    callKind: input.callKind,
    resolvedEvent: resolved,
    persistToApi: true,
  });
  void input.recipientUserId;
}

/**
 * 로컬 타임라인 + BroadcastChannel fan-out + POST stub-message (best effort, 터미널만).
 */
export function appendLocalCallChatMessage(args: AppendCallChatMessageArgs): void {
  const roomId = args.roomId.trim();
  const initiatorUserId = args.initiatorUserId.trim();
  if (!roomId || !initiatorUserId) return;

  const viewerUserId = getSyncViewerUserIdForClient()?.trim() || "";
  if (!viewerUserId) return;

  const isRinging = args.resolvedEvent === "outgoing_started" || args.resolvedEvent === "incoming_received";
  if (!isRinging) {
    removeRingingCallStubsForSessionKeys({
      roomId,
      sessionId: args.sessionId,
      tmpSessionId: args.tmpSessionId,
    });
  }

  const clientDedupeKey = callChatClientDedupeKey(
    roomId,
    args.sessionId,
    args.tmpSessionId,
    args.resolvedEvent,
    viewerUserId
  );
  if (appliedClientDedupeKeys.has(clientDedupeKey)) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[cm-call-message-dedupe]", {
        dedupeKey: clientDedupeKey,
        action: "skip",
      });
    }
    return;
  }
  appliedClientDedupeKeys.add(clientDedupeKey);
  if (appliedClientDedupeKeys.size > 400) {
    const it = appliedClientDedupeKeys.values().next();
    if (!it.done) appliedClientDedupeKeys.delete(it.value);
  }

  const identityKey = stableStubIdentityKey(roomId, args.sessionId, args.tmpSessionId, args.resolvedEvent);
  const messageId = stableClientStubMessageId(identityKey);

  const status = mapResolvedEventToCallStatus(args.resolvedEvent);
  const text = getCallMessageText({
    callKind: args.callKind,
    eventType: args.resolvedEvent,
    viewerUserId,
    initiatorUserId,
  });

  if (process.env.NODE_ENV !== "production") {
    console.info("[cm-call-message-dedupe]", {
      dedupeKey: clientDedupeKey,
      action: "append",
    });
  }

  const metadata: Record<string, unknown> = {
    callKind: args.callKind,
    callStatus: status,
    sessionId: typeof args.sessionId === "string" && args.sessionId.trim() ? args.sessionId.trim() : null,
    tmpSessionId: typeof args.tmpSessionId === "string" && args.tmpSessionId.trim() ? args.tmpSessionId.trim() : null,
    callResolvedEvent: args.resolvedEvent,
    callDedupeKey: clientDedupeKey,
  };

  const messageRow: Record<string, unknown> = {
    id: messageId,
    room_id: roomId,
    sender_id: initiatorUserId,
    message_type: "call_stub",
    content: text,
    metadata,
    created_at: new Date().toISOString(),
  };

  applyIncomingMessageEvent({
    viewerUserId,
    roomId,
    messageRow,
  });
  postCommunityMessengerBusEvent({
    type: "cm.room.incoming_message",
    roomId,
    viewerUserId,
    messageRow,
    at: Date.now(),
  });

  const shouldPersist =
    args.persistToApi === true ||
    (args.persistToApi !== false && (args.resolvedEvent === "incoming_received" || !isRinging));
  if (shouldPersist) {
    void persistCallStubMessageBestEffort({
      roomId,
      sessionId: args.sessionId ?? null,
      tmpSessionId: args.tmpSessionId ?? null,
      senderId: initiatorUserId,
      callKind: args.callKind,
      status,
      replaceExisting: !isRinging,
      durationSeconds: args.durationSeconds,
    }).then((src) => {
      if (process.env.NODE_ENV !== "production" && src) {
        console.info("[cm-call-message-append]", {
          roomId,
          sessionId: args.sessionId ?? undefined,
          tmpSessionId: args.tmpSessionId ?? undefined,
          resolvedEvent: args.resolvedEvent,
          source: src,
        });
      }
    });
  }
}

async function persistCallStubMessageBestEffort(input: {
  roomId: string;
  sessionId: string | null;
  tmpSessionId: string | null;
  senderId: string;
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallStatus;
  replaceExisting: boolean;
  durationSeconds?: number;
}): Promise<"db" | null> {
  try {
    const res = await fetch("/api/community-messenger/calls/stub-message", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: input.roomId,
        sessionId: input.sessionId ?? undefined,
        tmpSessionId: input.tmpSessionId ?? undefined,
        senderId: input.senderId,
        callKind: input.callKind,
        status: input.status,
        replaceExisting: input.replaceExisting,
        durationSeconds: input.durationSeconds ?? 0,
      }),
    });
    if (res.ok) return "db";
  } catch {
    /* ignore */
  }
  return null;
}
