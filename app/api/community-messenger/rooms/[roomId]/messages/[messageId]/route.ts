import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { deleteCommunityMessengerVoiceMessage } from "@/lib/community-messenger/service";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ roomId: string; messageId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId, messageId } = await params;
  const result = await deleteCommunityMessengerVoiceMessage({
    userId: auth.userId,
    roomId,
    messageId,
  });

  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "forbidden" || result.error === "unsupported_type"
          ? 403
          : result.error === "bad_request"
            ? 400
            : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
