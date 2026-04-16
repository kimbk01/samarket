import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { sendCommunityMessengerImageMessage } from "@/lib/community-messenger/service";
import { invalidateRoomBootstrapRouteCacheForRoom } from "@/lib/community-messenger/server/room-bootstrap-route-cache";
import { publishCommunityMessengerRoomBumpFromServer } from "@/lib/community-messenger/realtime/room-bump-broadcast-server";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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

  const mimeType = (file.type || "").toLowerCase().trim();
  if (!ALLOWED.has(mimeType)) {
    return NextResponse.json({ ok: false, error: "unsupported_image" }, { status: 400 });
  }

  const ext =
    mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : mimeType === "image/gif" ? "gif" : "jpg";
  const path = `${auth.userId}/community/messenger-image/${roomId}/${randomUUID()}.${ext}`;
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

  const result = await sendCommunityMessengerImageMessage({
    userId: auth.userId,
    roomId,
    imagePublicUrl: publicUrl,
    storagePath: path,
    mimeType,
  });

  if (result.ok) {
    invalidateRoomBootstrapRouteCacheForRoom(roomId);
    void publishCommunityMessengerRoomBumpFromServer({ roomId, fromUserId: auth.userId });
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
