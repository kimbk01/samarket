import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { normalizeHttpUrlString } from "@/lib/philife/http-url-string";
import { parseFallbackNewsImageFromHtmlString, parseOgImageFromHtmlString } from "@/lib/philife/og-image-from-html";
import { assertPublicHttpUrlForImageFetch, fetchPublicUrlWithChecks } from "@/lib/security/remote-image-import-url";
import { enforceImageUploadQuota } from "@/lib/security/rate-limit-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HTML = 1_200_000;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** 오류는 코드만 — 문구는 화면이 `COMMUNITY_OG_IMAGE_ERROR_KEYS` 로 고른다 (재감사 2026-11-27) */
function ogError(code: string, status?: number) {
  return NextResponse.json({ ok: false, error: code, code }, status ? { status } : undefined);
}

/**
 * 기사/페이지 URL을 서버에서 받아 `og:image`·twitter 썸네일 URL을 돌려줍니다(붙여넣기 폴백).
 * 클라이언트에서 직접 페이지를 읽을 수 없을 때 사용합니다.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  /** 원격 페이지 가져오기도 이미지 import 와 같은 한도 — 무제한 프록시 방지 (CM-P2-15) */
  const rl = await enforceImageUploadQuota(auth.userId, "community_post");
  if (!rl.ok) return rl.response;

  let body: { pageUrl?: unknown };
  try {
    body = (await req.json()) as { pageUrl?: unknown };
  } catch {
    return ogError("invalid_json", 400);
  }
  const raw = typeof body.pageUrl === "string" ? body.pageUrl.trim() : "";
  if (!raw) {
    return ogError("page_url_required", 400);
  }
  const pageStr = normalizeHttpUrlString(raw);

  let initial: URL;
  try {
    initial = await assertPublicHttpUrlForImageFetch(pageStr);
  } catch {
    return ogError("url_not_allowed", 400);
  }

  /** 리다이렉트 홉별 공개 주소 검사 + 스트림 상한 (CM-P2-15) */
  const fetched = await fetchPublicUrlWithChecks(initial.href, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "User-Agent": BROWSER_UA,
      Referer: initial.origin + "/",
    },
    maxBytes: MAX_HTML,
    timeoutMs: 15_000,
  });
  if (!fetched.ok) {
    if (fetched.reason === "too_large") {
      return ogError("page_too_large", 413);
    }
    if (fetched.reason === "blocked" || fetched.reason === "too_many_redirects") {
      return ogError("redirect_not_allowed", 400);
    }
    if (fetched.reason === "http") {
      return ogError("page_fetch_failed", 502);
    }
    return ogError("page_fetch_failed", 502);
  }

  let text: string;
  try {
    const buf = fetched.body;
    const dec = new TextDecoder("utf-8", { fatal: false });
    text = dec.decode(new Uint8Array(buf));
  } catch {
    return ogError("page_parse_failed", 502);
  }

  const rel = parseOgImageFromHtmlString(text) ?? parseFallbackNewsImageFromHtmlString(text);
  if (!rel) {
    return ogError("og_not_found");
  }
  let abs: string;
  try {
    abs = new URL(rel, fetched.finalUrl).href;
  } catch {
    return ogError("image_url_invalid");
  }
  if (!/^https?:\/\//i.test(abs)) {
    return ogError("image_url_invalid");
  }

  try {
    await assertPublicHttpUrlForImageFetch(abs);
  } catch {
    return ogError("image_url_not_allowed");
  }

  return NextResponse.json({ ok: true, imageUrl: abs, pageUrl: fetched.finalUrl });
}
