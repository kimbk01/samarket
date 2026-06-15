import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { updateCommunityMessengerCallSession } from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const { sessionId } = await params;
  const result = await updateCommunityMessengerCallSession({
    userId: auth.userId,
    sessionId,
    action: "accept",
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
