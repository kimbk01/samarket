import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEPRECATED_BODY = {
  ok: false,
  error: "message_requests_deprecated",
  message: "Discord-style message requests are deprecated. Use /api/community-messenger/friends/request instead.",
  redirect: "/api/community-messenger/friends/request",
};

export async function POST(_req: NextRequest) {
  return NextResponse.json(DEPRECATED_BODY, { status: 410 });
}
