import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadMeetingOpenChatRoomContext } from "@/lib/meeting-open-chat/api-context";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

type Ctx = { params: Promise<{ meetingId: string; roomId: string }> };

/** 모임 오픈채팅 전용 이미지 — post-images, 사용자/방 하위 경로 (메시지 전송 시 URL 검증과 짝) */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  if (!mid || !rid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const loaded = await loadMeetingOpenChatRoomContext(mid, rid, auth.userId);
  if (!loaded.ok) return loaded.response;

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
    return NextResponse.json({ ok: false, error: "5MB 이하만 가능합니다." }, { status: 413 });
  }
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ ok: false, error: "JPEG, PNG, WebP만 가능합니다." }, { status: 400 });
  }

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const path = `${auth.userId}/meeting-open-chat/${rid}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await loaded.ctx.sb.storage.from("post-images").upload(path, buf, {
    contentType: mime,
    upsert: false,
  });

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message ?? "upload_failed" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = loaded.ctx.sb.storage.from("post-images").getPublicUrl(path);

  return NextResponse.json({
    ok: true,
    url: publicUrl,
    path,
    fileName: file.name?.slice(0, 255) ?? null,
    fileSize: file.size,
  });
}
