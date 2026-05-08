"use client";

import {
  cmDebugUserIdTailFromChannelName,
  pushCmBrowserDebugEvent,
} from "@/lib/community-messenger/realtime/cm-browser-debug-buffer";

/**
 * 커뮤니티 메신저 Realtime 1:1 동기화 근본 점검용 로그.
 * `NEXT_PUBLIC_CM_REALTIME_DEBUG=1` 일 때만 콘솔에 출력 — 기본 비활성.
 * (켜 두면 탭 전환·스크롄 때마다 `console.info` 비용이 쌓이므로 성능 확인 시에는 끄는 것을 권장)
 *
 * 브라우저 콘솔에서 `[cm-rt]` 로 필터.
 */

const PREFIX = "[cm-rt]";

export function isCommunityMessengerRealtimeDebugEnabled(): boolean {
  return typeof process !== "undefined" && process.env.NEXT_PUBLIC_CM_REALTIME_DEBUG === "1";
}

function out(kind: string, payload: Record<string, unknown>): void {
  if (!isCommunityMessengerRealtimeDebugEnabled()) return;
  try {
    // eslint-disable-next-line no-console -- dev-only diagnostic channel
    console.info(PREFIX, kind, payload);
  } catch {
    /* ignore */
  }
}

export function cmRtLogRoomIdentity(args: {
  routeRoomId: string;
  streamRoomId: string;
  viewerUserId: string | null | undefined;
  peerUserId: string | null | undefined;
  channelName: string;
}): void {
  out("room_identity", {
    routeRoomId: args.routeRoomId,
    streamRoomId: args.streamRoomId,
    routeMatchesStream: String(args.routeRoomId) === String(args.streamRoomId),
    currentUserId: args.viewerUserId ?? null,
    peerUserId: args.peerUserId ?? null,
    channelName: args.channelName,
  });
}

export function cmRtLogSubscribe(args: {
  scope: string;
  channelName: string;
  status: string;
  attemptPhase?: string;
  streamRoomId?: string;
}): void {
  out("subscribe", {
    scope: args.scope,
    channelName: args.channelName,
    status: args.status,
    attemptPhase: args.attemptPhase ?? null,
    streamRoomId: args.streamRoomId ?? null,
    ok: args.status === "SUBSCRIBED",
  });
}

export function cmRtLogTeardown(args: {
  reason: string;
  channelName?: string;
  streamRoomId?: string;
  /** `subscribeWithRetry.stop()` 호출 스택 — 채널 이름만으로는 부족할 때 원인 추적 */
  stopSourceStack?: string | null;
  /** 내부 teardown 분류(예: explicit_stop) */
  teardownDetail?: string | null;
}): void {
  const ch = args.channelName ?? null;
  if (ch?.startsWith("community-messenger")) {
    pushCmBrowserDebugEvent({
      label: "cm-rt-unsubscribe",
      scope: null,
      channelName: ch,
      reason: args.reason ?? null,
      status: null,
      bodySnippet: args.teardownDetail ?? null,
      payload: {
        streamRoomId: args.streamRoomId ?? null,
        teardownDetail: args.teardownDetail ?? null,
      },
      stopSourceStack: args.stopSourceStack ?? null,
      fingerprint: null,
      userIdTail: cmDebugUserIdTailFromChannelName(ch),
    });
  }
  out("unsubscribe", {
    reason: args.reason,
    channelName: args.channelName ?? null,
    streamRoomId: args.streamRoomId ?? null,
    stopSourceStack: args.stopSourceStack ?? null,
    teardownDetail: args.teardownDetail ?? null,
  });
}

export function cmRtLogPostgresPayload(args: {
  filterRoomId: string;
  eventType: string;
  table: string;
  messageId: string | null;
  payloadRoomId: string | null;
  filterMatchesPayloadRoom: boolean;
}): void {
  out("postgres_payload", {
    filterRoomId: args.filterRoomId,
    eventType: args.eventType,
    table: args.table,
    insertedMessageId: args.messageId,
    payloadRoomId: args.payloadRoomId,
    filterMatchesPayloadRoom: args.filterMatchesPayloadRoom,
  });
}

export function cmRtLogIngestBatch(args: {
  streamRoomId: string;
  routeRoomId: string;
  batchLen: number;
  eventTypes: string[];
  messageIds: string[];
}): void {
  out("ingest_batch", {
    streamRoomId: args.streamRoomId,
    routeRoomId: args.routeRoomId,
    batchLen: args.batchLen,
    eventTypes: args.eventTypes,
    mergedMessageIds: args.messageIds,
  });
}

export function cmRtLogMapRowSkipped(args: { reason: string; rawKeys: string[] }): void {
  out("map_row_skipped", { reason: args.reason, rawKeys: args.rawKeys });
}

export function cmRtLogAuthEpochBump(args: { epoch: number; source: string }): void {
  out("auth_epoch", { epoch: args.epoch, source: args.source });
}

export function cmRtLogCanonicalRedirect(args: { fromRouteRoomId: string; toCanonicalRoomId: string; viewerUserId?: string | null }): void {
  out("canonical_redirect", {
    fromRouteRoomId: args.fromRouteRoomId,
    toCanonicalRoomId: args.toCanonicalRoomId,
    viewerUserId: args.viewerUserId ?? null,
  });
}
