import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { prepareMessengerRoomSend } from "@/lib/community-messenger/server/prepare-messenger-room-send";
import { createMessengerVideoUploadUrls } from "@/lib/community-messenger/server/messenger-video-upload-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 채팅 영상 보내기 1단계 — 송신 가드·크기·길이·형식 사전 검사 후 영상·썸네일 서명 업로드 URL(최종 경로) 발급.
 * 클라이언트는 Storage 로 직접 PUT 하고 `POST …/videos` 로 확정한다(서버는 파일을 내려받지 않음).
 * Body: `{ bytes, durationMs, ext: "mp4" | "mov" }`
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:video-upload-url:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    code: "community_messenger_video_upload_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) return canon.response;

  const body = (await req.json().catch(() => null)) as { bytes?: unknown; durationMs?: unknown; ext?: unknown } | null;
  if (!body) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  // 보낼 수 없는 방이면 URL 자체를 발급하지 않는다(고아 업로드 예방).
  const sendGuard = await prepareMessengerRoomSend({
    supabase: sb,
    userId: auth.userId,
    roomId: canon.canonicalRoomId,
    readmit: false,
  });
  if (!sendGuard.ok) return NextResponse.json({ ok: false, error: sendGuard.error }, { status: 400 });

  const result = await createMessengerVideoUploadUrls({
    sb,
    userId: auth.userId,
    roomId: canon.canonicalRoomId,
    bytes: body.bytes,
    durationMs: body.durationMs,
    ext: body.ext,
  });
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
