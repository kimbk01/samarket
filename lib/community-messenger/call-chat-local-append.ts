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

export type AppendCallChatMessageArgs = {
  roomId: string;
  sessionId?: string | null;
  tmpSessionId?: string | null;
  initiatorUserId: string;
  callKind: CommunityMessengerCallKind;
  resolvedEvent: CallSessionResolvedEvent;
  durationSeconds?: number;
  /** peer_busy 등 세션 없는 로컬 전용 이벤트 */
  persistToApi?: boolean;
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
  const callStartedAt = typeof input.startedAt === "string" ? input.startedAt.trim() : "";

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

  if (callStartedAt) {
    postCommunityMessengerCallStubPreviewBusEvent({
      roomId,
      viewerUserId,
      preview: {
        lastMessage: text,
        lastMessageType: "call_stub",
        lastMessageAt: callStartedAt,
      },
    });
  }

  void persistCallStubMessageBestEffort({
    roomId,
    sessionId: input.sessionId ?? null,
    tmpSessionId: input.tmpSessionId ?? null,
    senderId: ini,
    callKind: input.callKind,
    status,
    replaceExisting: true,
    callStartedAt: callStartedAt || null,
    durationSeconds: input.durationSeconds,
  }).then((src) => {
    if (process.env.NODE_ENV !== "production" && src) {
      console.info("[cm-call-message-append]", {
        roomId,
        sessionId: input.sessionId ?? undefined,
        tmpSessionId: input.tmpSessionId ?? undefined,
        resolvedEvent: resolved,
        source: src,
      });
    }
  });

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

  if (args.persistToApi) {
    void persistCallStubMessageBestEffort({
      roomId,
      sessionId: args.sessionId ?? null,
      tmpSessionId: args.tmpSessionId ?? null,
      senderId: initiatorUserId,
      callKind: args.callKind,
      status,
      replaceExisting: false,
      callStartedAt: null,
      durationSeconds: args.durationSeconds,
    });
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[cm-call-message-local-only]", {
      roomId,
      resolvedEvent: args.resolvedEvent,
      text,
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
  callStartedAt: string | null;
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
        callStartedAt: input.callStartedAt ?? undefined,
        durationSeconds: input.durationSeconds ?? 0,
      }),
    });
    if (res.ok) return "db";
  } catch {
    /* ignore */
  }
  return null;
}
