import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  COMMUNITY_POST_IMAGE_CACHE_CONTROL,
  uploadPostImageWithDerivatives,
} from "@/lib/media/canonical-image-upload.server";
import { CANONICAL_POST_IMAGE_ALLOWED_MIMES } from "@/lib/media/canonical-image-contract";
import { enforceImageUploadQuota } from "@/lib/security/rate-limit-presets";
import { detectImageMimeFromBytes, isDecodableGif } from "@/lib/media/image-magic-bytes.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set<string>(CANONICAL_POST_IMAGE_ALLOWED_MIMES);

/**
 * 동네생활 글 이미지 — post-images + upload-time canonical derivatives.
 * 오류는 `code` 만 돌려준다 — 문구는 화면이 언어별로(`communityImageUploadErrorKey`). 감사 §11 R4.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const upRl = await enforceImageUploadQuota(auth.userId, "community_post");
  if (!upRl.ok) return upRl.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, code: "server_config" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, code: "multipart_required" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, code: "file_required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, code: "too_large" }, { status: 413 });
  }
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ ok: false, code: "unsupported_type" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  /** 형식은 파일 내용으로 판정 — 보낸 MIME 과 다르거나 GIF 가 디코딩되지 않으면 거부 (CM-P2-14) */
  const sniffed = detectImageMimeFromBytes(buf);
  if (!sniffed || !ALLOWED.has(sniffed) || (sniffed === "image/gif" && !(await isDecodableGif(buf)))) {
    return NextResponse.json({ ok: false, code: "not_image" }, { status: 400 });
  }
  const ext =
    sniffed === "image/png" ? "png" : sniffed === "image/webp" ? "webp" : sniffed === "image/gif" ? "gif" : "jpg";
  const uid = auth.userId;
  const path = `${uid}/community/${randomUUID()}.${ext}`;

  try {
    const result = await uploadPostImageWithDerivatives({
      sb,
      originalPath: path,
      rawBuf: buf,
      mimeType: sniffed,
      cacheControl: COMMUNITY_POST_IMAGE_CACHE_CONTROL,
    });
    return NextResponse.json({ ok: true, url: result.publicUrl, path: result.originalPath });
  } catch (e) {
    console.error("[community/upload-image]", e);
    return NextResponse.json({ ok: false, code: "upload_failed" }, { status: 500 });
  }
}
