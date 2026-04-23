import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { normalizeHttpUrlString } from "@/lib/philife/http-url-string";
import { enforceImageUploadQuota } from "@/lib/security/rate-limit-presets";
import { assertPublicHttpUrlForImageFetch } from "@/lib/security/remote-image-import-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 기사·외부 이미지 import 전용(일반 ‘파일 선택’ 업로드 5MB와 별도) */
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function detectMimeFromBytes(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    const t = buf.toString("ascii", 3, 6);
    if (t === "87a" || t === "89a") return "image/gif";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function normalizeHeaderMime(t: string | null): string | null {
  if (!t) return null;
  const s = t.split(";")[0]!.trim().toLowerCase();
  if (ALLOWED.has(s)) return s;
  return null;
}

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

  let res: Response;
  try {
    res = await fetch(urlStr, {
      redirect: "follow",
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: fetchHeaders,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "이미지를 불러오지 못했습니다." }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: `이미지를 가져올 수 없습니다. (${res.status})` }, { status: 502 });
  }

  try {
    await assertPublicHttpUrlForImageFetch(res.url);
  } catch {
    return NextResponse.json({ ok: false, error: "허용되지 않는 대상(리다이렉트)입니다." }, { status: 400 });
  }

  const headerMime = normalizeHeaderMime(res.headers.get("content-type"));
  const cl = res.headers.get("content-length");
  if (cl) {
    const n = parseInt(cl, 10);
    if (!Number.isNaN(n) && n > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "이미지는 8MB 이하만 가능합니다." }, { status: 413 });
    }
  }

  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "이미지는 8MB 이하만 가능합니다." }, { status: 413 });
  }
  if (ab.byteLength === 0) {
    return NextResponse.json({ ok: false, error: "빈 응답" }, { status: 400 });
  }

  const buf = Buffer.from(ab);
  const fromMagic = detectMimeFromBytes(buf);
  const mime = fromMagic ?? headerMime;
  if (!mime || !ALLOWED.has(mime)) {
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
  const path = `${auth.userId}/community/${randomUUID()}.${ext}`;

  const { error: upErr } = await sb.storage.from("post-images").upload(path, buf, {
    contentType: mime,
    upsert: false,
  });

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message ?? "업로드 실패" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = sb.storage.from("post-images").getPublicUrl(path);

  return NextResponse.json({ ok: true, url: publicUrl, path });
}
