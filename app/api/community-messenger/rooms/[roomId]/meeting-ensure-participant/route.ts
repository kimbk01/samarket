import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { ensurePhilifeMeetingMessengerForRoomId } from "@/lib/community-messenger/philife-meeting-open-group-summaries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ roomId: string }> };

/**
 * Philife 모임(오픈그룹) — `meeting_members` 와 메신저 참가자 row 를 **동기화**한다(멱등).
 * 커뮤니티·피드·방 입장 직전에 호출해, 메인 목록/부트스트랩에 방이 뜨도록 맞춘다.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { roomId: raw } = await params;
  const roomId = String(raw ?? "").trim();
  if (!roomId) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const result = await ensurePhilifeMeetingMessengerForRoomId(auth.userId, roomId);
  if (result.ok === false) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}
