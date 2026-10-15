import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { assertMessengerRoomSendAllowed } from "@/lib/community-messenger/server/assert-messenger-room-send-allowed";
import {
  collectMessengerStagedImages,
  removeMessengerStagedObjects,
  sendMessengerImageUploadBatch,
} from "@/lib/community-messenger/server/messenger-media-upload-send";
import type { MessengerImageUploadInput } from "@/lib/community-messenger/server/messenger-image-upload-process";
import {
  MESSENGER_IMAGE_UPLOAD_ALLOWED_MIMES,
  MESSENGER_IMAGE_UPLOAD_MAX_BYTES,
  MESSENGER_IMAGE_UPLOAD_MAX_FILES,
  parseMessengerStagedPath,
} from "@/lib/community-messenger/upload/messenger-direct-upload-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = MESSENGER_IMAGE_UPLOAD_MAX_BYTES;
const ALLOWED = MESSENGER_IMAGE_UPLOAD_ALLOWED_MIMES;
const MAX_FILES = MESSENGER_IMAGE_UPLOAD_MAX_FILES;

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:image-upload:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "사진 업로드 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_image_upload_rate_limited",
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

  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("application/json")) {
    /*
     * D-3 staged direct upload: `images/upload-urls` 로 받은 서명 URL 로 Storage 에 직접 PUT 한 staging 경로들.
     * 서버가 내려받아(즉시 staging 삭제) multipart 와 **같은** 가공·전송 파이프라인을 실행한다 — 앨범은 1메시지.
     */
    const body = (await req.json().catch(() => null)) as { stagedPaths?: unknown; clientMessageId?: unknown } | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    const sendGuard = await assertMessengerRoomSendAllowed({
      supabase: sb,
      userId: auth.userId,
      roomId: canonicalRoomId,
    });
    if (!sendGuard.ok) {
      // 송신 불가 — 본인·이 방 staging 만 정리하고 거부.
      const raw = Array.isArray(body.stagedPaths) ? body.stagedPaths : [];
      const own = raw.flatMap((p) => {
        const parsed = parseMessengerStagedPath({ kind: "image", userId: auth.userId, roomId: canonicalRoomId, path: p });
        return parsed.ok ? [parsed.path] : [];
      });
      await removeMessengerStagedObjects(sb, own);
      return NextResponse.json({ ok: false, error: sendGuard.error }, { status: 400 });
    }
    const collected = await collectMessengerStagedImages({
      sb,
      userId: auth.userId,
      roomId: canonicalRoomId,
      stagedPaths: body.stagedPaths,
    });
    if (!collected.ok) {
      return NextResponse.json({ ok: false, error: collected.error }, { status: collected.status });
    }
    const staged = await sendMessengerImageUploadBatch({
      sb,
      userId: auth.userId,
      canonicalRoomId,
      rawRouteRoomId: canon.rawRouteRoomId,
      images: collected.images,
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

  const fromFiles = form.getAll("files").filter((v): v is File => v instanceof File);
  const single = form.get("file");
  const allFiles: File[] = fromFiles.length > 0 ? fromFiles : single instanceof File ? [single] : [];

  if (allFiles.length === 0) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
  if (allFiles.length > MAX_FILES) {
    return NextResponse.json({ ok: false, error: "too_many_images" }, { status: 400 });
  }

  for (const file of allFiles) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
    }
    const mimeType = (file.type || "").toLowerCase().trim();
    if (!ALLOWED.has(mimeType)) {
      return NextResponse.json({ ok: false, error: "unsupported_image" }, { status: 400 });
    }
  }

  // CHAT-02: 업로드 전에 공통 송신 가드(참여→방상태→차단→거래→주문종료). 고아 업로드도 예방.
  const sendGuard = await assertMessengerRoomSendAllowed({
    supabase: sb,
    userId: auth.userId,
    roomId: canonicalRoomId,
  });
  if (!sendGuard.ok) {
    return NextResponse.json({ ok: false, error: sendGuard.error }, { status: 400 });
  }

  const images: MessengerImageUploadInput[] = [];
  for (const file of allFiles) {
    images.push({ buf: Buffer.from(await file.arrayBuffer()), mimeType: (file.type || "").toLowerCase().trim() });
  }
  const result = await sendMessengerImageUploadBatch({
    sb,
    userId: auth.userId,
    canonicalRoomId,
    rawRouteRoomId: canon.rawRouteRoomId,
    images,
    // CHAT-05: 업로드 멱등 키(클라가 재전송 시 동일 값을 보냄).
    clientMessageId: String(form.get("clientMessageId") ?? "").trim() || null,
  });
  return NextResponse.json(result.body, { status: result.status });
}
