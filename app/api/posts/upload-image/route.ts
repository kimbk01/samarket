import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { uploadPostImageWithDerivatives } from "@/lib/media/canonical-image-upload.server";
import { CANONICAL_POST_IMAGE_ALLOWED_MIMES } from "@/lib/media/canonical-image-contract";
import { enforceImageUploadQuota } from "@/lib/security/rate-limit-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set<string>(CANONICAL_POST_IMAGE_ALLOWED_MIMES);

/**
 * P-4 (I11): 확장자·Content-Type 이 아니라 **파일 첫 바이트**로 실제 이미지인지 확인한다.
 * JPEG · PNG · GIF · WebP · HEIC/HEIF(ftyp) 만 통과.
 */
function sniffIsAllowedImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  if (buf.subarray(0, 4).toString("latin1") === "GIF8") return true;
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return true;
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("latin1").toLowerCase();
    return ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "avif"].includes(brand);
  }
  return false;
}

/** 거래 글 이미지 — post-images + upload-time canonical derivatives. */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const upRl = await enforceImageUploadQuota(auth.userId, "trade_write");
  if (!upRl.ok) return upRl.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 오류" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "multipart 필요" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file 필드 필요" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "8MB 이하만 가능합니다." }, { status: 413 });
  }
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return NextResponse.json(
      { ok: false, error: "JPEG, PNG, WebP, GIF, HEIC만 가능합니다." },
      { status: 400 }
    );
  }

  const ext =
    mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "jpg";
  const uid = auth.userId.replace(/[^a-zA-Z0-9_-]/g, "") || "anon";
  const path = `${uid}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  if (!sniffIsAllowedImage(buf)) {
    return NextResponse.json(
      { ok: false, error: "JPEG, PNG, WebP, GIF, HEIC만 가능합니다." },
      { status: 400 }
    );
  }

  try {
    const result = await uploadPostImageWithDerivatives({
      sb,
      originalPath: path,
      rawBuf: buf,
      mimeType: mime,
    });
    return NextResponse.json({
      ok: true,
      url: result.publicUrl,
      path: result.originalPath,
      derivatives: result.derivativePaths,
    });
  } catch (e) {
    console.error("[posts/upload-image]", e);
    return NextResponse.json({ ok: false, error: "업로드 실패" }, { status: 500 });
  }
}
