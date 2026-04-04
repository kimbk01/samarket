import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { listIncomingCommunityMessengerCallSessions } from "@/lib/community-messenger/service";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sessions = await listIncomingCommunityMessengerCallSessions(auth.userId);
  return NextResponse.json({ ok: true, sessions });
}
