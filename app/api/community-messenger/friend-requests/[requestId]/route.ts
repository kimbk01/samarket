import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { respondCommunityMessengerFriendRequest } from "@/lib/community-messenger/service";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: { action?: "accept" | "reject" | "cancel" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { requestId } = await params;
  const action = body.action;
  if (action !== "accept" && action !== "reject" && action !== "cancel") {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }
  const result = await respondCommunityMessengerFriendRequest(auth.userId, requestId, action);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
