import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { normalizeHttpUrlString } from "@/lib/philife/http-url-string";
import { parseFallbackNewsImageFromHtmlString, parseOgImageFromHtmlString } from "@/lib/philife/og-image-from-html";
import { assertPublicHttpUrlForImageFetch } from "@/lib/security/remote-image-import-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HTML = 1_200_000;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * 기사/페이지 URL을 서버에서 받아 `og:image`·twitter 썸네일 URL을 돌려줍니다(붙여넣기 폴백).
 * 클라이언트에서 직접 페이지를 읽을 수 없을 때 사용합니다.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: { pageUrl?: unknown };
  try {
    body = (await req.json()) as { pageUrl?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 필요" }, { status: 400 });
  }
  const raw = typeof body.pageUrl === "string" ? body.pageUrl.trim() : "";
  if (!raw) {
    return NextResponse.json({ ok: false, error: "pageUrl 필드 필요" }, { status: 400 });
  }
  const pageStr = normalizeHttpUrlString(raw);

  let initial: URL;
  try {
    initial = await assertPublicHttpUrlForImageFetch(pageStr);
  } catch {
    return NextResponse.json({ ok: false, error: "허용되지 않는 주소입니다." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(initial.href, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "User-Agent": BROWSER_UA,
        Referer: initial.origin + "/",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "페이지를 불러오지 못했습니다." }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: "페이지 응답 오류" }, { status: 502 });
  }

  try {
    await assertPublicHttpUrlForImageFetch(res.url);
  } catch {
    return NextResponse.json({ ok: false, error: "리다이렉트가 허용되지 않습니다." }, { status: 400 });
  }

  let text: string;
  try {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML) {
      return NextResponse.json({ ok: false, error: "페이지가 너무 깁니다." }, { status: 413 });
    }
    const dec = new TextDecoder("utf-8", { fatal: false });
    text = dec.decode(new Uint8Array(buf));
  } catch {
    return NextResponse.json({ ok: false, error: "본문 파싱 실패" }, { status: 502 });
  }

  const rel = parseOgImageFromHtmlString(text) ?? parseFallbackNewsImageFromHtmlString(text);
  if (!rel) {
    return NextResponse.json({ ok: false, error: "대표 이미지(og)나 본문 이미지를 찾지 못했습니다." });
  }
  let abs: string;
  try {
    abs = new URL(rel, res.url).href;
  } catch {
    return NextResponse.json({ ok: false, error: "이미지 URL 형식 오류" });
  }
  if (!/^https?:\/\//i.test(abs)) {
    return NextResponse.json({ ok: false, error: "이미지 URL이 아닙니다." });
  }

  try {
    await assertPublicHttpUrlForImageFetch(abs);
  } catch {
    return NextResponse.json({ ok: false, error: "이미지 주소가 허용되지 않습니다." });
  }

  return NextResponse.json({ ok: true, imageUrl: abs, pageUrl: res.url });
}
