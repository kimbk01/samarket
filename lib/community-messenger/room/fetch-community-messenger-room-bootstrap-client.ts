"use client";

import {
  communityMessengerRoomBootstrapPath,
  parseCommunityMessengerRoomSnapshotResponse,
} from "@/lib/community-messenger/messenger-room-bootstrap";
import { logBootstrapColdFillDeepBreakdownClient } from "@/lib/community-messenger/bootstrap-cold-fill-deep-breakdown";
import {
  isRoomSnapshotFresh,
  peekRoomSnapshot,
  primeRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import { COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT } from "@/lib/community-messenger/types";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { ENTRY_SHARED_FLIGHT_DEADLINE_MS, runWithSharedFlightDeadline } from "@/lib/http/shared-flight-deadline";
import { readTradeChatEntryMark } from "@/lib/chats/trade-chat-entry-client";
import {
  recordCmRoomBootstrapCacheHit,
  recordCmRoomBootstrapFetchMs,
  recordCmRoomBootstrapPayloadMs,
} from "@/lib/trade/trade-c2c-perf-metrics";
import {
  noteTradeChatEntryJourneyMilestone,
} from "@/lib/trade/trade-chat-entry-journey-perf";
import { noteTradeChatRoomBootstrapDoneForShellBreakdown } from "@/lib/trade/trade-chat-room-shell-breakdown-perf";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { isAuthoritativeMessengerRoomEntrySnapshot } from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";

/**
 * 서버 일시 오류(5xx·408·429) — 접근 거부(401·403·404·410)와 구분해 재시도 가능한 실패로 전달한다.
 * 접근 거부·기타 4xx 는 기존대로 `null`.
 */
export class MessengerRoomBootstrapTransientError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`cm_room_bootstrap_transient_${status}`);
    this.name = "MessengerRoomBootstrapTransientError";
    this.status = status;
  }
}

function isTransientMessengerRoomBootstrapStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

/** blocking 첫 입장과 동일한 쿼리 — 메시지·멤버 시드 포함 */
export function communityMessengerRoomBlockingBootstrapQuery(): string {
  return `?mode=instant&memberHydration=minimal&hydration=critical&cmReqSrc=room_client_block&messages=${COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT}`;
}

/**
 * GET `/api/community-messenger/rooms/[roomId]/bootstrap` — 클라이언트 첫 페인트용.
 * 결과는 room snapshot 캐시에 prime 한다.
 */
export async function fetchCommunityMessengerRoomBootstrapClient(
  roomId: string,
  opts?: { bustCache?: boolean; viewerUserId?: string | null }
): Promise<CommunityMessengerRoomSnapshot | null> {
  const rid = roomId.trim();
  if (!rid) return null;
  const viewerUserId = (opts?.viewerUserId ?? getCurrentUser()?.id ?? "").trim();
  if (!opts?.bustCache && viewerUserId) {
    const cached = peekRoomSnapshot(rid, viewerUserId);
    if (
      cached &&
      isAuthoritativeMessengerRoomEntrySnapshot(cached) &&
      isRoomSnapshotFresh(rid, viewerUserId)
    ) {
      if (readTradeChatEntryMark()) {
        recordCmRoomBootstrapCacheHit(1);
      }
      return cached;
    }
  }
  const query = communityMessengerRoomBlockingBootstrapQuery();
  const bust = opts?.bustCache ? `&_=${Date.now()}` : "";
  const url = `${communityMessengerRoomBootstrapPath(rid)}${query}${bust}`;
  const flightKey = opts?.bustCache ? `${url}` : `cm-room-entry-bootstrap:${rid}:${query}`;

  const snap = await runSingleFlight(flightKey, async () => {
    if (readTradeChatEntryMark()) {
      noteTradeChatEntryJourneyMilestone("bootstrap_fetch_start");
    }
    const tFetch0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    let tHeaders = tFetch0;
    let tJson0 = tFetch0;
    const { res, json } = await runWithSharedFlightDeadline(
      "cm_room_entry_bootstrap",
      ENTRY_SHARED_FLIGHT_DEADLINE_MS,
      async (signal) => {
        const response = await fetch(url, { credentials: "include", cache: "no-store", signal });
        tHeaders = typeof performance !== "undefined" ? performance.now() : Date.now();
        tJson0 = tHeaders;
        const body: unknown = await response.json().catch(() => null);
        return { res: response, json: body };
      }
    );
    const tJson1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (isTransientMessengerRoomBootstrapStatus(res.status)) {
      throw new MessengerRoomBootstrapTransientError(res.status);
    }
    if (!res.ok) return null;
    const tSnap0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const parsed = parseCommunityMessengerRoomSnapshotResponse(json);
    const tSnap1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const clientFetchMs = Math.round(tHeaders - tFetch0);
    const clientPayloadMs = Math.round(tJson1 - tJson0) + Math.round(tSnap1 - tSnap0);
    const cacheHit = res.headers.get("x-samarket-bootstrap-cache-hit") === "1" ? 1 : 0;
    logBootstrapColdFillDeepBreakdownClient({
      route_total_ms: Number(res.headers.get("x-samarket-route-total-ms") ?? "") || undefined,
      rpc_ms: Number(res.headers.get("x-samarket-room-bootstrap-fetch-ms") ?? "") || undefined,
      response_bytes: Number(res.headers.get("x-samarket-response-size-bytes") ?? "") || undefined,
      client_fetch_ms: clientFetchMs,
      client_json_parse_ms: Math.round(tJson1 - tJson0),
      client_apply_ms: Math.round(tSnap1 - tSnap0),
      snapshotTier: "critical",
      cmReqSrcRaw: "room_client_block",
      roomId: rid,
      cache_hit: cacheHit,
    });
    if (readTradeChatEntryMark()) {
      const serverFetchMs = Number(res.headers.get("x-samarket-room-bootstrap-fetch-ms") ?? "");
      recordCmRoomBootstrapFetchMs(
        Number.isFinite(serverFetchMs) && serverFetchMs > 0 ? serverFetchMs : clientFetchMs
      );
      recordCmRoomBootstrapPayloadMs(clientPayloadMs);
      recordCmRoomBootstrapCacheHit(cacheHit);
      noteTradeChatEntryJourneyMilestone("bootstrap_fetch_done");
      noteTradeChatRoomBootstrapDoneForShellBreakdown();
    }
    return parsed;
  });

  if (snap && isAuthoritativeMessengerRoomEntrySnapshot(snap)) {
    primeRoomSnapshot(rid, snap);
  }
  return snap;
}
