import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { tagSupabaseCallRequest } from "@/lib/perf/supabase-call-counter";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { prepareMessengerRoomSend } from "@/lib/community-messenger/server/prepare-messenger-room-send";
import {
  cancelMessengerVideoUpload,
  finalizeMessengerVideoUpload,
} from "@/lib/community-messenger/server/messenger-video-upload-send";
import { purgeMessengerMediaStoragePaths } from "@/lib/community-messenger/messenger-media-purge";
import { parseMessengerVideoPath } from "@/lib/community-messenger/upload/messenger-video-upload-policy";
import { MESSENGER_PRIVATE_MEDIA_BUCKET } from "@/lib/community-messenger/media/messenger-media-ref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  videoPath?: unknown;
  durationMs?: unknown;
  width?: unknown;
  height?: unknown;
  clientMessageId?: unknown;
};

/**
 * 채팅 영상 보내기 2단계 — 확정. Body: `{ videoPath, durationMs, width, height, clientMessageId }`.
 * 서버: 경로 소유 검증 → Storage 메타(크기·contentType)와 앞 64바이트 서명 확인 → 메시지 1행(cid 멱등) → bump.
 * 거절·deduped 는 이번 업로드(영상·썸네일) 즉시 삭제.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  /** F3(2026-11-25) 요청 예산 — 동영상 보내기를 따로 센다(`…videos::post`). 셈만 */
  tagSupabaseCallRequest("post");
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:video-upload:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    code: "community_messenger_video_upload_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) return canon.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const sendGuard = await prepareMessengerRoomSend({
    supabase: sb,
    userId: auth.userId,
    roomId: canon.canonicalRoomId,
  });
  if (!sendGuard.ok) {
    // 업로드 후 송신이 막힌 경우 — 본인·이 방 경로만 정리.
    const parsed = parseMessengerVideoPath({ userId: auth.userId, roomId: canon.canonicalRoomId, path: body.videoPath });
    if (parsed.ok) {
      await purgeMessengerMediaStoragePaths(sb, [parsed.videoPath, parsed.thumbPath], {
        roomId: canon.canonicalRoomId,
        bucket: MESSENGER_PRIVATE_MEDIA_BUCKET,
      });
    }
    return NextResponse.json({ ok: false, error: sendGuard.error }, { status: 400 });
  }

  const result = await finalizeMessengerVideoUpload({
    sb,
    userId: auth.userId,
    canonicalRoomId: canon.canonicalRoomId,
    rawRouteRoomId: canon.rawRouteRoomId,
    videoPath: body.videoPath,
    durationMs: body.durationMs,
    width: body.width,
    height: body.height,
    clientMessageId: typeof body.clientMessageId === "string" ? body.clientMessageId.trim() || null : null,
    knownRoom: sendGuard.room,
  });
  return NextResponse.json(result.body, { status: result.status });
}

/** 취소 — 확정 전 ✕. Body: `{ videoPath }`. 메시지가 이미 가리키는 경로는 지우지 않는다. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) return canon.response;
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }
  const result = await cancelMessengerVideoUpload({
    sb,
    userId: auth.userId,
    canonicalRoomId: canon.canonicalRoomId,
    videoPath: body.videoPath,
  });
  return NextResponse.json(result.body, { status: result.status });
}
