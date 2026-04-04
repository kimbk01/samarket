import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getOpenGroupJoinPreview } from "@/lib/community-messenger/service";

export async function GET(
  _req: Request,
  context: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId } = await context.params;
  const result = await getOpenGroupJoinPreview(auth.userId, roomId);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
