import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { buildCommunityMessengerManagedCallToken } from "@/lib/community-messenger/call-provider/server";
import { getCommunityMessengerCallSessionById } from "@/lib/community-messenger/service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { sessionId } = await params;
  const session = await getCommunityMessengerCallSessionById(auth.userId, sessionId);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (session.sessionMode !== "direct") {
    return NextResponse.json({ ok: false, error: "group_call_not_supported_yet" }, { status: 400 });
  }
  const connection = buildCommunityMessengerManagedCallToken(session, auth.userId);
  if (!connection) {
    return NextResponse.json({ ok: false, error: "call_provider_not_configured" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, connection });
}
