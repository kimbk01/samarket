import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEPRECATED_BODY = {
  ok: false,
  error: "message_requests_deprecated",
  message: "Use PATCH /api/community-messenger/friends/:friendshipId/decline instead.",
};

export async function PATCH(
  _req: NextRequest,
  _ctx: { params: Promise<{ roomId: string }> }
) {
  return NextResponse.json(DEPRECATED_BODY, { status: 410 });
}
