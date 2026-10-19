import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  fetchCommunityMessengerVoicePlaybackBytes,
  resolveCommunityMessengerVoicePlaybackSource,
} from "@/lib/community-messenger/service";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import {
  resolveVoicePlaybackContentType,
  sliceAudioBufferForRangeRequest,
} from "@/lib/community-messenger/voice-playback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SEC = 60;

async function streamVoiceFromStorageWithRange(input: {
  storageBucket: string;
  storagePath: string;
  contentType: string;
  rangeHeader: string | null;
}): Promise<NextResponse | null> {
  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb.storage
      .from(input.storageBucket)
      .createSignedUrl(input.storagePath, SIGNED_URL_TTL_SEC);
    const signedUrl = data?.signedUrl;
    if (error || !signedUrl) return null;

    const range = input.rangeHeader?.trim();
    const upstream = await fetch(signedUrl, {
      headers: range && /^bytes=/i.test(range) ? { Range: range } : undefined,
      cache: "no-store",
    });
    if (upstream.status === 416) {
      const cr = upstream.headers.get("content-range");
      await upstream.body?.cancel().catch(() => {});
      return new NextResponse(null, { status: 416, headers: cr ? { "Content-Range": cr } : undefined });
    }
    if ((upstream.status !== 200 && upstream.status !== 206) || !upstream.body) {
      await upstream.body?.cancel().catch(() => {});
      return null;
    }
    const headers: Record<string, string> = {
      /* 저장 MIME 이 비정상(octet-stream 등)이어도 WebView 디코더가 인식하도록 정규화 값 사용 */
      "Content-Type": input.contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    };
    const len = upstream.headers.get("content-length");
    if (len) headers["Content-Length"] = len;
    const cr = upstream.headers.get("content-range");
    if (upstream.status === 206 && cr) headers["Content-Range"] = cr;
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; messageId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:voice-audio:${getRateLimitKey(req, auth.userId)}`,
    limit: 300,
    windowMs: 60_000,
    message: "음성 재생 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_voice_audio_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId, messageId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }
  const rangeHeader = req.headers.get("range");

  const source = await resolveCommunityMessengerVoicePlaybackSource({
    userId: auth.userId,
    roomId: canon.canonicalRoomId,
    messageId,
  });
  if (!source.ok) {
    return NextResponse.json({ ok: false, error: source.error }, { status: source.status });
  }

  /*
   * 1차: 짧은 서명 URL 로 Storage 에 Range 를 그대로 위임해 본문을 스트리밍한다.
   * (Range 요청마다 객체 전체를 내려받지 않음.) 실패 시 아래 전체 다운로드 경로로 폴백.
   */
  const streamed = await streamVoiceFromStorageWithRange({
    storageBucket: source.storageBucket,
    storagePath: source.storagePath,
    contentType: resolveVoicePlaybackContentType(source.contentType, source.storagePath),
    rangeHeader,
  });
  if (streamed) return streamed;

  const result = await fetchCommunityMessengerVoicePlaybackBytes({
    userId: auth.userId,
    roomId: canon.canonicalRoomId,
    messageId,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  const body = Buffer.from(result.data);
  const contentType = resolveVoicePlaybackContentType(result.contentType, result.storagePath);
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
