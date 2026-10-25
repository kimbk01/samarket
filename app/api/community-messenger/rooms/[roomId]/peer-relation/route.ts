import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isMessengerGeneralFriendDirectKey } from "@/lib/community-messenger/messenger-room-domain";
import { resolveDirectRoomPeerRelation } from "@/lib/community-messenger/friendship/direct-room-peer-relation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * §17-5 R-4: 일반 1:1 방의 상대 관계만 — 캐시 없음. 방 스냅샷(미리 받기·메모리 캐시)이 오래됐을 때 방 화면이 다시 맞춘다.
 * 판정은 방 스냅샷과 같은 `resolveDirectRoomPeerRelation`. 통화 권한은 포함하지 않는다.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:room-peer-relation:${getRateLimitKey(req, auth.userId)}`,
    limit: 120,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_room_peer_relation_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await params;
  const roomId = String(rawRoomId ?? "").trim();
  if (!roomId) return NextResponse.json({ ok: false, error: "bad_room" }, { status: 400, headers: NO_STORE });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: NO_STORE });
  }

  const [{ data: room }, { data: me }] = await Promise.all([
    (sb as any).from("community_messenger_rooms").select("id, room_type, direct_key").eq("id", roomId).maybeSingle(),
    (sb as any)
      .from("community_messenger_participants")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", auth.userId)
      .limit(1)
      .maybeSingle(),
  ]);
  if (!room || !me) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: NO_STORE });

  const directKey = typeof room.direct_key === "string" ? room.direct_key.trim() : "";
  if (room.room_type !== "direct" || !isMessengerGeneralFriendDirectKey(directKey)) {
    return NextResponse.json({ ok: false, error: "not_general_direct" }, { status: 400, headers: NO_STORE });
  }
  const pair = directKey.split(":");
  const peerUserId = pair.find((id: string) => id !== auth.userId) ?? "";
  if (!pair.includes(auth.userId) || !peerUserId) {
    return NextResponse.json({ ok: false, error: "not_general_direct" }, { status: 400, headers: NO_STORE });
  }

  const relation = await resolveDirectRoomPeerRelation(sb as any, auth.userId, peerUserId);
  return NextResponse.json({ ok: true, peerUserId, relation }, { headers: NO_STORE });
}
