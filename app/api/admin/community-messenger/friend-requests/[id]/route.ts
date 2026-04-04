import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { runAdminCommunityMessengerFriendRequestAction } from "@/lib/admin-community-messenger/service";
import type { CommunityMessengerFriendRequestStatus } from "@/lib/community-messenger/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let body: { status?: CommunityMessengerFriendRequestStatus; adminNote?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const status = body.status;
  if (
    status !== "pending" &&
    status !== "accepted" &&
    status !== "rejected" &&
    status !== "cancelled" &&
    status !== "blocked"
  ) {
    return NextResponse.json({ ok: false, error: "bad_status" }, { status: 400 });
  }

  const { id } = await params;
  const result = await runAdminCommunityMessengerFriendRequestAction({
    requestId: id,
    adminUserId: admin.userId,
    status,
    adminNote: body.adminNote,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
