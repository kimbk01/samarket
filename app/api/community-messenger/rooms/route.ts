import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  createCommunityMessengerGroupRoom,
  ensureCommunityMessengerDirectRoom,
  getCommunityMessengerBootstrap,
} from "@/lib/community-messenger/service";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const data = await getCommunityMessengerBootstrap(auth.userId);
  return NextResponse.json({
    ok: true,
    chats: data.chats,
    groups: data.groups,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: {
    roomType?: "direct" | "group";
    peerUserId?: string;
    title?: string;
    memberIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.roomType === "group") {
    const result = await createCommunityMessengerGroupRoom({
      userId: auth.userId,
      title: String(body.title ?? ""),
      memberIds: Array.isArray(body.memberIds) ? body.memberIds.map(String) : [],
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  const result = await ensureCommunityMessengerDirectRoom(
    auth.userId,
    String(body.peerUserId ?? "")
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
