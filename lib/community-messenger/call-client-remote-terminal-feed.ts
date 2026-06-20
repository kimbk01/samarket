"use client";

/**
 * Remote call terminal handoff — dedicated `/calls/:id` 포함 CallClient 즉시 종료 SSOT.
 * Incoming list removal 과 분리: 카톡·텔레그램처럼 live call surface 는 sessionId 기준으로 즉시 전달.
 */
import { normalizeDibayBridgeCallEvent } from "@/lib/community-messenger/call-events/fcm-call-event-normalizer";
import {
  isTerminalIncomingCallStatus,
  type CallIncomingTerminalQuery,
} from "@/lib/community-messenger/call-incoming-terminal";
import {
  onCommunityMessengerBusEvent,
  postCommunityMessengerCallSessionTerminalBusEvent,
  type MessengerBusEvent,
} from "@/lib/community-messenger/multi-tab-bus";

export type CallClientRemoteTerminalFeedEvent = {
  sessionId?: string;
  tmpSessionId?: string;
  roomId?: string;
  initiatorUserId?: string;
  callKind?: "voice" | "video";
  status: string;
  source: string;
};

export type DispatchRemoteCallSessionTerminalHandoffArgs = {
  sessionId?: string;
  tmpSessionId?: string;
  roomId?: string;
  initiatorUserId?: string;
  callKind?: "voice" | "video" | null;
  status: string;
  sourceTag: string;
};

/** Native inject(`call_terminal`+`call_canceled`)·bus 중복 방지 — 짧은 윈도우 단일 handoff */
const TERMINAL_HANDOFF_DEDUPE_MS = 1500;
const recentTerminalHandoffAt = new Map<string, number>();

function terminalHandoffDedupeKey(sessionId: string, tmpSessionId: string, status: string): string {
  return `${sessionId || tmpSessionId}:${status}`;
}

function shouldSkipDuplicateTerminalHandoff(sessionId: string, tmpSessionId: string, status: string): boolean {
  const key = terminalHandoffDedupeKey(sessionId, tmpSessionId, status);
  const now = Date.now();
  const last = recentTerminalHandoffAt.get(key);
  if (last != null && now - last < TERMINAL_HANDOFF_DEDUPE_MS) return true;
  recentTerminalHandoffAt.set(key, now);
  if (recentTerminalHandoffAt.size > 48) {
    for (const [k, t] of recentTerminalHandoffAt) {
      if (now - t > TERMINAL_HANDOFF_DEDUPE_MS * 3) recentTerminalHandoffAt.delete(k);
    }
  }
  return false;
}

function fcmTerminalKindToSessionStatus(kind: string): string {
  switch (kind) {
    case "rejected":
      return "rejected";
    case "ended":
      return "ended";
    case "missed":
      return "missed";
    default:
      return "cancelled";
  }
}

function mapBusEvent(
  ev: Extract<MessengerBusEvent, { type: "cm.call.session_terminal" }>
): CallClientRemoteTerminalFeedEvent {
  return {
    sessionId: ev.sessionId ?? undefined,
    tmpSessionId: ev.tmpSessionId ?? undefined,
    roomId: ev.roomId ?? undefined,
    initiatorUserId: ev.initiatorUserId ?? undefined,
    callKind: ev.callKind ?? undefined,
    status: ev.status,
    source: "bus_session_terminal",
  };
}

/** Global·SW·FCM — incoming list 제거 여부와 무관하게 CallClient·다른 탭에 terminal 전달 */
export function dispatchRemoteCallSessionTerminalHandoff(
  args: DispatchRemoteCallSessionTerminalHandoffArgs
): void {
  if (args.sourceTag === "bus_session_terminal") return;
  const status = args.status.trim().toLowerCase();
  if (!isTerminalIncomingCallStatus(status)) return;
  const sid = args.sessionId?.trim() ?? "";
  const tmp = args.tmpSessionId?.trim() ?? "";
  if (!sid && !tmp) return;
  if (shouldSkipDuplicateTerminalHandoff(sid, tmp, status)) return;
  postCommunityMessengerCallSessionTerminalBusEvent({
    sessionId: sid || undefined,
    tmpSessionId: tmp || undefined,
    roomId: args.roomId?.trim() || undefined,
    initiatorUserId: args.initiatorUserId?.trim() || undefined,
    callKind: args.callKind ?? undefined,
    status,
  });
}

/** CallClient — bus + native `dibay:call-event` 단일 feed (Realtime 대기 없이 즉시 반응) */
export function subscribeCommunityMessengerCallClientRemoteTerminalFeed(
  handler: (ev: CallClientRemoteTerminalFeedEvent) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  let lastNativeFeedKey = "";
  let lastNativeFeedAt = 0;

  const offBus = onCommunityMessengerBusEvent((ev) => {
    if (ev.type !== "cm.call.session_terminal") return;
    handler(mapBusEvent(ev));
  });

  const onNative = (event: Event) => {
    const detail = (event as CustomEvent).detail as
      | { type?: string; sessionId?: string; status?: string }
      | undefined;
    if (!detail) return;
    if (detail.type !== "call_terminal" && detail.type !== "call_canceled") return;
    const normalized = normalizeDibayBridgeCallEvent(detail);
    if (normalized.action !== "terminal") return;
    const status = fcmTerminalKindToSessionStatus(normalized.terminalKind);
    if (!isTerminalIncomingCallStatus(status)) return;
    const feedKey = `${normalized.callId}:${status}`;
    const now = Date.now();
    if (feedKey === lastNativeFeedKey && now - lastNativeFeedAt < TERMINAL_HANDOFF_DEDUPE_MS) return;
    lastNativeFeedKey = feedKey;
    lastNativeFeedAt = now;
    handler({
      sessionId: normalized.callId,
      status,
      source: detail.type === "call_canceled" ? "native_call_canceled" : "native_call_terminal",
    });
  };

  window.addEventListener("dibay:call-event", onNative);
  return () => {
    offBus();
    window.removeEventListener("dibay:call-event", onNative);
  };
}

export function callClientRemoteTerminalQueryFromFeed(
  ev: CallClientRemoteTerminalFeedEvent
): CallIncomingTerminalQuery {
  return {
    sessionId: ev.sessionId ?? null,
    tmpSessionId: ev.tmpSessionId ?? null,
    roomId: ev.roomId ?? null,
    initiatorUserId: ev.initiatorUserId ?? null,
    callKind: ev.callKind ?? null,
    status: ev.status,
  };
}
