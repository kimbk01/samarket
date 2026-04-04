import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { joinOpenGroupRoomWithPassword } from "@/lib/community-messenger/service";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId } = await context.params;

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await joinOpenGroupRoomWithPassword({
    userId: auth.userId,
    roomId,
    password: String(body.password ?? ""),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
