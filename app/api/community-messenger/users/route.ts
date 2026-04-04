import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { searchCommunityMessengerUsers } from "@/lib/community-messenger/service";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const query = req.nextUrl.searchParams.get("q") ?? "";
  const users = await searchCommunityMessengerUsers(auth.userId, query);
  return NextResponse.json({ ok: true, users });
}
