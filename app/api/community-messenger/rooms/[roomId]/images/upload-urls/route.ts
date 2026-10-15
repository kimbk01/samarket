import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { assertMessengerRoomSendAllowed } from "@/lib/community-messenger/server/assert-messenger-room-send-allowed";
import {
  createMessengerStagedUploadUrls,
  precheckMessengerImageUploadUrlsRequest,
} from "@/lib/community-messenger/server/messenger-media-upload-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * D-3 staged direct upload 1단계(이미지 앨범) — 최대 10장·장당 8MB. 장마다 staging 서명 업로드 URL 발급.
 * 클라이언트는 Storage 에 직접 PUT 한 뒤 `POST …/images` 에 JSON `{ stagedPaths, clientMessageId }` 로 확정
 * (서버가 multipart 와 같은 sharp 가공 파이프라인 실행 — 앨범은 1메시지 유지).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:image-upload-url:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "사진 업로드 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_image_upload_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) return canon.response;
  const canonicalRoomId = canon.canonicalRoomId;

  const body = (await req.json().catch(() => null)) as { items?: unknown } | null;
  if (!body) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const pre = precheckMessengerImageUploadUrlsRequest(body.items);
  if (!pre.ok) return NextResponse.json({ ok: false, error: pre.error }, { status: pre.status });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const sendGuard = await assertMessengerRoomSendAllowed({ supabase: sb, userId: auth.userId, roomId: canonicalRoomId });
  if (!sendGuard.ok) return NextResponse.json({ ok: false, error: sendGuard.error }, { status: 400 });

  const created = await createMessengerStagedUploadUrls({
    sb,
    kind: "image",
    userId: auth.userId,
    roomId: canonicalRoomId,
    exts: pre.exts,
  });
  if (!created.ok) return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 500 });
  return NextResponse.json({
    ok: true,
    uploads: created.uploads.map((u) => ({ path: u.path, signedUrl: u.signedUrl })),
  });
}
