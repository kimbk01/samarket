import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  getCommunityMessengerBootstrap,
  sendCommunityMessengerFriendRequest,
} from "@/lib/community-messenger/service";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const data = await getCommunityMessengerBootstrap(auth.userId);
  return NextResponse.json({ ok: true, requests: data.requests });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: { targetUserId?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await sendCommunityMessengerFriendRequest(
    auth.userId,
    String(body.targetUserId ?? ""),
    body.note
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
