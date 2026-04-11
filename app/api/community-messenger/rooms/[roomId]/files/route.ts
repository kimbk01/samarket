import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { sendCommunityMessengerFileMessage } from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

const MAX_BYTES = 15 * 1024 * 1024;

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

  const { roomId } = await params;
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "room_not_found" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
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

  const safeName = (file.name || "file").replace(/[^\w.\-() ]+/g, "_").trim() || "file";
  const ext = safeName.includes(".") ? safeName.split(".").pop()!.toLowerCase() : "bin";
  const mimeType = (file.type || "application/octet-stream").toLowerCase().trim();
  const path = `${auth.userId}/community/messenger-file/${roomId}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage.from("post-images").upload(path, buf, {
    contentType: mimeType,
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
    roomId,
    filePublicUrl: publicUrl,
    storagePath: path,
    fileName: safeName,
    mimeType,
    fileSizeBytes: file.size,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
