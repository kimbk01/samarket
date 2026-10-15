import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { sendCommunityMessengerFileMessage } from "@/lib/community-messenger/service";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { publishMessengerRoomBumpAfterMutation } from "@/lib/community-messenger/server/publish-messenger-room-bump";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { validateMessengerFileUpload } from "@/lib/community-messenger/upload/validate-messenger-file-upload";
import {
  MESSENGER_FILE_UPLOAD_MAX_BYTES,
  deriveMessengerFileExtension,
  sanitizeMessengerFileDisplayName,
} from "@/lib/community-messenger/upload/messenger-file-upload-policy";
import { keepMessengerNotifyAliveAfterAck } from "@/lib/community-messenger/server/keep-messenger-notify-alive-after-ack";
import { assertMessengerRoomSendAllowed } from "@/lib/community-messenger/server/assert-messenger-room-send-allowed";
import { purgeMessengerMediaStoragePaths } from "@/lib/community-messenger/messenger-media-purge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = MESSENGER_FILE_UPLOAD_MAX_BYTES;

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:file-upload:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "파일 업로드 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_file_upload_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }
  const canonicalRoomId = canon.canonicalRoomId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  // CHAT-02: 업로드 전에 공통 송신 가드(참여→방상태→차단→거래→주문종료). 고아 업로드 예방.
  const sendGuard = await assertMessengerRoomSendAllowed({
    supabase: sb,
    userId: auth.userId,
    roomId: canonicalRoomId,
  });
  if (!sendGuard.ok) {
    return NextResponse.json({ ok: false, error: sendGuard.error }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "multipart_required" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }

  /*
   * 표시명 = 원본 파일명(NFC·제어문자/경로 제거·200자) — 한글 등 유니코드 보존(과거 `\w` 치환으로 파괴).
   * 저장 키는 uuid + 안전 확장자(`[a-z0-9]{1,10}`)라 표시명이 Storage 경로에 들어가지 않는다.
   */
  const displayName = sanitizeMessengerFileDisplayName(file.name || "file");
  const ext = deriveMessengerFileExtension(displayName);
  const browserMime = (file.type || "application/octet-stream").toLowerCase().trim();
  const buf = Buffer.from(await file.arrayBuffer());

  // NEW-07: 확장자·MIME·파일 서명이 모두 허용 타입과 일치해야 하며, 저장 contentType 은
  // 브라우저 값이 아닌 정규 안전 타입으로 고정한다(html·svg·js·apk 등 차단, 폴리글랏 방어).
  const validated = validateMessengerFileUpload(buf, ext, browserMime);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 415 });
  }
  const mimeType = validated.canonicalContentType;
  const path = `${auth.userId}/community/messenger-file/${canonicalRoomId}/${randomUUID()}.${validated.ext}`;

  const { error: upErr } = await sb.storage.from("post-images").upload(path, buf, {
    contentType: validated.canonicalContentType,
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message ?? "upload_failed" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = sb.storage.from("post-images").getPublicUrl(path);

  const result = await sendCommunityMessengerFileMessage({
    userId: auth.userId,
    roomId: canonicalRoomId,
    filePublicUrl: publicUrl,
    storagePath: path,
    fileName: displayName,
    mimeType,
    fileSizeBytes: file.size,
    // CHAT-05: 업로드 멱등 키(클라가 재전송 시 동일 값을 보냄).
    clientMessageId: String(form.get("clientMessageId") ?? "").trim() || null,
    onNotifyScheduled: keepMessengerNotifyAliveAfterAck,
  });

  if (!result.ok) {
    // IMG-02: 전송 거절 → 올린 파일 고아 정리.
    await purgeMessengerMediaStoragePaths(sb, [path], { roomId: canonicalRoomId });
    return NextResponse.json(result, { status: 400 });
  }

  if (result.ok) {
    try {
      await publishMessengerRoomBumpAfterMutation({
        rawRouteRoomId: canon.rawRouteRoomId,
        canonicalRoomId,
        fromUserId: auth.userId,
        messageId: result.message?.id,
        messageCreatedAt: result.message?.createdAt,
        messageForBump: result.message ?? null,
      });
    } catch {
      /* best-effort(이미지 라우트와 동일): 전송은 이미 커밋됨 — 수신측은 Postgres Realtime·재요청으로 정합 */
    }
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
