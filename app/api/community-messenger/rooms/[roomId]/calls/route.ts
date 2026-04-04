import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { startCommunityMessengerCallSession } from "@/lib/community-messenger/service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: { callKind?: "voice" | "video" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.callKind !== "voice" && body.callKind !== "video") {
    return NextResponse.json({ ok: false, error: "bad_call_kind" }, { status: 400 });
  }

  const { roomId } = await params;
  const result = await startCommunityMessengerCallSession({
    userId: auth.userId,
    roomId,
    callKind: body.callKind,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
