import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { loadCommunityMessengerRoomBootstrap } from "@/lib/chat-domain/use-cases/community-messenger-bootstrap";
import { createSupabaseCommunityMessengerReadPort } from "@/lib/chat-infra-supabase/community-messenger/supabase-read-adapter";
import type { CommunityMessengerRoomSnapshotOptions } from "@/lib/chat-domain/ports/community-messenger-read";
import { COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT } from "@/lib/community-messenger/types";
import { recordMessengerApiTiming } from "@/lib/community-messenger/monitoring/server-store";

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
  const snapshot = await loadCommunityMessengerRoomBootstrap(readPort, auth.userId, roomId, opts);
  const ms = Math.round(performance.now() - t0);
  recordMessengerApiTiming("GET /api/community-messenger/rooms/[roomId]/bootstrap", ms, snapshot ? 200 : 404);
  if (!snapshot) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    v: 1,
    domain: "community" as const,
    bootstrap: true,
    viewerUnreadCount: snapshot.room.unreadCount,
    unread: { count: snapshot.room.unreadCount },
    ...snapshot,
  });
}
