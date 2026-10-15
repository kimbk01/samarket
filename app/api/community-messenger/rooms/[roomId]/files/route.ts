import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import {
  MESSENGER_FILE_UPLOAD_MAX_BYTES,
  deriveMessengerFileExtension,
  sanitizeMessengerFileDisplayName,
} from "@/lib/community-messenger/upload/messenger-file-upload-policy";
import { assertMessengerRoomSendAllowed } from "@/lib/community-messenger/server/assert-messenger-room-send-allowed";
import {
  removeMessengerStagedObjects,
  sendMessengerFileUpload,
  takeMessengerStagedObject,
} from "@/lib/community-messenger/server/messenger-media-upload-send";
import { parseMessengerStagedPath } from "@/lib/community-messenger/upload/messenger-direct-upload-policy";

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
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!sendGuard.ok) {
    if (contentType.includes("application/json")) {
      // staged 업로드 후 송신이 막힌 경우 — 본인·이 방 staging 객체만 정리(타인 경로는 손대지 않음).
      const body = (await req.json().catch(() => ({}))) as { stagedPath?: unknown };
      const parsed = parseMessengerStagedPath({
        kind: "file",
        userId: auth.userId,
        roomId: canonicalRoomId,
        path: body.stagedPath,
      });
      if (parsed.ok) await removeMessengerStagedObjects(sb, [parsed.path]);
    }
    return NextResponse.json({ ok: false, error: sendGuard.error }, { status: 400 });
  }

  if (contentType.includes("application/json")) {
    /*
     * D-3 staged direct upload: 클라이언트가 `files/upload-url` 로 받은 서명 URL 로 Storage 에 직접 PUT 한 뒤
     * staging 경로만 보낸다(Vercel 요청 본문 한도 우회). 서버가 내려받아 multipart 와 같은 검증·전송을 수행.
     */
    let body: { stagedPath?: unknown; fileName?: unknown; clientMessageId?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    const parsed = parseMessengerStagedPath({
      kind: "file",
      userId: auth.userId,
      roomId: canonicalRoomId,
      path: body.stagedPath,
    });
    if (!parsed.ok) {
      // 타인·타 방·경로 탈출 경로는 삭제도 하지 않는다(소유 검증 실패).
      return NextResponse.json({ ok: false, error: "staged_path_invalid" }, { status: 400 });
    }
    const displayName = sanitizeMessengerFileDisplayName(typeof body.fileName === "string" ? body.fileName : "file");
    const taken = await takeMessengerStagedObject(sb, parsed.path);
    if (!taken.ok) {
      return NextResponse.json({ ok: false, error: taken.error }, { status: 400 });
    }
    if (deriveMessengerFileExtension(displayName) !== parsed.ext) {
      return NextResponse.json({ ok: false, error: "file_type_mismatch" }, { status: 415 });
    }
    const staged = await sendMessengerFileUpload({
      sb,
      userId: auth.userId,
      canonicalRoomId,
      rawRouteRoomId: canon.rawRouteRoomId,
      buf: taken.buf,
      displayName,
      /* staged 경로는 브라우저 MIME 이 없다 — 확장자·서명으로만 판정(validateMessengerFileUpload 가 정규 타입 부여) */
      browserMime: "application/octet-stream",
      clientMessageId: typeof body.clientMessageId === "string" ? body.clientMessageId.trim() || null : null,
    });
    return NextResponse.json(staged.body, { status: staged.status });
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
  const result = await sendMessengerFileUpload({
    sb,
    userId: auth.userId,
    canonicalRoomId,
    rawRouteRoomId: canon.rawRouteRoomId,
    buf: Buffer.from(await file.arrayBuffer()),
    displayName: sanitizeMessengerFileDisplayName(file.name || "file"),
    browserMime: (file.type || "application/octet-stream").toLowerCase().trim(),
    clientMessageId: String(form.get("clientMessageId") ?? "").trim() || null,
  });
  return NextResponse.json(result.body, { status: result.status });
}
