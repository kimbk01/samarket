import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { listIncomingCommunityMessengerCallSessions } from "@/lib/community-messenger/service";

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const directOnly = request.nextUrl.searchParams.get("directOnly") === "1";
  const sessions = await listIncomingCommunityMessengerCallSessions(auth.userId, { directOnly });
  return NextResponse.json({ ok: true, sessions });
}
