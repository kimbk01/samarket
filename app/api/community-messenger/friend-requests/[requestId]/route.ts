import { NextResponse } from "next/server";
import { logFriendRequestLegacyApiNotUsed } from "@/lib/community-messenger/social-relations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH() {
  logFriendRequestLegacyApiNotUsed("PATCH /api/community-messenger/friend-requests/[requestId]");
  return NextResponse.json(
    { ok: false, error: "friend_request_deprecated", message: "친구 요청 기능은 더 이상 지원되지 않습니다." },
    { status: 410 }
  );
}

export async function DELETE() {
  logFriendRequestLegacyApiNotUsed("DELETE /api/community-messenger/friend-requests/[requestId]");
  return NextResponse.json(
    { ok: false, error: "friend_request_deprecated", message: "친구 요청 기능은 더 이상 지원되지 않습니다." },
    { status: 410 }
  );
}
