"use client";

/**
 * 통화 이벤트 call_stub — 서버 messages.call_stub 가 SSOT.
 * 클라이언트는 terminal 시 동일 sessionId 말풍선 reconcile + 목록 preview patch 만 수행한다.
 */
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import {
  getCallMessageText,
  mapResolvedEventToCallStatus,
  type CallSessionResolvedEvent,
  resolveCallSessionEventType,
} from "@/lib/community-messenger/call-event-message";
import {
  postCommunityMessengerCallStubPreviewBusEvent,
} from "@/lib/community-messenger/multi-tab-bus";
import { reconcileCallStubMessageBySession } from "@/lib/community-messenger/stores/messenger-realtime-store";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

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

export type AppendCallChatMessageArgs = {
  roomId: string;
  sessionId?: string | null;
  tmpSessionId?: string | null;
  initiatorUserId: string;
  callKind: CommunityMessengerCallKind;
  resolvedEvent: CallSessionResolvedEvent;
  durationSeconds?: number;
};

/**
 * 터미널 페이로드에서 이벤트 해석 후 동일 session stub reconcile — IncomingCall·CallClient 에서 사용.
 */
export function appendLocalCallChatMessageFromTerminalSession(input: {
  roomId: string;
  sessionId?: string | null;
  tmpSessionId?: string | null;
  initiatorUserId: string;
  recipientUserId?: string | null;
  callKind: CommunityMessengerCallKind;
  status: string;
  startedAt?: string | null;
  /** terminal occurred_at — 목록 tip lastMessageAt 권위 (startedAt 보다 우선) */
  endedAt?: string | null;
  answeredAt?: string | null;
  hangupReason?: string | null;
  endedReason?: string | null;
  durationSeconds?: number;
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
  const roomId = input.roomId.trim();
  if (!roomId || !ini || !viewerUserId) return;

  const text = getCallMessageText({
    callKind: input.callKind,
    eventType: resolved,
    viewerUserId: viewerUserId || ini,
    initiatorUserId: ini,
    durationSeconds: input.durationSeconds,
  });
  const status = mapResolvedEventToCallStatus(resolved);
  const callEndedAt = typeof input.endedAt === "string" ? input.endedAt.trim() : "";
  /** 목록 tip — terminal occurred_at. started_at 만 쓰면 dial 제거 후 stale guard 에 막힘. */
  const tipActivityAt = callEndedAt || new Date().toISOString();

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

  const clientDedupeKey = callChatClientDedupeKey(
    roomId,
    input.sessionId,
    input.tmpSessionId,
    resolved,
    viewerUserId
  );
  if (appliedClientDedupeKeys.has(clientDedupeKey)) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[cm-call-message-dedupe]", { dedupeKey: clientDedupeKey, action: "skip" });
    }
    return;
  }
  appliedClientDedupeKeys.add(clientDedupeKey);
  if (appliedClientDedupeKeys.size > 400) {
    const it = appliedClientDedupeKeys.values().next();
    if (!it.done) appliedClientDedupeKeys.delete(it.value);
  }

  reconcileCallStubMessageBySession({
    roomId,
    sessionId: input.sessionId,
    tmpSessionId: input.tmpSessionId,
    content: text,
    callStatus: status,
    callKind: input.callKind,
  });

  {
    const sessionKey = sessionKeyForDedupe(input.sessionId, input.tmpSessionId);
    postCommunityMessengerCallStubPreviewBusEvent({
      roomId,
      viewerUserId,
      eventId: sessionKey ? `call:${sessionKey}` : undefined,
      preview: {
        lastMessage: text,
        lastMessageType: "call_stub",
        lastMessageAt: tipActivityAt,
      },
    });
  }

  /**
   * DB terminal stub is owned by updateCommunityMessengerCallSession.
   * This client path only reconciles the already-authoritative row into local UI.
   */

  void input.recipientUserId;
}

/**
 * peer_busy 등 세션 없는 로컬 전용 이벤트 — 일반 통화 경로에서는 사용하지 않는다.
 */
export function appendLocalCallChatMessage(args: AppendCallChatMessageArgs): void {
  const roomId = args.roomId.trim();
  const initiatorUserId = args.initiatorUserId.trim();
  if (!roomId || !initiatorUserId) return;

  const viewerUserId = getSyncViewerUserIdForClient()?.trim() || "";
  if (!viewerUserId) return;

  const clientDedupeKey = callChatClientDedupeKey(
    roomId,
    args.sessionId,
    args.tmpSessionId,
    args.resolvedEvent,
    viewerUserId
  );
  if (appliedClientDedupeKeys.has(clientDedupeKey)) return;
  appliedClientDedupeKeys.add(clientDedupeKey);

  const status = mapResolvedEventToCallStatus(args.resolvedEvent);
  const text = getCallMessageText({
    callKind: args.callKind,
    eventType: args.resolvedEvent,
    viewerUserId,
    initiatorUserId,
  });

  if (process.env.NODE_ENV !== "production") {
    console.info("[cm-call-message-local-only]", {
      roomId,
      resolvedEvent: args.resolvedEvent,
      text,
    });
  }
}

