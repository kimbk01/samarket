import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { removeCommunityMessengerFriend } from "@/lib/community-messenger/service";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ friendUserId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { friendUserId } = await params;
  const result = await removeCommunityMessengerFriend(auth.userId, friendUserId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
