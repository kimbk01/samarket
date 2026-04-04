import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { updateCommunityMessengerCallSession } from "@/lib/community-messenger/service";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: {
    action?: "accept" | "reject" | "cancel" | "end" | "missed";
    durationSeconds?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (
    body.action !== "accept" &&
    body.action !== "reject" &&
    body.action !== "cancel" &&
    body.action !== "end" &&
    body.action !== "missed"
  ) {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }

  const { sessionId } = await params;
  const result = await updateCommunityMessengerCallSession({
    userId: auth.userId,
    sessionId,
    action: body.action,
    durationSeconds: Number(body.durationSeconds ?? 0),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
