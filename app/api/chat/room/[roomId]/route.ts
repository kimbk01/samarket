/**
 * 채팅방 1건 조회 (서비스 롤)
 * GET /api/chat/room/[roomId] (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadChatRoomDetailForUser } from "@/lib/chats/server/load-chat-room-detail";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId } = await params;
  const result = await loadChatRoomDetailForUser({
    roomId: roomId ?? "",
    userId: auth.userId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.room, {
    headers: result.cacheHit
      ? {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Chat-Room-Cache": "HIT",
        }
      : {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
  });
}
