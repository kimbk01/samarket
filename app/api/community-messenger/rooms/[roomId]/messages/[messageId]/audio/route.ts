import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { fetchCommunityMessengerVoicePlaybackBytes } from "@/lib/community-messenger/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ roomId: string; messageId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId, messageId } = await params;
  const result = await fetchCommunityMessengerVoicePlaybackBytes({
    userId: auth.userId,
    roomId,
    messageId,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return new NextResponse(Buffer.from(result.data), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
