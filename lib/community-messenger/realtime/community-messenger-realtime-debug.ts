"use client";

/**
 * 커뮤니티 메신저 Realtime 1:1 동기화 근본 점검용 로그.
 * `NEXT_PUBLIC_CM_REALTIME_DEBUG=1` 일 때만 콘솔에 출력 — 기본 비활성.
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

export function cmRtLogTeardown(args: { reason: string; channelName?: string; streamRoomId?: string }): void {
  out("unsubscribe", {
    reason: args.reason,
    channelName: args.channelName ?? null,
    streamRoomId: args.streamRoomId ?? null,
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
