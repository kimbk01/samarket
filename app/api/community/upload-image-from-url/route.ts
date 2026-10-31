import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  COMMUNITY_POST_IMAGE_CACHE_CONTROL,
  uploadPostImageWithDerivatives,
} from "@/lib/media/canonical-image-upload.server";
import { CANONICAL_POST_IMAGE_ALLOWED_MIMES } from "@/lib/media/canonical-image-contract";
import { normalizeHttpUrlString } from "@/lib/philife/http-url-string";
import { enforceImageUploadQuota } from "@/lib/security/rate-limit-presets";
import { assertPublicHttpUrlForImageFetch, fetchPublicUrlWithChecks } from "@/lib/security/remote-image-import-url";
import { detectImageMimeFromBytes, isDecodableGif } from "@/lib/media/image-magic-bytes.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 기사·외부 이미지 import 전용(일반 ‘파일 선택’ 업로드 5MB와 별도) */
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set<string>(CANONICAL_POST_IMAGE_ALLOWED_MIMES);

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * 외부 URL에서 이미지를 서버로 가져와 `post-images`에 올립니다(클립보드 HTML의 img src 등, CORS 회피).
 * 요청·리다이렉트 최종 URL 모두 공개 주소만 허용합니다.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const upRl = await enforceImageUploadQuota(auth.userId, "community_post");
  if (!upRl.ok) return upRl.response;

  let body: { url?: unknown; pageReferer?: unknown };
  try {
    body = (await req.json()) as { url?: unknown; pageReferer?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "JSON body 필요" }, { status: 400 });
  }
  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (!rawUrl) {
    return NextResponse.json({ ok: false, error: "url 필드 필요" }, { status: 400 });
  }
  const urlStr = normalizeHttpUrlString(rawUrl);

  let referer = "";
  const rawRef = typeof body.pageReferer === "string" ? body.pageReferer.trim() : "";
  if (rawRef) {
    const refN = normalizeHttpUrlString(rawRef);
    try {
      await assertPublicHttpUrlForImageFetch(refN);
      referer = refN;
    } catch {
      referer = "";
    }
  }
  if (!referer) {
    try {
      referer = new URL(urlStr).origin + "/";
    } catch {
      referer = "";
    }
  }

  try {
    await assertPublicHttpUrlForImageFetch(urlStr);
  } catch {
    return NextResponse.json({ ok: false, error: "허용되지 않는 주소입니다." }, { status: 400 });
  }

  const fetchHeaders: Record<string, string> = {
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent": BROWSER_UA,
  };
  if (referer) {
    fetchHeaders.Referer = referer;
  }

  /** 리다이렉트 홉별 공개 주소 검사 + 스트림 상한 (CM-P2-15) */
  const fetched = await fetchPublicUrlWithChecks(urlStr, {
    headers: fetchHeaders,
    maxBytes: MAX_BYTES,
    timeoutMs: 20_000,
  });
  if (!fetched.ok) {
    if (fetched.reason === "too_large") {
      return NextResponse.json({ ok: false, error: "이미지는 8MB 이하만 가능합니다." }, { status: 413 });
    }
    if (fetched.reason === "blocked" || fetched.reason === "too_many_redirects") {
      return NextResponse.json({ ok: false, error: "허용되지 않는 대상(리다이렉트)입니다." }, { status: 400 });
    }
    if (fetched.reason === "http") {
      return NextResponse.json(
        { ok: false, error: `이미지를 가져올 수 없습니다. (${fetched.status ?? 0})` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: false, error: "이미지를 불러오지 못했습니다." }, { status: 502 });
  }
  if (fetched.body.byteLength === 0) {
    return NextResponse.json({ ok: false, error: "빈 응답" }, { status: 400 });
  }

  const buf = fetched.body;
  /** 파일 내용(매직 바이트)으로만 판정 — 응답 헤더 MIME 은 신뢰하지 않음 (CM-P2-14) */
  const mime = detectImageMimeFromBytes(buf);
  if (!mime || !ALLOWED.has(mime) || (mime === "image/gif" && !(await isDecodableGif(buf)))) {
    return NextResponse.json({ ok: false, error: "JPEG, PNG, WebP, GIF만 가능합니다." }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 오류" }, { status: 500 });
  }

  const ext =
    mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "jpg";
  const path = `${auth.userId}/community/import/${randomUUID()}.${ext}`;

  try {
    const result = await uploadPostImageWithDerivatives({
      sb,
      originalPath: path,
      rawBuf: buf,
      mimeType: mime,
      cacheControl: COMMUNITY_POST_IMAGE_CACHE_CONTROL,
    });
    return NextResponse.json({ ok: true, url: result.publicUrl, path: result.originalPath });
  } catch (e) {
    console.error("[community/upload-image-from-url]", e);
    return NextResponse.json({ ok: false, error: "업로드 실패" }, { status: 500 });
  }
}
