import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { runAdminCommunityMessengerRoomAction } from "@/lib/admin-community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RoomAction =
  | "block_room"
  | "unblock_room"
  | "archive_room"
  | "unarchive_room"
  | "readonly_on"
  | "readonly_off";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let body: { action?: RoomAction; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { id } = await params;
  const action = body.action;
  if (
    action !== "block_room" &&
    action !== "unblock_room" &&
    action !== "archive_room" &&
    action !== "unarchive_room" &&
    action !== "readonly_on" &&
    action !== "readonly_off"
  ) {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }

  const result = await runAdminCommunityMessengerRoomAction({
    roomId: id,
    adminUserId: admin.userId,
    action,
    note: body.note,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
