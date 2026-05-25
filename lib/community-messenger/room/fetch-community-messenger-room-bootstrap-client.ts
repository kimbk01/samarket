"use client";

import {
  communityMessengerRoomBootstrapPath,
  parseCommunityMessengerRoomSnapshotResponse,
} from "@/lib/community-messenger/messenger-room-bootstrap";
import { logBootstrapColdFillDeepBreakdownClient } from "@/lib/community-messenger/bootstrap-cold-fill-deep-breakdown";
import { primeRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT } from "@/lib/community-messenger/types";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { runSingleFlight } from "@/lib/http/run-single-flight";

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
  opts?: { bustCache?: boolean }
): Promise<CommunityMessengerRoomSnapshot | null> {
  const rid = roomId.trim();
  if (!rid) return null;
  const query = communityMessengerRoomBlockingBootstrapQuery();
  const bust = opts?.bustCache ? `&_=${Date.now()}` : "";
  const url = `${communityMessengerRoomBootstrapPath(rid)}${query}${bust}`;
  const flightKey = opts?.bustCache ? `${url}` : `cm-room-entry-bootstrap:${rid}:${query}`;

  const snap = await runSingleFlight(flightKey, async () => {
    const tFetch0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const res = await fetch(url, { credentials: "include", cache: "no-store" });
    const tHeaders = typeof performance !== "undefined" ? performance.now() : Date.now();
    const tJson0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const json = await res.json().catch(() => null);
    const tJson1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!res.ok) return null;
    const tSnap0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const parsed = parseCommunityMessengerRoomSnapshotResponse(json);
    const tSnap1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    logBootstrapColdFillDeepBreakdownClient({
      route_total_ms: Number(res.headers.get("x-samarket-route-total-ms") ?? "") || undefined,
      rpc_ms: Number(res.headers.get("x-samarket-room-bootstrap-fetch-ms") ?? "") || undefined,
      response_bytes: Number(res.headers.get("x-samarket-response-size-bytes") ?? "") || undefined,
      client_fetch_ms: Math.round(tHeaders - tFetch0),
      client_json_parse_ms: Math.round(tJson1 - tJson0),
      client_apply_ms: Math.round(tSnap1 - tSnap0),
      snapshotTier: "critical",
      cmReqSrcRaw: "room_client_block",
      roomId: rid,
      cache_hit: res.headers.get("x-samarket-bootstrap-cache-hit") === "1" ? 1 : 0,
    });
    return parsed;
  });

  if (snap) {
    primeRoomSnapshot(rid, snap);
  }
  return snap;
}
