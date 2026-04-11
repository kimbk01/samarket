import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  getCommunityMessengerRoomSnapshot,
  inviteCommunityMessengerGroupMembers,
  markCommunityMessengerRoomAsRead,
  updateCommunityMessengerParticipantSettings,
  updateCommunityMessengerRoomArchiveState,
} from "@/lib/community-messenger/service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId } = await params;
  const snapshot = await getCommunityMessengerRoomSnapshot(auth.userId, roomId);
  if (!snapshot) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...snapshot });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body:
    | { action?: "invite"; memberIds?: string[] }
    | { action?: "participant_settings"; isMuted?: boolean; isPinned?: boolean }
    | { action?: "mark_read" }
    | { action?: "archive"; archived?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { roomId } = await params;
  if (body.action === "invite") {
    const result = await inviteCommunityMessengerGroupMembers({
      userId: auth.userId,
      roomId,
      memberIds: Array.isArray(body.memberIds) ? body.memberIds.map(String) : [],
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "participant_settings") {
    const result = await updateCommunityMessengerParticipantSettings({
      userId: auth.userId,
      roomId,
      isMuted: typeof body.isMuted === "boolean" ? body.isMuted : undefined,
      isPinned: typeof body.isPinned === "boolean" ? body.isPinned : undefined,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "mark_read") {
    const result = await markCommunityMessengerRoomAsRead({
      userId: auth.userId,
      roomId,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "archive") {
    const result = await updateCommunityMessengerRoomArchiveState({
      userId: auth.userId,
      roomId,
      archived: typeof body.archived === "boolean" ? body.archived : true,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }
}
