import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { fetchCommunityMessengerVoicePlaybackBytes } from "@/lib/community-messenger/service";
import {
  resolveVoicePlaybackContentType,
  sliceAudioBufferForRangeRequest,
} from "@/lib/community-messenger/voice-playback";

export async function GET(
  req: Request,
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

  const body = Buffer.from(result.data);
  const contentType = resolveVoicePlaybackContentType(result.contentType, result.storagePath);
  const rangeHeader = req.headers.get("range");
  const sliced = sliceAudioBufferForRangeRequest(body, rangeHeader);

  if (!sliced.ok) {
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": sliced.contentRangeStar },
    });
  }

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Length": String(sliced.contentLength),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  if (sliced.contentRange) {
    headers["Content-Range"] = sliced.contentRange;
  }

  return new NextResponse(new Uint8Array(sliced.body), {
    status: sliced.status,
    headers,
  });
}
