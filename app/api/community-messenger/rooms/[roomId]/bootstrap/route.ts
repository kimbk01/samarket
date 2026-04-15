import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey, jsonErrorWithRequest, jsonOkWithRequest } from "@/lib/http/api-route";
import { loadCommunityMessengerRoomBootstrap } from "@/lib/chat-domain/use-cases/community-messenger-bootstrap";
import { createSupabaseCommunityMessengerReadPort } from "@/lib/chat-infra-supabase/community-messenger/supabase-read-adapter";
import type { CommunityMessengerRoomSnapshotOptions } from "@/lib/chat-domain/ports/community-messenger-read";
import { COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT } from "@/lib/community-messenger/types";
import { recordMessengerApiTiming, recordMessengerMonitoringEvent } from "@/lib/community-messenger/monitoring/server-store";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const ROOM_BOOTSTRAP_CACHE_TTL_MS = 2500;
const ROOM_BOOTSTRAP_CACHE_MAX = 240;
const roomBootstrapCache = new Map<string, { at: number; snapshot: unknown }>();

function pruneRoomBootstrapCache(now = Date.now()): void {
  for (const [k, v] of roomBootstrapCache) {
    if (now - v.at > ROOM_BOOTSTRAP_CACHE_TTL_MS) roomBootstrapCache.delete(k);
  }
  if (roomBootstrapCache.size <= ROOM_BOOTSTRAP_CACHE_MAX) return;
  const overflow = roomBootstrapCache.size - ROOM_BOOTSTRAP_CACHE_MAX;
  let i = 0;
  for (const k of roomBootstrapCache.keys()) {
    roomBootstrapCache.delete(k);
    i += 1;
    if (i >= overflow) break;
  }
}

function getCachedBootstrap(key: string): unknown | null {
  pruneRoomBootstrapCache();
  const row = roomBootstrapCache.get(key);
  if (!row) return null;
  if (Date.now() - row.at > ROOM_BOOTSTRAP_CACHE_TTL_MS) {
    roomBootstrapCache.delete(key);
    return null;
  }
  return row.snapshot;
}

function setCachedBootstrap(key: string, snapshot: unknown): void {
  roomBootstrapCache.set(key, { at: Date.now(), snapshot });
  pruneRoomBootstrapCache();
}

/**
 * GET — 한 번에 방 메타, 참가자(멤버), 최근 메시지, 내 unread(room.unreadCount), activeCall.
 * 초기 로드 전용; 이후 갱신은 동일 엔드포인트 또는 `GET /rooms/[id]`(messageLimit 쿼리) 사용.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:room-bootstrap:${getRateLimitKey(req, auth.userId)}`,
    limit: 120,
    windowMs: 60_000,
    message: "대화방 부트스트랩 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_room_bootstrap_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId } = await params;
  const rawLimit = req.nextUrl.searchParams.get("messages");
  const memberHydration = req.nextUrl.searchParams.get("memberHydration")?.trim().toLowerCase();
  /** `minimal` — 참가자 전원 프로필 생략(첫 페인트·백그라운드 동기화용) */
  const hydrateFullMemberList = memberHydration !== "minimal";
  const opts: CommunityMessengerRoomSnapshotOptions = {
    initialMessageLimit:
      rawLimit != null && rawLimit !== ""
        ? Math.floor(Number(rawLimit)) || COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT
        : COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT,
    hydrateFullMemberList,
  };

  const t0 = performance.now();
  const readPort = createSupabaseCommunityMessengerReadPort();
  const roomKey = String(roomId ?? "").trim();
  const cacheKey = `cm_room_bootstrap:${auth.userId}:${roomKey}:${hydrateFullMemberList ? "full" : "minimal"}:${opts.initialMessageLimit ?? COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT}`;
  const cached = getCachedBootstrap(cacheKey);
  const trace = process.env.MESSENGER_PERF_TRACE_BOOTSTRAP === "1";
  const tSnap0 = performance.now();
  const snapshot = cached
    ? (cached as Awaited<ReturnType<typeof loadCommunityMessengerRoomBootstrap>>)
    : await runSingleFlight(cacheKey, async () => {
        const snap = await loadCommunityMessengerRoomBootstrap(readPort, auth.userId, roomKey, opts);
        // null 도 캐시해두면 동일 방 연타 404/권한 에러 폭주를 줄임(짧은 TTL).
        setCachedBootstrap(cacheKey, snap);
        return snap;
      });
  const snapMs = Math.round(performance.now() - tSnap0);
  const ms = Math.round(performance.now() - t0);
  recordMessengerApiTiming("GET /api/community-messenger/rooms/[roomId]/bootstrap", ms, snapshot ? 200 : 404);
  if (trace || snapMs >= 450) {
    recordMessengerMonitoringEvent({
      ts: Date.now(),
      category: "api.community_messenger",
      metric: "room_bootstrap_snapshot_ms",
      source: "server",
      value: snapMs,
      unit: "ms",
      labels: {
        route: "GET /api/community-messenger/rooms/[roomId]/bootstrap",
        hydration: hydrateFullMemberList ? "full" : "minimal",
        status: String(snapshot ? 200 : 404),
      },
    });
  }
  if (!snapshot) {
    return jsonErrorWithRequest(req, "not_found", 404);
  }

  return jsonOkWithRequest(req, {
    v: 1,
    domain: "community" as const,
    bootstrap: true,
    viewerUnreadCount: snapshot.room.unreadCount,
    unread: { count: snapshot.room.unreadCount },
    ...snapshot,
  });
}
