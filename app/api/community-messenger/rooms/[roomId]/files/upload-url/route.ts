import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { assertMessengerRoomSendAllowed } from "@/lib/community-messenger/server/assert-messenger-room-send-allowed";
import {
  createMessengerStagedUploadUrls,
  precheckMessengerFileUploadUrlRequest,
} from "@/lib/community-messenger/server/messenger-media-upload-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * D-3 staged direct upload 1단계(파일) — Vercel 요청 본문 한도(~4.5MB)를 넘는 파일(최대 15MB)을 위해
 * staging 경로에 서명 업로드 URL 을 발급한다. 클라이언트는 Storage 에 직접 PUT 한 뒤
 * `POST …/files` 에 JSON `{ stagedPath, fileName, clientMessageId }` 로 확정한다(서버가 바이트 재검증).
 * 선례: `lib/launch-intro/server.ts` createLaunchIntroDraftUpload.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:file-upload-url:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "파일 업로드 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_file_upload_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) return canon.response;
  const canonicalRoomId = canon.canonicalRoomId;

  const body = (await req.json().catch(() => null)) as { fileName?: unknown; bytes?: unknown } | null;
  if (!body) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const pre = precheckMessengerFileUploadUrlRequest({ fileName: body.fileName, bytes: body.bytes });
  if (!pre.ok) return NextResponse.json({ ok: false, error: pre.error }, { status: pre.status });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  // CHAT-02: 업로드 전에 공통 송신 가드 — 보낼 수 없는 방이면 URL 자체를 발급하지 않는다.
  const sendGuard = await assertMessengerRoomSendAllowed({ supabase: sb, userId: auth.userId, roomId: canonicalRoomId });
  if (!sendGuard.ok) return NextResponse.json({ ok: false, error: sendGuard.error }, { status: 400 });

  const created = await createMessengerStagedUploadUrls({
    sb,
    kind: "file",
    userId: auth.userId,
    roomId: canonicalRoomId,
    exts: [pre.ext],
  });
  if (!created.ok) return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 500 });
  const upload = created.uploads[0]!;
  return NextResponse.json({ ok: true, path: upload.path, signedUrl: upload.signedUrl });
}
