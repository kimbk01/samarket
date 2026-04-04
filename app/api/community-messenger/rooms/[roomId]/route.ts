import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  getCommunityMessengerRoomSnapshot,
  inviteCommunityMessengerGroupMembers,
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

  let body: { action?: "invite"; memberIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { roomId } = await params;
  if (body.action !== "invite") {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }
  const result = await inviteCommunityMessengerGroupMembers({
    userId: auth.userId,
    roomId,
    memberIds: Array.isArray(body.memberIds) ? body.memberIds.map(String) : [],
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
