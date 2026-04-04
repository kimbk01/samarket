import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { sendCommunityMessengerMessage } from "@/lib/community-messenger/service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { roomId } = await params;
  const result = await sendCommunityMessengerMessage({
    userId: auth.userId,
    roomId,
    content: String(body.content ?? ""),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
