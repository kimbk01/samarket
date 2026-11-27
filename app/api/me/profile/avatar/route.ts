import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { uploadAvatarWithDerivatives } from "@/lib/media/canonical-image-upload.server";
import { enforceImageUploadQuota } from "@/lib/security/rate-limit-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * 프로필 사진 — post-images + upload-time thumb derivative.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const upRl = await enforceImageUploadQuota(auth.userId, "profile_avatar");
  if (!upRl.ok) return upRl.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "service_unavailable", code: "service_unavailable" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "multipart_required", code: "multipart_required" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required", code: "file_required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "too_large", code: "too_large" }, { status: 413 });
  }
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ ok: false, error: "unsupported_type", code: "unsupported_type" }, { status: 400 });
  }

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const uid = auth.userId;
  const path = `${uid}/profile/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    const result = await uploadAvatarWithDerivatives({
      sb,
      originalPath: path,
      rawBuf: buf,
      mimeType: mime,
    });
    return NextResponse.json({ ok: true, url: result.publicUrl, path: result.originalPath });
  } catch (e) {
    console.error("[profile/avatar]", e);
    return NextResponse.json({ ok: false, error: "upload_failed", code: "upload_failed" }, { status: 500 });
  }
}
