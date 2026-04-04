import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { toggleCommunityMessengerFavoriteFriend } from "@/lib/community-messenger/service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ friendUserId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { friendUserId } = await params;
  const result = await toggleCommunityMessengerFavoriteFriend(auth.userId, friendUserId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
